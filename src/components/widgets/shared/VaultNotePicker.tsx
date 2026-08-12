import { useEffect, useState } from 'react';
import { SettingsRow, ActionButton } from '../../shared/Form';
import { useSettings } from '../../../contexts/SettingsContext';
import { useObsidian } from '../../../hooks/useObsidian';
import { getVaultIndex, searchIndex, listFolder } from '../../../lib/obsidianIndex';
import { buildOpenVaultUri, launchUri } from '../../../lib/obsidianUri';
import './obsidian.css';

interface Props {
  value:    string;
  onChange: (path: string) => void;
  /** Vault-relative folder names to skip while indexing, same as
   *  ObsidianRandom's excludeFolders — most callers won't need this. */
  excludeFolders?: string[];
  label?: string;
}

/**
 * A note path field backed by a searchable/browsable vault index instead of
 * pure free text — any widget that picks a single note (currently
 * ObsidianNote; a natural fit later for ObsidianCapture's target path or
 * ObsidianDaily's path template) can drop this in instead of a plain input.
 *
 * Two modes:
 *  - Focus, no edits yet: a folder explorer (listFolder) — breadcrumbs +
 *    folder/note rows, mirroring BookmarkFolder's own navigation — starting
 *    in the current selection's own folder so re-opening the picker doesn't
 *    strand you at the vault root. The field's displayed text (the current
 *    selection) does NOT itself count as an active search — otherwise
 *    there'd be no way back into the explorer without erasing it first.
 *  - Once the user actually edits the text: a flat, ranked search across the
 *    whole vault (searchIndex) instead.
 *
 * The index itself (getVaultIndex, lib/obsidianIndex.ts) is shared, cached
 * storage — already built the same way for ObsidianRandom's shuffle. Loaded
 * on mount here (a cheap single storage.local read on a warm cache, not a
 * fresh vault walk — see getVaultIndex's TTL), so the explorer is ready the
 * instant the settings panel opens rather than needing a first click into
 * the field.
 */
export default function VaultNotePicker({ value, onChange, excludeFolders, label }: Props) {
  const { t } = useSettings();
  const { connection } = useObsidian();

  const [query,   setQuery]   = useState(value);
  const [allPaths, setAllPaths] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // '' = vault root.
  const [folder, setFolder] = useState('');
  // The field starts a focus session showing the *current* selection as
  // text — that shouldn't itself count as an active search (there'd be no
  // way back into the explorer without erasing the selection first). Search
  // mode only engages once the user actually edits the text this session.
  const [typing, setTyping] = useState(false);

  // The stored value is the source of truth — keep the field in sync if it
  // changes from outside this component (e.g. a factory reset).
  useEffect(() => { setQuery(value); }, [value]);

  // Load on mount, not just on first focus — every mount here is a fresh
  // settings-panel open (the floating panel unmounts this on close), so
  // without this the explorer stays empty until the user clicks into the
  // field once, every single time.
  useEffect(() => {
    setFolder(dirOf(value));
    void loadIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dirOf(path: string): string {
    const slash = path.lastIndexOf('/');
    return slash === -1 ? '' : path.slice(0, slash);
  }

  async function loadIndex(force = false) {
    setLoading(true);
    setLoadError(false);
    try {
      const index = await getVaultIndex(excludeFolders, { force });
      setAllPaths(index.paths);
      setTruncated(index.truncated);
      // walkVault (obsidianIndex.ts) swallows per-directory failures rather
      // than throwing — a totally broken connection just comes back as an
      // empty list, not a caught error, so that's the case actually worth
      // flagging here (as opposed to a vault that's genuinely empty).
      if (index.paths.length === 0) setLoadError(true);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  function commit(path: string) {
    onChange(path);
    setQuery(path);
    setTyping(false);
    setFolder(dirOf(path));
  }

  const searching = typing && query.trim().length > 0;
  const results = allPaths && searching ? searchIndex(allPaths, query) : [];
  const listing  = allPaths && !searching ? listFolder(allPaths, folder) : null;
  const crumbs   = folder ? folder.split('/') : [];

  return (
    <div className="sg-vault-picker" onClick={e => e.stopPropagation()}>
      <SettingsRow label={label ?? t('widget.vaultPicker.label')}>
        <input
          className="sg-obs-input sg-obs-input--mono"
          placeholder={t('widget.vaultPicker.placeholder')}
          value={query}
          onChange={e => { setQuery(e.target.value); setTyping(true); }}
          onFocus={() => {
            setTyping(false);
            setFolder(dirOf(query));
            if (!allPaths && !loading) void loadIndex();
          }}
          onBlur={() => commit(query)}
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onDragStart={e => e.stopPropagation()}
        />
      </SettingsRow>

      {loading && <p className="sg-obs-hint">{t('widget.vaultPicker.indexing')}</p>}
      {!loading && loadError && <p className="sg-obs-hint sg-obs-hint--error">{t('widget.vaultPicker.loadError')}</p>}

      {/* Breadcrumb row always renders one fixed-height slot, present or not,
          so navigating in/out of the vault root doesn't shift the results
          box below it up and down. */}
      {listing && (
        <div className="sg-vault-picker-breadcrumb">
          <button
            className="sg-vault-picker-crumb"
            disabled={!folder}
            onMouseDown={e => { e.preventDefault(); setFolder(''); }}
          >
            {t('widget.vaultPicker.vaultRoot')}
          </button>
          {crumbs.map((name, i) => (
            <span key={i}>
              <span className="sg-vault-picker-crumb-sep">›</span>
              <button
                className="sg-vault-picker-crumb"
                onMouseDown={e => { e.preventDefault(); setFolder(crumbs.slice(0, i + 1).join('/')); }}
              >
                {name}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Fixed-height box regardless of content (a handful of rows, an
          "empty"/"no matches" message, or nothing while still loading) — a
          box that only appears/grows once there's something to show would
          otherwise make the whole Settings panel jump size on every
          keystroke or folder click. */}
      {allPaths && !loading && (
        <div className="sg-vault-picker-results">
          {searching ? (
            results.length > 0 ? results.map(path => (
              <button
                key={path}
                className="sg-vault-picker-result"
                // mousedown (not click) fires before the input's own onBlur —
                // otherwise onBlur's commit(query) would fire first and this
                // click would never land on the up-to-date list.
                onMouseDown={e => { e.preventDefault(); commit(path); }}
              >
                {path}
              </button>
            )) : <p className="sg-obs-hint">{t('widget.vaultPicker.noMatches')}</p>
          ) : listing && (listing.folders.length > 0 || listing.notes.length > 0) ? (
            <>
              {listing.folders.map(name => (
                <button
                  key={name}
                  className="sg-vault-picker-row sg-vault-picker-row--folder"
                  onMouseDown={e => { e.preventDefault(); setFolder(folder ? `${folder}/${name}` : name); }}
                >
                  📁 {name}
                </button>
              ))}
              {listing.notes.map(note => (
                <button
                  key={note.path}
                  className="sg-vault-picker-row"
                  onMouseDown={e => { e.preventDefault(); commit(note.path); }}
                >
                  📄 {note.name}
                </button>
              ))}
            </>
          ) : (
            <p className="sg-obs-hint">{t('widget.vaultPicker.folderEmpty')}</p>
          )}
        </div>
      )}

      <div className="sg-vault-picker-actions">
        <ActionButton variant="ghost" fullWidth={false} onClick={() => void loadIndex(true)} disabled={loading}>
          {t('widget.vaultPicker.rebuildIndex')}
        </ActionButton>
        {connection?.vaultName && (
          <ActionButton
            variant="ghost"
            fullWidth={false}
            onClick={() => launchUri(buildOpenVaultUri(connection.vaultName as string))}
          >
            {t('widget.vaultPicker.openVault')}
          </ActionButton>
        )}
      </div>
      {truncated && <p className="sg-obs-hint">{t('widget.vaultPicker.truncated')}</p>}
    </div>
  );
}
