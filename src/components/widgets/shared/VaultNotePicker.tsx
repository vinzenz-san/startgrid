import { useEffect, useState } from 'react';
import { SettingsRow, ActionButton } from '../../shared/Form';
import { useSettings } from '../../../contexts/SettingsContext';
import { useObsidian } from '../../../hooks/useObsidian';
import { getVaultIndex, searchIndex, listFolder, addToVaultIndex, removeFromVaultIndex } from '../../../lib/obsidianIndex';
import { buildOpenVaultUri, launchUri } from '../../../lib/obsidianUri';
import { putFile, deleteFile } from '../../../lib/obsidianApi';
import { IconNewNote, IconNewFolder, IconRefresh, IconOpenExternal, IconTrash } from './ObsidianIcons';
import './obsidian.css';

interface Props {
  value:    string;
  onChange: (path: string) => void;
  /** Vault-relative folder names to skip while indexing, same as
   *  ObsidianRandom's excludeFolders — most callers won't need this. */
  excludeFolders?: string[];
  label?: string;
  /** Off by default at the call site — shows/hides the per-note delete button. */
  deleteEnabled?: boolean;
  /** On by default at the call site — adds an arm/cooldown wait before a delete confirm fires. */
  deleteProtection?: boolean;
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
export default function VaultNotePicker({
  value, onChange, excludeFolders, label,
  deleteEnabled = false, deleteProtection = true,
}: Props) {
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

  // "New note" mini-form — only meaningful in browse mode, since it creates
  // into whatever folder is currently displayed.
  const [creating, setCreating]     = useState(false);
  const [newName, setNewName]       = useState('');
  const [newBusy, setNewBusy]       = useState(false);
  const [newError, setNewError]     = useState<string | null>(null);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  // "New folder" mini-form — mirrors the note one above.
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName]   = useState('');
  const [newFolderNoteName, setNewFolderNoteName] = useState('');
  const [folderBusy, setFolderBusy]         = useState(false);
  const [folderError, setFolderError]       = useState<string | null>(null);

  // The stored value is the source of truth — keep the field in sync if it
  // changes from outside this component (e.g. a factory reset).
  useEffect(() => { setQuery(value); }, [value]);

  // Close the new-note/new-folder forms whenever the browsed folder changes —
  // their target folder would otherwise silently go stale under the user.
  useEffect(() => {
    setCreating(false); setNewName(''); setNewError(null);
    setCreatingFolder(false); setNewFolderName(''); setNewFolderNoteName(''); setFolderError(null);
  }, [folder]);

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

  async function createNote() {
    const title = newName.trim().replace(/\.md$/i, '');
    if (!title) return;
    const path = folder ? `${folder}/${title}.md` : `${title}.md`;

    const existing = allPaths ? listFolder(allPaths, folder) : null;
    if (existing?.notes.some(n => n.path.toLowerCase() === path.toLowerCase())) {
      setNewError(t('widget.vaultPicker.newNoteExists'));
      return;
    }

    setNewBusy(true);
    setNewError(null);
    try {
      await putFile(path, '');
      setAllPaths(prev => (prev ? [...prev, path] : prev));
      await addToVaultIndex(path);
      setCreating(false);
      setNewName('');
      commit(path);
    } catch {
      setNewError(t('widget.vaultPicker.newNoteError'));
    } finally {
      setNewBusy(false);
    }
  }

  async function createFolder() {
    const name = newFolderName.trim().replace(/\/+$/, '');
    if (!name) return;
    const path = folder ? `${folder}/${name}` : name;

    const existing = allPaths ? listFolder(allPaths, folder) : null;
    if (existing?.folders.some(f => f.toLowerCase() === name.toLowerCase())) {
      setFolderError(t('widget.vaultPicker.newFolderExists'));
      return;
    }

    // Neither a rename nor a directory-creation endpoint exists on the Local
    // REST API plugin, so the placeholder note's name is permanent unless
    // it's picked correctly up front — hence asking for it here rather than
    // defaulting to "Untitled".
    const noteTitle = (newFolderNoteName.trim() || 'Untitled').replace(/\.md$/i, '');

    setFolderBusy(true);
    setFolderError(null);
    try {
      const placeholder = `${path}/${noteTitle}.md`;
      await putFile(placeholder, '');
      setAllPaths(prev => (prev ? [...prev, placeholder] : prev));
      await addToVaultIndex(placeholder);
      setFolder(path);
    } catch {
      setFolderError(t('widget.vaultPicker.newFolderError'));
    } finally {
      setFolderBusy(false);
    }
  }

  async function deleteNote(path: string) {
    setDeleteError(null);
    try {
      await deleteFile(path);
      setAllPaths(prev => (prev ? prev.filter(p => p !== path) : prev));
      await removeFromVaultIndex(path);
      // The pinned note itself was just deleted — clear the pin rather than
      // leaving the widget pointed at a note that no longer exists.
      if (path === value) commit('');
    } catch {
      setDeleteError(t('widget.vaultPicker.deleteError'));
    }
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
                <div key={note.path} className="sg-vault-picker-row-wrap">
                  <button
                    className="sg-vault-picker-row"
                    onMouseDown={e => { e.preventDefault(); commit(note.path); }}
                  >
                    📄 {note.name}
                  </button>
                  {deleteEnabled && (
                    <ActionButton
                      variant="default"
                      skipCooldown={!deleteProtection}
                      fullWidth={false}
                      className="sg-vault-picker-row-delete"
                      onClick={() => void deleteNote(note.path)}
                      title={t('widget.vaultPicker.delete')}
                    >
                      <IconTrash/>
                    </ActionButton>
                  )}
                </div>
              ))}
            </>
          ) : (
            <p className="sg-obs-hint">{t('widget.vaultPicker.folderEmpty')}</p>
          )}
        </div>
      )}
      {deleteError && <p className="sg-obs-hint sg-obs-hint--error">{deleteError}</p>}

      {creating && (
        <div className="sg-vault-picker-new" onClick={e => e.stopPropagation()}>
          <input
            autoFocus
            className="sg-obs-input"
            placeholder={t('widget.vaultPicker.newNotePlaceholder')}
            value={newName}
            disabled={newBusy}
            onChange={e => { setNewName(e.target.value); setNewError(null); }}
            onKeyDown={e => {
              if (e.key === 'Enter') void createNote();
              if (e.key === 'Escape') { setCreating(false); setNewName(''); setNewError(null); }
            }}
            onPointerDown={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onDragStart={e => e.stopPropagation()}
          />
          <ActionButton variant="ghost" fullWidth={false} onClick={() => void createNote()} disabled={newBusy || !newName.trim()}>
            {t('widget.vaultPicker.createNote')}
          </ActionButton>
        </div>
      )}
      {creating && newError && <p className="sg-obs-hint sg-obs-hint--error">{newError}</p>}

      {creatingFolder && (
        <div className="sg-vault-picker-new sg-vault-picker-new--stacked" onClick={e => e.stopPropagation()}>
          <input
            autoFocus
            className="sg-obs-input"
            placeholder={t('widget.vaultPicker.newFolderPlaceholder')}
            value={newFolderName}
            disabled={folderBusy}
            onChange={e => { setNewFolderName(e.target.value); setFolderError(null); }}
            onKeyDown={e => {
              if (e.key === 'Enter') void createFolder();
              if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); setNewFolderNoteName(''); setFolderError(null); }
            }}
            onPointerDown={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onDragStart={e => e.stopPropagation()}
          />
          <input
            className="sg-obs-input"
            placeholder={t('widget.vaultPicker.newFolderNotePlaceholder')}
            value={newFolderNoteName}
            disabled={folderBusy}
            onChange={e => { setNewFolderNoteName(e.target.value); setFolderError(null); }}
            onKeyDown={e => {
              if (e.key === 'Enter') void createFolder();
              if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); setNewFolderNoteName(''); setFolderError(null); }
            }}
            onPointerDown={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onDragStart={e => e.stopPropagation()}
          />
          <ActionButton variant="ghost" fullWidth={false} onClick={() => void createFolder()} disabled={folderBusy || !newFolderName.trim()}>
            {t('widget.vaultPicker.createFolder')}
          </ActionButton>
        </div>
      )}
      {creatingFolder && !folderError && <p className="sg-obs-hint">{t('widget.vaultPicker.newFolderNoteHint')}</p>}
      {creatingFolder && folderError && <p className="sg-obs-hint sg-obs-hint--error">{folderError}</p>}

      <div className="sg-vault-picker-actions">
        <ActionButton
          variant="ghost"
          fullWidth={false}
          disabled={!listing}
          onClick={() => { setCreating(v => !v); setNewError(null); }}
          title={t('widget.vaultPicker.newNote')}
        >
          <IconNewNote/>
        </ActionButton>
        <ActionButton
          variant="ghost"
          fullWidth={false}
          disabled={!listing}
          onClick={() => { setCreatingFolder(v => !v); setFolderError(null); }}
          title={t('widget.vaultPicker.newFolder')}
        >
          <IconNewFolder/>
        </ActionButton>
        <ActionButton
          variant="ghost"
          fullWidth={false}
          onClick={() => void loadIndex(true)}
          disabled={loading}
          title={t('widget.vaultPicker.rebuildIndex')}
        >
          <IconRefresh spinning={loading}/>
        </ActionButton>
        {connection?.vaultName && (
          <ActionButton
            variant="ghost"
            fullWidth={false}
            onClick={() => launchUri(buildOpenVaultUri(connection.vaultName as string))}
            title={t('widget.vaultPicker.openVault')}
          >
            <IconOpenExternal/>
          </ActionButton>
        )}
      </div>
      {truncated && <p className="sg-obs-hint">{t('widget.vaultPicker.truncated')}</p>}
    </div>
  );
}
