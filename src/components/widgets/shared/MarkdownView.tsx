import type { ReactNode } from 'react';
import { parseInline, type InlineToken, type MdBlock } from '../../../lib/obsidianMarkdown';
import ExcalidrawEmbed from './ExcalidrawEmbed';
import './MarkdownView.css';

/**
 * Renders the token stream from lib/obsidianMarkdown.ts as React elements.
 * No HTML string ever exists in this path — see that module's header for why
 * that matters for vault content.
 */

function renderInline(source: string, keyPrefix: string): ReactNode[] {
  return parseInline(source).map((tok: InlineToken, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (tok.type) {
      case 'bold':   return <strong key={key}>{tok.value}</strong>;
      case 'italic': return <em key={key}>{tok.value}</em>;
      case 'code':   return <code key={key} className="sg-md-code">{tok.value}</code>;
      case 'tag':    return <span key={key} className="sg-md-tag">{tok.value}</span>;
      case 'link':
        return (
          <a key={key} className="sg-md-link" href={tok.href} target="_blank" rel="noreferrer noopener">
            {tok.label}
          </a>
        );
      case 'wikilink':
        // Rendered as a non-navigating span: resolving a wikilink to a vault
        // path needs Obsidian's own link resolution, which the REST API does
        // not expose. Showing it styled but inert beats guessing wrong.
        return <span key={key} className="sg-md-wikilink">{tok.label}</span>;
      case 'embed':
        return <ExcalidrawEmbed key={key} target={tok.target} />;
      default:
        return <span key={key}>{tok.value}</span>;
    }
  });
}

interface Props {
  blocks: MdBlock[];
  /** Supplied by widgets that allow ticking tasks off; omit for read-only. */
  onToggleTask?: (block: Extract<MdBlock, { kind: 'task' }>) => void;
  /** Disables task interaction while a write is in flight. */
  busy?: boolean;
}

export default function MarkdownView({ blocks, onToggleTask, busy = false }: Props) {
  return (
    <div className="sg-md">
      {blocks.map((block) => {
        const key = `${block.kind}-${block.lineIndex}`;

        switch (block.kind) {
          case 'heading': {
            const level = Math.min(block.level, 6);
            return (
              <div key={key} className={`sg-md-h sg-md-h${level}`}>
                {renderInline(block.text, key)}
              </div>
            );
          }

          case 'task':
            return (
              <label
                key={key}
                className={`sg-md-task${block.checked ? ' sg-md-task--done' : ''}${onToggleTask ? '' : ' sg-md-task--static'}`}
                style={block.depth ? { paddingLeft: `${block.depth * 14}px` } : undefined}
                onPointerDown={e => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  className="sg-md-checkbox"
                  checked={block.checked}
                  disabled={!onToggleTask || busy}
                  onChange={() => onToggleTask?.(block)}
                />
                <span className="sg-md-task-text">{renderInline(block.text, key)}</span>
              </label>
            );

          case 'bullet':
            return (
              <div
                key={key}
                className="sg-md-bullet"
                style={block.depth ? { paddingLeft: `${block.depth * 14}px` } : undefined}
              >
                <span className="sg-md-bullet-dot" aria-hidden="true">•</span>
                <span>{renderInline(block.text, key)}</span>
              </div>
            );

          case 'quote':
            return <div key={key} className="sg-md-quote">{renderInline(block.text, key)}</div>;

          case 'code':
            return <pre key={key} className="sg-md-pre">{block.text}</pre>;

          case 'hr':
            return <hr key={key} className="sg-md-hr" />;

          default:
            return <p key={key} className="sg-md-p">{renderInline(block.text, key)}</p>;
        }
      })}
    </div>
  );
}
