import { Fragment, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { CalendarEvent } from './calendarEvent.types';

// Generic agenda + monthly-grid rendering core, shared by the Google Calendar
// and Outlook Calendar widgets. Everything here operates on the provider-
// agnostic CalendarEvent shape and takes an injected `eventColor` lookup —
// no Google/Outlook-specific data or branding lives in this file.

// ── Date helpers ─────────────────────────────────────────────────────────────

export function toLocalDateKey(event: CalendarEvent): string {
  return (event.start.date ?? event.start.dateTime!).slice(0, 10);
}

export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Narrow weekday initials (Su/Mo/Tu/…) for the monthly grid header, derived
// from a known-Sunday-start week rather than a hardcoded array — follows the
// active locale's own weekday naming.
export function getDowLabels(locale: string, firstDayOfWeek: 0 | 1 = 0): string[] {
  const sunday = new Date(2023, 0, 1); // a Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + firstDayOfWeek + i);
    return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(d);
  });
}

export function formatDayHeading(dateKey: string, locale: string, todayLabel: string, tomorrowLabel: string): string {
  const [y, m, day] = dateKey.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  const today    = localDateKey(new Date());
  const tomorrow = localDateKey(new Date(Date.now() + 86_400_000));
  if (dateKey === today)    return todayLabel;
  if (dateKey === tomorrow) return tomorrowLabel;
  return new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' }).format(d);
}

export function formatTimeBlock(event: CalendarEvent, allDayLabel: string): string {
  if (event.start.date) return allDayLabel;
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };
  return `${fmt(event.start.dateTime!)} – ${fmt(event.end.dateTime!)}`;
}

export function formatFullDate(dateKey: string, locale: string): string {
  const [y, m, day] = dateKey.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  return new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(d);
}

export function formatHeaderDate(locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
}

export interface DayGroup { dateKey: string; events: CalendarEvent[]; }

// Always includes today's group, even with zero events, so the agenda view
// can surface a "nothing today" state instead of just skipping the day.
export function groupEventsByDay(events: CalendarEvent[], maxDays: number, showAllDay: boolean): DayGroup[] {
  const today = new Date(); today.setHours(0,0,0,0);
  const cutoff = new Date(today.getTime() + maxDays * 86_400_000);
  const filtered = events.filter(evt => {
    if (!showAllDay && evt.start.date) return false;
    const [y,m,d] = toLocalDateKey(evt).split('-').map(Number);
    const evtDay = new Date(y, m-1, d);
    return evtDay >= today && evtDay < cutoff;
  });
  const map = new Map<string, CalendarEvent[]>();
  for (const evt of filtered) {
    const key = toLocalDateKey(evt);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(evt);
  }
  const todayKey = localDateKey(new Date());
  if (!map.has(todayKey)) map.set(todayKey, []);
  return Array.from(map.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([dateKey, evts]) => ({
    dateKey,
    events: evts.sort((a,b) => (a.start.date?'':(a.start.dateTime??'')).localeCompare(b.start.date?'':(b.start.dateTime??''))),
  }));
}

// ISO 8601 week number (nearest-Thursday rule) — used by the monthly grid's
// optional week-number column.
export function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstThursdayDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDay + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

export function IconRefresh({ spinning }: { spinning: boolean }) {
  return (
    <svg className={`sg-cal-icon-refresh${spinning ? ' spinning' : ''}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <polyline points="15,2.5 15,6.5 11,6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13.7 10a6 6 0 1 1-1.4-6.2L15 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

export function IconConnect() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

export function IconDisconnect() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M5 8h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

export function SkeletonGroup() {
  return (
    <div className="sg-cal-skeleton-group">
      <div className="sg-cal-skeleton sg-cal-skeleton--heading"/>
      <div className="sg-cal-skeleton-row">
        <div className="sg-cal-skeleton sg-cal-skeleton--time"/>
        <div className="sg-cal-skeleton sg-cal-skeleton--title"/>
      </div>
      <div className="sg-cal-skeleton-row">
        <div className="sg-cal-skeleton sg-cal-skeleton--time"/>
        <div className="sg-cal-skeleton sg-cal-skeleton--title sg-cal-skeleton--title-short"/>
      </div>
    </div>
  );
}

// ── Event / Day (agenda view) ──────────────────────────────────────────────────

export function EventRow({ event, allDayLabel, eventColor }: { event: CalendarEvent; allDayLabel: string; eventColor: (event: CalendarEvent) => string }) {
  return (
    <a className={`sg-cal-event${event.start.date ? ' sg-cal-event--allday' : ''}`} href={event.htmlLink} title={event.summary} target="_blank" rel="noreferrer">
      <span className="sg-cal-dot" style={{ background: eventColor(event) }} aria-hidden="true"/>
      <span className="sg-cal-time">{formatTimeBlock(event, allDayLabel)}</span>
      <span className="sg-cal-title">{event.summary}</span>
    </a>
  );
}

export function DayGroupView({ group, locale, todayLabel, tomorrowLabel, allDayLabel, noEventsLabel, eventColor }: { group: DayGroup; locale: string; todayLabel: string; tomorrowLabel: string; allDayLabel: string; noEventsLabel: string; eventColor: (event: CalendarEvent) => string }) {
  const isToday = group.dateKey === localDateKey(new Date());
  return (
    <div className="sg-cal-day">
      <div className={`sg-cal-day-heading${isToday ? ' sg-cal-day-heading--today' : ''}`}>{formatDayHeading(group.dateKey, locale, todayLabel, tomorrowLabel)}</div>
      <div className={`sg-cal-day-body${isToday ? ' sg-cal-day-body--today' : ''}`}>
        {group.events.length === 0
          ? <div className="sg-cal-day-empty">{noEventsLabel}</div>
          : group.events.map(evt => <EventRow key={evt.id} event={evt} allDayLabel={allDayLabel} eventColor={eventColor}/>)}
      </div>
    </div>
  );
}

// ── Event details popover (Monthly View) ─────────────────────────────────────

interface SelectedDay { dateKey: string; anchor: DOMRect; }

interface EventDetailsPopoverProps {
  selected: SelectedDay;
  events: CalendarEvent[];
  locale: string;
  allDayLabel: string;
  noEventsLabel: string;
  closeAriaLabel: string;
  locationLabel: string;
  descriptionLabel: string;
  eventColor: (event: CalendarEvent) => string;
  onClose: () => void;
}

const POPOVER_WIDTH = 260;
const POPOVER_MARGIN = 8;

function EventDetailsPopover({
  selected, events, locale, allDayLabel, noEventsLabel, closeAriaLabel,
  locationLabel, descriptionLabel, eventColor, onClose,
}: EventDetailsPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onClose]);

  const { anchor } = selected;
  const left = Math.min(Math.max(anchor.left, POPOVER_MARGIN), window.innerWidth - POPOVER_WIDTH - POPOVER_MARGIN);
  const spaceBelow = window.innerHeight - anchor.bottom;
  const openUpward = spaceBelow < 220 && anchor.top > spaceBelow;
  const style: CSSProperties = openUpward
    ? { left, bottom: Math.max(window.innerHeight - anchor.top + 4, POPOVER_MARGIN) }
    : { left, top: Math.min(anchor.bottom + 4, window.innerHeight - POPOVER_MARGIN) };

  return createPortal(
    <div className="sg-cal-event-popover" ref={panelRef} style={style} onPointerDown={e => e.stopPropagation()}>
      <div className="sg-cal-event-popover-header">
        <span className="sg-cal-event-popover-date">{formatFullDate(selected.dateKey, locale)}</span>
        <button className="sg-cal-event-popover-close" onClick={onClose} aria-label={closeAriaLabel}>×</button>
      </div>
      <div className="sg-cal-event-popover-body">
        {events.length === 0 ? (
          <div className="sg-cal-event-popover-empty">{noEventsLabel}</div>
        ) : events.map(evt => (
          <div key={evt.id} className="sg-cal-event-popover-item">
            <div className="sg-cal-event-popover-item-heading">
              <span className="sg-cal-dot" style={{ background: eventColor(evt) }} aria-hidden="true"/>
              <span className="sg-cal-event-popover-item-title">{evt.summary}</span>
            </div>
            <div className="sg-cal-event-popover-item-time">{formatTimeBlock(evt, allDayLabel)}</div>
            {evt.location && (
              <div className="sg-cal-event-popover-item-field">
                <span className="sg-cal-event-popover-item-label">{locationLabel}:</span> {evt.location}
              </div>
            )}
            {evt.description && (
              <div className="sg-cal-event-popover-item-field">
                <span className="sg-cal-event-popover-item-label">{descriptionLabel}:</span> {evt.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

// ── Monthly grid ──────────────────────────────────────────────────────────────

export interface MonthlyCalendarProps {
  events: CalendarEvent[];
  showAllDay: boolean;
  locale: string;
  firstDayOfWeek: 0 | 1;
  showWeekNumbers?: boolean;
  prevMonthLabel: string;
  nextMonthLabel: string;
  allDayLabel: string;
  noEventsLabel: string;
  closeAriaLabel: string;
  locationLabel: string;
  descriptionLabel: string;
  eventColor: (event: CalendarEvent) => string;
}

export function MonthlyCalendar({ events, showAllDay, locale, firstDayOfWeek, showWeekNumbers = false, prevMonthLabel, nextMonthLabel, allDayLabel, noEventsLabel, closeAriaLabel, locationLabel, descriptionLabel, eventColor }: MonthlyCalendarProps) {
  const [display, setDisplay] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
  const [selected, setSelected] = useState<SelectedDay | null>(null);
  const dowLabels = getDowLabels(locale, firstDayOfWeek);
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'short' }).format(display);
  const year = display.getFullYear(), month = display.getMonth();
  const firstDow = (new Date(year, month, 1).getDay() - firstDayOfWeek + 7) % 7;
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const today = localDateKey(new Date());

  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const evt of events) {
    if (!showAllDay && evt.start.date) continue;
    const key = toLocalDateKey(evt);
    const [ey,em] = key.split('-').map(Number);
    if (ey !== year || em !== month+1) continue;
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key)!.push(evt);
  }

  const cells: (number|null)[] = [...Array(firstDow).fill(null), ...Array.from({length: daysInMonth}, (_,i)=>i+1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number|null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  const gridStart = new Date(year, month, 1 - firstDow);

  return (
    <div className="sg-cal-monthly">
      <div className="sg-cal-monthly-nav">
        <button className="sg-cal-monthly-nav-btn" onClick={() => setDisplay(new Date(year,month-1,1))} aria-label={prevMonthLabel}>‹</button>
        <span className="sg-cal-monthly-nav-label">{monthLabel} {year}</span>
        <button className="sg-cal-monthly-nav-btn" onClick={() => setDisplay(new Date(year,month+1,1))} aria-label={nextMonthLabel}>›</button>
      </div>
      <div className={`sg-cal-monthly-grid${showWeekNumbers ? ' sg-cal-monthly-grid--weeks' : ''}`}>
        {showWeekNumbers && <div className="sg-cal-monthly-dow sg-cal-monthly-week-num"/>}
        {dowLabels.map((d,i) => <div key={i} className="sg-cal-monthly-dow">{d}</div>)}
        {rows.map((row, ri) => {
          const rowDate = new Date(gridStart); rowDate.setDate(gridStart.getDate() + ri * 7);
          return (
            <Fragment key={ri}>
              {showWeekNumbers && <div className="sg-cal-monthly-week-num">{getISOWeekNumber(rowDate)}</div>}
              {row.map((day, ci) => {
                if (!day) return <div key={`e${ri}-${ci}`} className="sg-cal-monthly-cell sg-cal-monthly-cell--empty"/>;
                const key = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const dayEvts = eventsByDay.get(key) ?? [];
                return (
                  <div
                    key={key}
                    className={`sg-cal-monthly-cell${key===today?' sg-cal-monthly-cell--today':''}`}
                    onClick={e => setSelected({ dateKey: key, anchor: e.currentTarget.getBoundingClientRect() })}
                    role="button"
                    tabIndex={0}
                  >
                    <span className="sg-cal-monthly-day-num">{day}</span>
                    {dayEvts.length > 0 && (
                      <div className="sg-cal-monthly-dots">
                        {dayEvts.slice(0,3).map(evt => <span key={evt.id} className="sg-cal-monthly-dot" style={{background:eventColor(evt)}}/>)}
                        {dayEvts.length > 3 && <span className="sg-cal-monthly-more">+{dayEvts.length-3}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>
      {selected && (
        <EventDetailsPopover
          selected={selected}
          events={eventsByDay.get(selected.dateKey) ?? []}
          locale={locale}
          allDayLabel={allDayLabel}
          noEventsLabel={noEventsLabel}
          closeAriaLabel={closeAriaLabel}
          locationLabel={locationLabel}
          descriptionLabel={descriptionLabel}
          eventColor={eventColor}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
