import type { CalendarEvent } from './calendar.types';
import { getValidToken } from '../../../lib/googleAuth';
import { daysFromNow, allDayDate } from '../shared/mockCalendarEvents';
import {
  useProviderCalendar,
  useProviderCalendarList,
  type CalendarProviderConfig,
} from '../shared/useProviderCalendar';

// ── Real Google Calendar API fetch ────────────────────────────────────────────
// Calls:
//   GET https://www.googleapis.com/calendar/v3/calendars/primary/events
//     ?timeMin=<now>&singleEvents=true&orderBy=startTime&maxResults=N
//
// singleEvents=true expands recurring events into individual instances, which
// is what the user expects to see. The response items map directly to our
// CalendarEvent type — no transformation of the start/end shape is needed.

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

interface RawEventList {
  items?: CalendarEvent[];
  error?: { code: number; message: string };
}

async function fetchCalendarEvents(token: string, maxResults: number, calendarId: string, calendarColor?: string): Promise<CalendarEvent[]> {
  const url = new URL(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('timeMin',       new Date().toISOString());
  url.searchParams.set('singleEvents',  'true');
  url.searchParams.set('orderBy',       'startTime');
  url.searchParams.set('maxResults',    String(maxResults));
  // Only pull fields the widget actually uses — reduces payload size
  url.searchParams.set('fields',
    'items(id,summary,start,end,colorId,location,htmlLink)');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error(`Calendar fetch failed: ${res.status}`);

  const data = await res.json() as RawEventList;
  if (data.error) throw new Error(data.error.message);
  return (data.items ?? []).map(item => ({ ...item, calendarColor }));
}

// ── Calendar list (for multi-calendar selection in Settings) ───────────────────

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  backgroundColor?: string;
  primary?: boolean;
}

interface RawCalendarList {
  items?: GoogleCalendarListEntry[];
  error?: { code: number; message: string };
}

async function fetchCalendarList(token: string): Promise<GoogleCalendarListEntry[]> {
  const url = new URL(`${CALENDAR_BASE}/users/me/calendarList`);
  url.searchParams.set('fields', 'items(id,summary,backgroundColor,primary)');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error(`Calendar list fetch failed: ${res.status}`);

  const data = await res.json() as RawCalendarList;
  if (data.error) throw new Error(data.error.message);
  return data.items ?? [];
}

// Resolves the 'primary' sentinel used in stored settings to that calendar's
// own color, since calendarList never lists an entry with id 'primary' itself
// (its real id is the account's email address, flagged via `primary: true`).
function colorForCalendarId(id: string, list: GoogleCalendarListEntry[]): string | undefined {
  if (id === 'primary') return list.find(c => c.primary)?.backgroundColor;
  return list.find(c => c.id === id)?.backgroundColor;
}

// ── Mock data — used in dev mode when extension APIs are unavailable ───────────

const BASE_LINK = 'https://calendar.google.com/calendar/r/eventedit';

const MOCK_EVENTS: CalendarEvent[] = [
  { id: 'evt_001', summary: 'Morning standup',
    start: { dateTime: daysFromNow(0, 9, 30) }, end: { dateTime: daysFromNow(0, 9, 45) },
    colorId: '7', htmlLink: BASE_LINK },
  { id: 'evt_002', summary: 'M8 code review — Calendar widget',
    start: { dateTime: daysFromNow(0, 11, 0) }, end: { dateTime: daysFromNow(0, 12, 0) },
    colorId: '9', htmlLink: BASE_LINK },
  { id: 'evt_003', summary: 'Lunch with Anna',
    start: { dateTime: daysFromNow(0, 12, 30) }, end: { dateTime: daysFromNow(0, 13, 30) },
    colorId: '2', location: 'Café Central, Berlin', htmlLink: BASE_LINK },
  { id: 'evt_004', summary: 'Public holiday — no meetings',
    start: { date: allDayDate(0) }, end: { date: allDayDate(1) },
    colorId: '5', htmlLink: BASE_LINK },
  { id: 'evt_005', summary: 'Design sync: Q3 onboarding flow',
    start: { dateTime: daysFromNow(1, 10, 0) }, end: { dateTime: daysFromNow(1, 11, 0) },
    colorId: '3', htmlLink: BASE_LINK },
  { id: 'evt_006', summary: 'Dentist appointment',
    start: { dateTime: daysFromNow(1, 14, 30) }, end: { dateTime: daysFromNow(1, 15, 30) },
    colorId: '4', htmlLink: BASE_LINK },
  { id: 'evt_007', summary: 'Sprint planning',
    start: { dateTime: daysFromNow(2, 9, 0) }, end: { dateTime: daysFromNow(2, 10, 30) },
    colorId: '9', htmlLink: BASE_LINK },
  { id: 'evt_008', summary: 'Team off-site',
    start: { date: allDayDate(2) }, end: { date: allDayDate(4) },
    colorId: '6', htmlLink: BASE_LINK },
];

// No artificial delay — MOCK_EVENTS is a static array, already known
// synchronously at import time. An async signature is kept only because
// CalendarProviderConfig.mockEvents must match the real fetch's shape.
async function fetchMockEvents(): Promise<CalendarEvent[]> {
  return MOCK_EVENTS;
}

const CONFIG: CalendarProviderConfig<GoogleCalendarListEntry> = {
  cacheKeyPrefix: 'google',
  defaultCalendarId: 'primary',
  getValidToken,
  fetchCalendarEvents,
  fetchCalendarList,
  colorForCalendarId,
  mockEvents: fetchMockEvents,
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCalendar() {
  return useProviderCalendar(CONFIG);
}

// ── Calendar list hook (Settings picker) ────────────────────────────────────────

export function useGoogleCalendarList(enabled: boolean) {
  return useProviderCalendarList(CONFIG, enabled);
}
