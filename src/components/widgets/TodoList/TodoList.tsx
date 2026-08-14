import { useRef, useState } from 'react';
import type { TodoData, TodoItem } from '../../../types/widget';
import { SettingsRow, SettingsSwitch, ActionButton, IconButton, Dropdown } from '../../shared/Form';
import { useSettings } from '../../../contexts/SettingsContext';
import { useGoogleAuth } from '../../../hooks/useGoogleAuth';
import { useGoogleTasks } from '../../../hooks/useGoogleTasks';
import { getValidToken } from '../../../lib/googleAuth';
import { fetchTaskLists, type GoogleTaskList } from '../../../lib/googleTasksApi';
import { openLink, middleClickHandlers } from '../../../lib/openLink';
import './TodoList.css';

function generateId() {
  return `td-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Google Tasks' web app has no documented deep-link to a specific list or
// task (confirmed via search — no URL scheme exists for it), so this always
// opens the app's own landing page; the user picks the list there themselves.
const GOOGLE_TASKS_URL = 'https://tasks.google.com/tasks/';

// ── Settings ───────────────────────────────────────────────────────────────

interface SettingsProps {
  data: TodoData;
  onUpdateData: (patch: Partial<TodoData>) => void;
}

export function TodoListSettings({ data, onUpdateData }: SettingsProps) {
  const { t } = useSettings();
  const source = data.source ?? 'local';
  const items = data.items ?? [];
  const hideCompleted = data.hideCompleted ?? false;
  const completedCount = items.filter(i => i.done).length;

  const { isConnected, isConnecting, email, connect, disconnect } = useGoogleAuth();
  const [taskLists, setTaskLists] = useState<GoogleTaskList[] | null>(null);

  function loadTaskLists() {
    getValidToken().then(token => {
      if (!token) return;
      fetchTaskLists(token).then(setTaskLists).catch(() => {});
    });
  }

  return (
    <>
      <SettingsRow label={t('widget.todoList.source')}>
        <Dropdown
          options={[
            { value: 'local', label: t('widget.todoList.sourceLocal') },
            { value: 'google', label: t('widget.todoList.sourceGoogle') },
          ]}
          value={source}
          onChange={v => onUpdateData({ source: v as 'local' | 'google' })}
        />
      </SettingsRow>

      {source === 'google' && (
        !isConnected ? (
          <ActionButton variant="ghost" onClick={connect} disabled={isConnecting}>
            {isConnecting ? t('widget.todoList.connecting') : t('widget.todoList.connectGoogle')}
          </ActionButton>
        ) : (
          <>
            <SettingsRow label={t('widget.todoList.connectedAs', { email: email ?? '' })}>
              <ActionButton variant="ghost" onClick={disconnect}>{t('widget.todoList.disconnect')}</ActionButton>
            </SettingsRow>
            <SettingsRow label={t('widget.todoList.selectTaskList')}>
              {taskLists === null ? (
                <ActionButton variant="ghost" onClick={loadTaskLists}>{t('widget.todoList.loadTaskLists')}</ActionButton>
              ) : (
                <Dropdown
                  options={taskLists.map(l => ({ value: l.id, label: l.title }))}
                  value={data.googleTaskListId ?? taskLists[0]?.id ?? ''}
                  onChange={v => onUpdateData({ googleTaskListId: v })}
                  menuWidth="auto"
                />
              )}
            </SettingsRow>
          </>
        )
      )}

      <SettingsRow label={t('widget.todoList.hideCompleted')}>
        <SettingsSwitch checked={hideCompleted} onChange={v => onUpdateData({ hideCompleted: v })} />
      </SettingsRow>

      {source === 'local' && (
        <ActionButton
          variant="danger"
          disabled={completedCount === 0}
          onClick={() => onUpdateData({ items: items.filter(i => !i.done) })}
        >
          {t('widget.todoList.clearCompleted', { count: completedCount })}
        </ActionButton>
      )}
    </>
  );
}

// ── Google Tasks (read-only) view ───────────────────────────────────────────

function GoogleTodoList({ data }: { data: TodoData }) {
  const { t } = useSettings();
  const { isConnected } = useGoogleAuth();
  const hideCompleted = data.hideCompleted ?? false;
  const { status, tasks, isStale, refetch } = useGoogleTasks({ taskListId: data.googleTaskListId });

  if (!isConnected) {
    return (
      <div className="sg-todo-empty">{t('widget.todoList.connectPrompt')}</div>
    );
  }
  if (!data.googleTaskListId) {
    return <div className="sg-todo-empty">{t('widget.todoList.noTaskList')}</div>;
  }
  if (status === 'loading' && tasks.length === 0) {
    return <div className="sg-todo-empty">{t('widget.todoList.loading')}</div>;
  }
  if (status === 'error') {
    return <div className="sg-todo-empty">{t('widget.todoList.error')}</div>;
  }

  const visible = hideCompleted ? tasks.filter(t2 => t2.status !== 'completed') : tasks;

  return (
    <div className="sg-todo">
      <div className="sg-todo-google-toolbar">
        <IconButton
          variant="ghost"
          title={t('widget.todoList.refresh')}
          onClick={() => void refetch()}
          active={false}
          icon={<span aria-hidden="true">↻</span>}
        />
      </div>
      {isStale && <div className="sg-todo-stale-banner">{t('widget.todoList.stale')}</div>}
      {visible.length === 0 ? (
        <div className="sg-todo-empty">{t('widget.todoList.empty')}</div>
      ) : (
        <div className="sg-todo-list sg-scroll-thin">
          {visible.map(task => (
            <button
              key={task.id}
              className="sg-todo-row sg-todo-row--readonly sg-todo-row--link"
              onMouseDown={middleClickHandlers(GOOGLE_TASKS_URL).onMouseDown}
              onClick={() => void openLink(GOOGLE_TASKS_URL)}
              title={t('widget.todoList.openInGoogleTasks')}
            >
              <span className={`sg-todo-check${task.status === 'completed' ? ' sg-todo-check--done' : ''}`}>
                {task.status === 'completed' && '✓'}
              </span>
              <span className={`sg-todo-text${task.status === 'completed' ? ' sg-todo-text--done' : ''}`}>{task.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Local To-Do (editable) view ─────────────────────────────────────────────

function LocalTodoList({ data, onUpdateData }: Props) {
  const { t } = useSettings();
  const items = data.items ?? [];
  const hideCompleted = data.hideCompleted ?? false;
  const visibleItems = hideCompleted ? items.filter(i => !i.done) : items;

  const [draft, setDraft] = useState('');

  function addItem() {
    const text = draft.trim();
    if (!text) return;
    const next: TodoItem = { id: generateId(), text, done: false };
    onUpdateData({ items: [...items, next] });
    setDraft('');
  }

  function toggleItem(id: string) {
    onUpdateData({ items: items.map(i => (i.id === id ? { ...i, done: !i.done } : i)) });
  }

  function deleteItem(id: string) {
    onUpdateData({ items: items.filter(i => i.id !== id) });
  }

  // ── Pointer-based drag reorder — ported from Quicklinks.tsx's own
  // self-contained implementation (no shared drag hook exists in this
  // codebase). Vertical-only here, unlike Quicklinks' grid/row layouts.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const justDraggedRef = useRef(false);

  const handleItemDown = (e: React.PointerEvent<HTMLDivElement>, startIdx: number) => {
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const pointerId = e.pointerId;
    const tileEl = e.currentTarget;
    const startItems = [...visibleItems];

    let isDragging = false;
    let currentOver = startIdx;

    const onMove = (ev: PointerEvent) => {
      if (!isDragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        isDragging = true;
        tileEl.setPointerCapture(pointerId);
        setDragIndex(startIdx);
        setOverIndex(startIdx);
      }
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const item = el?.closest('[data-todo-index]') as HTMLElement | null;
      if (!item) return;
      const itemIdx = Number(item.dataset.todoIndex);
      if (isNaN(itemIdx)) return;
      const rect = item.getBoundingClientRect();
      const before = ev.clientY < rect.top + rect.height / 2;
      currentOver = before ? itemIdx : itemIdx + 1;
      setOverIndex(currentOver);
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      if (!isDragging) return;
      justDraggedRef.current = true;
      const adjusted = currentOver > startIdx ? currentOver - 1 : currentOver;
      if (adjusted !== startIdx) {
        // Reorder within the dragged (possibly hideCompleted-filtered)
        // subset first, exactly like Quicklinks does for its unfiltered
        // list — then splice that new sub-order back into the full `items`
        // array, leaving any hidden (done) items pinned at their existing
        // relative positions instead of being displaced by the drag.
        const reorderedVisible = [...startItems];
        const [removed] = reorderedVisible.splice(startIdx, 1);
        reorderedVisible.splice(adjusted, 0, removed);

        const visibleIds = new Set(startItems.map(i => i.id));
        let cursor = 0;
        const next = items.map(i => (visibleIds.has(i.id) ? reorderedVisible[cursor++] : i));
        onUpdateData({ items: next });
      }
      setDragIndex(null);
      setOverIndex(null);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  };

  return (
    <div className="sg-todo">
      <div className="sg-todo-add">
        <input
          className="sg-form-input"
          type="text"
          placeholder={t('widget.todoList.addPlaceholder')}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
        />
      </div>

      {visibleItems.length === 0 ? (
        <div className="sg-todo-empty">{t('widget.todoList.empty')}</div>
      ) : (
        <div className="sg-todo-list sg-scroll-thin">
          {visibleItems.map((item, idx) => (
            <div
              key={item.id}
              className={[
                'sg-todo-row',
                dragIndex === idx ? 'sg-todo-row--dragging' : '',
                dragIndex !== null && overIndex === idx ? 'sg-todo-row--drop-before' : '',
                dragIndex !== null && overIndex === idx + 1 && idx === visibleItems.length - 1 ? 'sg-todo-row--drop-after' : '',
              ].filter(Boolean).join(' ')}
              data-todo-index={idx}
              onPointerDown={e => handleItemDown(e, idx)}
              onDragStart={e => e.preventDefault()}
              onClickCapture={e => {
                if (justDraggedRef.current) {
                  justDraggedRef.current = false;
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            >
              <button
                role="checkbox"
                aria-checked={item.done}
                className={`sg-todo-check${item.done ? ' sg-todo-check--done' : ''}`}
                onClick={() => toggleItem(item.id)}
              >
                {item.done && '✓'}
              </button>
              <span className={`sg-todo-text${item.done ? ' sg-todo-text--done' : ''}`}>{item.text}</span>
              <IconButton
                className="sg-todo-delete"
                variant="ghost"
                title={t('widget.todoList.delete')}
                onClick={() => deleteItem(item.id)}
                active={false}
                icon={<span aria-hidden="true">✕</span>}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────

interface Props {
  data: TodoData;
  onUpdateData: (patch: Partial<TodoData>) => void;
}

export default function TodoList(props: Props) {
  return props.data.source === 'google'
    ? <GoogleTodoList data={props.data} />
    : <LocalTodoList {...props} />;
}
