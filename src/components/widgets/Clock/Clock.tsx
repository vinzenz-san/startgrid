import { useState, useEffect } from 'react';
import type { ClockData, WidgetAlignment } from '../../../types/widget';
import { SettingsRow, SettingsSwitch, Dropdown } from '../../shared/Form';
import { DetailedSettings } from '../../Layout/DetailedSettings';
import { useSettings } from '../../../contexts/SettingsContext';
import { LOCALES } from '../../../i18n';
import FitText from '../../shared/FitText';
import './Clock.css';

// undefined timeZone (the Intl default) means "use the system/local timezone".
const resolveTimeZone = (timezone?: string) => (timezone && timezone !== 'local' ? timezone : undefined);

function formatTime(d: Date, fmt: '12h' | '24h', secs: boolean, timezone?: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: secs ? '2-digit' : undefined,
    hour12: fmt === '12h',
    timeZone: resolveTimeZone(timezone),
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const h = get('hour').padStart(2, '0');
  const m = get('minute');
  const s = get('second');
  if (fmt === '24h') return secs ? `${h}:${m}:${s}` : `${h}:${m}`;
  const period = get('dayPeriod').toUpperCase();
  return secs ? `${h}:${m}:${s} ${period}` : `${h}:${m} ${period}`;
}

// IANA timezone ids giving full, gapless UTC coverage from UTC-11 through
// UTC+12, sorted chronologically west to east, plus the 'local' sentinel for
// the system timezone (the default). One representative city/id per offset.
const TIMEZONE_IDS = [
  'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver',
  'America/Chicago', 'America/New_York', 'America/Sao_Paulo', 'Atlantic/Azores',
  'Europe/London', 'Europe/Berlin', 'Europe/Athens',
  'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok',
  'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
] as const;

const TIMEZONE_CITY_LABELS: Record<typeof TIMEZONE_IDS[number], string> = {
  'Pacific/Honolulu':    'Honolulu',
  'America/Anchorage':   'Anchorage',
  'America/Los_Angeles': 'Los Angeles',
  'America/Denver':      'Denver',
  'America/Chicago':     'Chicago',
  'America/New_York':    'New York',
  'America/Sao_Paulo':   'São Paulo / Buenos Aires',
  'Atlantic/Azores':     'Azores / Cape Verde',
  'Europe/London':       'London',
  'Europe/Berlin':       'Berlin / Paris',
  'Europe/Athens':       'Cairo / Athens',
  'Asia/Dubai':          'Dubai',
  'Asia/Karachi':        'Karachi',
  'Asia/Kolkata':        'Mumbai / New Delhi',
  'Asia/Dhaka':          'Dhaka / Almaty',
  'Asia/Bangkok':        'Bangkok / Jakarta',
  'Asia/Shanghai':       'Shanghai / Singapore',
  'Asia/Tokyo':          'Tokyo / Seoul',
  'Australia/Sydney':    'Sydney / Melbourne',
  'Pacific/Auckland':    'Auckland',
};

// Current GMT offset for a timezone (DST-aware, since it's computed against
// "now" rather than a fixed value) — e.g. 'GMT+2', 'GMT-4', 'GMT+0'.
function gmtOffsetLabel(timeZone: string | undefined): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(new Date());
    const raw = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+0';
    return raw === 'GMT' ? 'GMT+0' : raw;
  } catch {
    return 'GMT+0';
  }
}

// ── Settings ───────────────────────────────────────────────────────────────

interface SettingsProps {
  data: ClockData;
  onUpdateData: (patch: Partial<ClockData>) => void;
}

export function ClockSettings({ data, onUpdateData }: SettingsProps) {
  const { t } = useSettings();
  const { format = '24h', showSeconds = true, showDate = true,
          timezone = 'local', alignment = 'center' } = data;

  const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
    { value: 'local', label: `${t('widget.clock.tzLocal')} (${gmtOffsetLabel(undefined)})` },
    { value: 'UTC',   label: `${t('widget.clock.tzUtc')} (${gmtOffsetLabel('UTC')})` },
    ...TIMEZONE_IDS.map(id => ({ value: id as string, label: `${TIMEZONE_CITY_LABELS[id]} (${gmtOffsetLabel(id)})` })),
  ];

  const ALIGNMENT_OPTIONS: { value: WidgetAlignment; label: string }[] = [
    { value: 'left',   label: t('widget.quicklinks.align.left') },
    { value: 'center', label: t('widget.quicklinks.align.center') },
    { value: 'right',  label: t('widget.quicklinks.align.right') },
    { value: 'top',    label: t('widget.quicklinks.align.top') },
    { value: 'bottom', label: t('widget.quicklinks.align.bottom') },
  ];

  return (
    <div className="sg-clock-settings" onClick={e => e.stopPropagation()}>
      <SettingsRow label={t('widget.clock.format')}>
        <Dropdown
          options={[{ value: '24h', label: '24h' }, { value: '12h', label: '12h' }]}
          value={format}
          onChange={v => onUpdateData({ format: v })}
        />
      </SettingsRow>
      <SettingsRow label={t('widget.clock.timezone')}>
        <Dropdown
          options={TIMEZONE_OPTIONS}
          value={timezone}
          onChange={v => onUpdateData({ timezone: v })}
          menuWidth="auto"
        />
      </SettingsRow>
      <SettingsRow label={t('widget.greeting.alignment')}>
        <Dropdown
          options={ALIGNMENT_OPTIONS}
          value={alignment}
          onChange={v => onUpdateData({ alignment: v })}
        />
      </SettingsRow>

      <DetailedSettings title={t('widget.clock.formattingSettings')}>
        <SettingsRow label={t('widget.clock.showSeconds')}>
          <SettingsSwitch checked={showSeconds} onChange={v => onUpdateData({ showSeconds: v })} />
        </SettingsRow>
        <SettingsRow label={t('widget.clock.showDate')}>
          <SettingsSwitch checked={showDate} onChange={v => onUpdateData({ showDate: v })} />
        </SettingsRow>
        <SettingsRow label={t('widget.allowOverflow')}>
          <SettingsSwitch checked={data.allowOverflow ?? false} onChange={v => onUpdateData({ allowOverflow: v })} />
        </SettingsRow>
      </DetailedSettings>
    </div>
  );
}

// ── Main widget ────────────────────────────────────────────────────────────

interface Props {
  data: ClockData;
  onUpdateData: (patch: Partial<ClockData>) => void;
}

export default function Clock({ data }: Props) {
  const { language } = useSettings();
  const { format = '24h', showSeconds = true, showDate = true,
          timezone = 'local', alignment = 'center' } = data;
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const dateStr = new Intl.DateTimeFormat(LOCALES[language], {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: resolveTimeZone(timezone),
  }).format(now);

  return (
    <div className={`sg-clock sg-clock--align-${alignment}`}>
      <FitText className="sg-clock-time" widthFactor={0.85} fontWeight={600}>{formatTime(now, format, showSeconds, timezone)}</FitText>
      {showDate && <div className="sg-clock-date">{dateStr}</div>}
    </div>
  );
}
