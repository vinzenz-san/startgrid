// Google Tasks API — read-only (tasks.readonly scope, shared Google client,
// see googleAuth.ts). Field shapes verified directly against Google's REST
// reference before building this, not assumed:
// https://developers.google.com/workspace/tasks/reference/rest/v1/tasks
// https://developers.google.com/workspace/tasks/reference/rest/v1/tasklists

const TASKS_BASE = 'https://tasks.googleapis.com/tasks/v1';

export interface GoogleTaskList {
  id: string;
  title: string;
}

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string; // RFC 3339, date portion only
  position: string; // lexicographically sortable — see fetchTasks' sort below
}

interface RawTaskListsResponse {
  items?: GoogleTaskList[];
}

interface RawTasksResponse {
  items?: GoogleTask[];
}

function isRawTaskListsResponse(v: unknown): v is RawTaskListsResponse {
  if (v === null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return r.items === undefined || (Array.isArray(r.items)
    && r.items.every(i => i !== null && typeof i === 'object' && typeof (i as Record<string, unknown>).id === 'string'));
}

function isRawTasksResponse(v: unknown): v is RawTasksResponse {
  if (v === null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return r.items === undefined || (Array.isArray(r.items)
    && r.items.every(i => i !== null && typeof i === 'object' && typeof (i as Record<string, unknown>).id === 'string'
      && typeof (i as Record<string, unknown>).position === 'string'));
}

/** Lists the user's Google Tasks task lists; throws `'UNAUTHORIZED'` on a 401. */
export async function fetchTaskLists(token: string): Promise<GoogleTaskList[]> {
  const res = await fetch(`${TASKS_BASE}/users/@me/lists`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json() as unknown;
  // A guard failure means the response shape changed, not "no lists exist" —
  // distinguish that from `items` genuinely being absent/empty by throwing.
  if (!isRawTaskListsResponse(data)) throw new Error('Malformed Google Tasks lists response');
  return data.items ?? [];
}

/** Fetches all tasks (including completed/hidden) for a list, sorted by Google's own drag-order `position` field; throws `'UNAUTHORIZED'` on a 401. */
export async function fetchTasks(token: string, taskListId: string): Promise<GoogleTask[]> {
  // showHidden must also be true, or tasks completed via first-party clients
  // (the Tasks web UI, mobile apps) are dropped even with showCompleted=true —
  // verified against Google's own tasks.list reference, not assumed. The
  // widget's own "Hide completed" toggle is what actually filters these
  // client-side (TodoList.tsx), so we always fetch the full set here.
  const params = new URLSearchParams({ showCompleted: 'true', showHidden: 'true' });
  const res = await fetch(`${TASKS_BASE}/lists/${encodeURIComponent(taskListId)}/tasks?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json() as unknown;
  if (!isRawTasksResponse(data)) throw new Error('Malformed Google Tasks response');
  const items = data.items ?? [];
  // tasks.list documents no default sort order and has no orderBy param —
  // verified against Google's own reference, not assumed. The Tasks web UI
  // sorts client-side by each task's own `position` (a lexicographically
  // ordered string reflecting manual drag order), which is what this mirrors
  // to match what the user sees in Google's own app.
  return [...items].sort((a, b) => a.position.localeCompare(b.position));
}
