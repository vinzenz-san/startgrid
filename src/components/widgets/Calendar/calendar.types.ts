// ── Persistent widget data (stored in browser.storage.sync) ──────────────────

export interface CalendarData {
  maxDays: number;               // 1–28, default 3
  showAllDay: boolean;           // include all-day events, default true
  viewMode?: 'agenda' | 'monthly'; // default 'agenda'
  firstDayOfWeek?: 0 | 1;         // 0=Sunday, 1=Monday; monthly view only, default 0
  showWeekNumbers?: boolean;     // ISO week number column; monthly view only, default false
  calendarIds?: string[];        // Google calendar IDs to pull events from; 'primary' is the API's alias for the main calendar. Default ['primary']
}

// ── API-mirroring types (matches Google Calendar REST API event resource) ──────
// When wiring to the real API, CalendarEvent maps to a processed
// GET https://www.googleapis.com/calendar/v3/calendars/primary/events
// with timeMin=now, orderBy=startTime, singleEvents=true.
// The start/end objects are either { dateTime, timeZone } for timed events
// or { date } for all-day events — exactly as the real API returns them.
// The generic shape itself lives in shared/calendarEvent.types.ts, shared with
// the Outlook Calendar widget.

export type { CalendarEventDateTime, CalendarEvent } from '../shared/calendarEvent.types';
import type { CalendarViewStatus, CalendarEvent } from '../shared/calendarEvent.types';

// ── Hook state ────────────────────────────────────────────────────────────────

export type CalendarStatus = CalendarViewStatus;

export interface CalendarState {
  status: CalendarStatus;
  events: CalendarEvent[];
  error: string | null;
  lastRefreshed: Date | null;
}

// ── Google Calendar colorId → hex (palette from the official UI) ───────────────
// https://developers.google.com/calendar/api/v3/reference/colors/get

export const GCAL_COLORS: Record<string, string> = {
  '1':  '#7986cb', // Lavender
  '2':  '#33b679', // Sage
  '3':  '#8e24aa', // Grape
  '4':  '#e67c73', // Flamingo
  '5':  '#f6c026', // Banana
  '6':  '#f5511d', // Tangerine
  '7':  '#039be5', // Peacock
  '8':  '#616161', // Graphite
  '9':  '#3f51b5', // Blueberry
  '10': '#0b8043', // Basil
  '11': '#d60000', // Tomato
};

export const DEFAULT_EVENT_COLOR = '#039be5'; // Peacock — Google's own default
