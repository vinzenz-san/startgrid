/**
 * A deliberately small Markdown parser, covering only what the Obsidian
 * widgets actually display.
 *
 * It emits *tokens*, never HTML strings — components/widgets/shared/
 * MarkdownView.tsx turns those into React elements. That is the whole point:
 * a vault routinely contains clipped web pages, and rendering any of it
 * through `dangerouslySetInnerHTML` would hand that content script execution
 * on the new tab page. With tokens there is no injection surface at all.
 *
 * Every block carries its absolute `lineIndex` in the source, which is what
 * makes the Daily Note widget's checkbox write-back able to target one exact
 * line without reformatting the rest of the note.
 */

// ── Inline tokens ─────────────────────────────────────────────────────────────

export type InlineToken =
  | { type: 'text';     value: string }
  | { type: 'bold';     value: string }
  | { type: 'italic';   value: string }
  | { type: 'code';     value: string }
  | { type: 'link';     label: string; href: string }
  | { type: 'wikilink'; label: string; target: string }
  | { type: 'embed';    target: string }
  | { type: 'tag';      value: string };

/** Only embed targets this renderer knows how to resolve — see
 *  lib/obsidianExcalidraw.ts. Everything else (`![[image.png]]`,
 *  `![[other note]]`) falls back to the existing inert `!` + wikilink
 *  rendering, unchanged. */
const EXCALIDRAW_EMBED_RE = /\.excalidraw(?:\.md)?$/i;

// Ordered alternation: code first (backticks protect their contents), then
// embeds before wikilinks (an embed is a superset pattern — `![[x]]` would
// otherwise be read as literal `!` + wikilink `[[x]]`), then links, then
// emphasis, then tags.
const INLINE_RE =
  /`([^`\n]+)`|!\[\[([^\]\n]+)\]\]|\[\[([^\]\n]+)\]\]|\[([^\]\n]*)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_|(#[A-Za-z0-9_][A-Za-z0-9_/-]*)/g;

/** Only schemes that are safe to hand to the browser as a navigation target.
 *  Anything else (notably `javascript:`) falls back to plain text. */
function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^obsidian:\/\//i.test(trimmed)) return trimmed;
  if (/^mailto:/i.test(trimmed)) return trimmed;
  return null;
}

/** Tokenizes one line/span of inline Markdown (bold, italic, code, links, wikilinks, embeds, tags) into `InlineToken`s — never HTML. */
export function parseInline(source: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let cursor = 0;

  INLINE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_RE.exec(source)) !== null) {
    const [full, code, embed, wiki, linkLabel, linkHref, boldStar, boldUnd, itaStar, itaUnd, tag] = match;

    // A `#` only starts a tag at the beginning of a line or after whitespace —
    // otherwise `foo#bar` and URL fragments would both light up as tags.
    if (tag !== undefined) {
      const prev = match.index > 0 ? source[match.index - 1] : '';
      if (prev && !/\s/.test(prev)) continue;
    }

    if (match.index > cursor) {
      tokens.push({ type: 'text', value: source.slice(cursor, match.index) });
    }

    if (code !== undefined) {
      tokens.push({ type: 'code', value: code });
    } else if (embed !== undefined) {
      // `![[target|label]]` — an alias is valid syntax here too, but embeds
      // render their own content, so any label is discarded.
      const target = embed.split('|')[0].trim();
      if (EXCALIDRAW_EMBED_RE.test(target)) {
        tokens.push({ type: 'embed', target });
      } else {
        // Unsupported embed kind (image, other note, …) — same inert
        // rendering as before this change existed: literal `!` then the
        // wikilink span.
        tokens.push({ type: 'text', value: '!' });
        const [wikiTarget, wikiLabel] = embed.split('|');
        tokens.push({ type: 'wikilink', target: wikiTarget.trim(), label: (wikiLabel ?? wikiTarget).trim() });
      }
    } else if (wiki !== undefined) {
      // `[[target|label]]` — the alias after the pipe is what gets displayed.
      const [target, label] = wiki.split('|');
      tokens.push({ type: 'wikilink', target: target.trim(), label: (label ?? target).trim() });
    } else if (linkHref !== undefined) {
      const href = safeHref(linkHref);
      if (href) tokens.push({ type: 'link', label: linkLabel || href, href });
      else tokens.push({ type: 'text', value: full });
    } else if (boldStar !== undefined || boldUnd !== undefined) {
      tokens.push({ type: 'bold', value: (boldStar ?? boldUnd)! });
    } else if (itaStar !== undefined || itaUnd !== undefined) {
      tokens.push({ type: 'italic', value: (itaStar ?? itaUnd)! });
    } else if (tag !== undefined) {
      tokens.push({ type: 'tag', value: tag });
    }

    cursor = match.index + full.length;
  }

  if (cursor < source.length) {
    tokens.push({ type: 'text', value: source.slice(cursor) });
  }
  return tokens;
}

// ── Block tokens ──────────────────────────────────────────────────────────────

export type MdBlock =
  | { kind: 'heading';   lineIndex: number; level: number; text: string }
  | { kind: 'task';      lineIndex: number; checked: boolean; text: string; depth: number }
  | { kind: 'bullet';    lineIndex: number; text: string; depth: number }
  | { kind: 'quote';     lineIndex: number; text: string }
  | { kind: 'code';      lineIndex: number; text: string }
  | { kind: 'hr';        lineIndex: number }
  | { kind: 'paragraph'; lineIndex: number; text: string };

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const TASK_RE    = /^(\s*)[-*+]\s+\[([ xX])\]\s*(.*)$/;
const BULLET_RE  = /^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/;
const QUOTE_RE   = /^\s*>\s?(.*)$/;
const HR_RE      = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE_RE   = /^\s*```/;

/** One indent level is two spaces or one tab, capped so deep nesting doesn't
 *  push content off a narrow widget. */
function indentDepth(indent: string): number {
  const spaces = indent.replace(/\t/g, '  ').length;
  return Math.min(Math.floor(spaces / 2), 4);
}

/** Splits raw Markdown source into block-level `MdBlock`s (headings, tasks, bullets, quotes, code fences, paragraphs), each tagged with its source `lineIndex`. */
export function parseMarkdown(source: string): MdBlock[] {
  const lines = source.split(/\r?\n/);
  const blocks: MdBlock[] = [];

  let fenceStart: number | null = null;
  let fenceLines: string[] = [];

  lines.forEach((line, lineIndex) => {
    if (FENCE_RE.test(line)) {
      if (fenceStart === null) {
        fenceStart = lineIndex;
        fenceLines = [];
      } else {
        blocks.push({ kind: 'code', lineIndex: fenceStart, text: fenceLines.join('\n') });
        fenceStart = null;
      }
      return;
    }
    if (fenceStart !== null) { fenceLines.push(line); return; }

    if (!line.trim()) return;

    // YAML frontmatter delimiters and horizontal rules look identical; a `---`
    // on line 0 is frontmatter, which the widgets don't display.
    if (HR_RE.test(line)) {
      if (lineIndex !== 0) blocks.push({ kind: 'hr', lineIndex });
      return;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', lineIndex, level: heading[1].length, text: heading[2].trim() });
      return;
    }

    // Tasks must be tested before bullets — every task is also a valid bullet.
    const task = TASK_RE.exec(line);
    if (task) {
      blocks.push({
        kind: 'task',
        lineIndex,
        checked: task[2].toLowerCase() === 'x',
        text: task[3],
        depth: indentDepth(task[1]),
      });
      return;
    }

    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      blocks.push({ kind: 'bullet', lineIndex, text: bullet[2], depth: indentDepth(bullet[1]) });
      return;
    }

    const quote = QUOTE_RE.exec(line);
    if (quote) {
      blocks.push({ kind: 'quote', lineIndex, text: quote[1] });
      return;
    }

    blocks.push({ kind: 'paragraph', lineIndex, text: line.trim() });
  });

  // An unclosed fence still has content worth showing.
  if (fenceStart !== null) {
    blocks.push({ kind: 'code', lineIndex: fenceStart, text: fenceLines.join('\n') });
  }

  return blocks;
}

/**
 * Narrow a parsed note to the content beneath one heading, stopping at the
 * next heading of the same or higher level. Matching is case-insensitive and
 * ignores any leading `#` the user typed into the setting.
 * Returns all blocks unchanged when the heading isn't found, so a renamed
 * section degrades to "shows the whole note" rather than "shows nothing".
 */
export function sliceSection(blocks: MdBlock[], heading: string): MdBlock[] {
  const wanted = heading.trim().replace(/^#+\s*/, '').toLowerCase();
  if (!wanted) return blocks;

  const startIdx = blocks.findIndex(
    b => b.kind === 'heading' && b.text.toLowerCase() === wanted,
  );
  if (startIdx === -1) return blocks;

  const startLevel = (blocks[startIdx] as Extract<MdBlock, { kind: 'heading' }>).level;
  const rest = blocks.slice(startIdx + 1);
  const endIdx = rest.findIndex(b => b.kind === 'heading' && b.level <= startLevel);
  return endIdx === -1 ? rest : rest.slice(0, endIdx);
}

/** Flatten inline markup to plain text — used for excerpts and titles. */
export function stripInline(source: string): string {
  return parseInline(source)
    .map(tok => {
      switch (tok.type) {
        case 'link':
        case 'wikilink': return tok.label;
        case 'embed':    return `[${tok.target}]`;
        case 'tag':      return tok.value;
        default:         return tok.value;
      }
    })
    .join('')
    .trim();
}

/**
 * Flip one task line's checkbox in the raw source, without touching anything
 * else. Returns null when `lineIndex` no longer holds a task whose text
 * matches `expectedText` — the caller treats that as "the note changed under
 * us" and refuses to write. See useObsidianDaily.ts.
 */
export function toggleTaskLine(
  source: string,
  lineIndex: number,
  expectedText: string,
  checked: boolean,
): string | null {
  const lines = source.split(/\r?\n/);
  const line = lines[lineIndex];
  if (line === undefined) return null;

  const task = TASK_RE.exec(line);
  if (!task || task[3] !== expectedText) return null;

  lines[lineIndex] = line.replace(/\[([ xX])\]/, checked ? '[x]' : '[ ]');
  return lines.join('\n');
}
