import { useEffect, useState } from 'react';
import type { CurrencyTickerData } from '../../../types/widget';
import { SettingsRow, Dropdown, ActionButton } from '../../shared/Form';
import { useSettings } from '../../../contexts/SettingsContext';
import { useCurrencyTicker } from '../../../hooks/useCurrencyTicker';
import { fetchCurrencyList } from '../../../lib/exchangeRatesApi';
import type { TranslationKey } from '../../../i18n';
import './CurrencyTicker.css';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

const REFRESH_OPTIONS = [30, 60, 240, 1440] as const;

function refreshLabel(min: number, t: Translate): string {
  if (min < 60) return t('widget.currencyTicker.refreshMinutes', { count: min });
  const hours = min / 60;
  return hours >= 24 ? t('widget.currencyTicker.refreshDaily') : t('widget.currencyTicker.refreshHours', { count: hours });
}

// ── Settings ───────────────────────────────────────────────────────────────

interface SettingsProps {
  data: CurrencyTickerData;
  onUpdateData: (patch: Partial<CurrencyTickerData>) => void;
}

export function CurrencyTickerSettings({ data, onUpdateData }: SettingsProps) {
  const { t } = useSettings();
  const base = data.baseCurrency ?? 'EUR';
  const targets = data.targetCurrencies ?? ['USD', 'GBP'];
  const refreshIntervalMin = data.refreshIntervalMin ?? 60;

  const [currencies, setCurrencies] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCurrencyList().then(list => { if (!cancelled) setCurrencies(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const codes = currencies ? Object.keys(currencies).sort() : [base, ...targets];

  function toggleTarget(code: string) {
    const next = targets.includes(code) ? targets.filter(c => c !== code) : [...targets, code];
    onUpdateData({ targetCurrencies: next });
  }

  return (
    <>
      <SettingsRow label={t('widget.currencyTicker.baseCurrency')}>
        <Dropdown
          options={codes.map(code => ({ value: code, label: currencies ? `${code} — ${currencies[code]}` : code }))}
          value={base}
          onChange={v => onUpdateData({ baseCurrency: v, targetCurrencies: targets.filter(c => c !== v) })}
          menuWidth="auto"
        />
      </SettingsRow>

      <SettingsRow label={t('widget.currencyTicker.refreshInterval')}>
        <Dropdown
          options={REFRESH_OPTIONS.map(min => ({ value: String(min), label: refreshLabel(min, t) }))}
          value={String(refreshIntervalMin)}
          onChange={v => onUpdateData({ refreshIntervalMin: Number(v) })}
        />
      </SettingsRow>

      <div className="sg-fx-target-label">{t('widget.currencyTicker.targetCurrencies')}</div>
      <div className="sg-fx-target-list sg-scroll-thin">
        {codes.filter(code => code !== base).map(code => (
          <label key={code} className="sg-fx-target-row">
            <input
              type="checkbox"
              checked={targets.includes(code)}
              onChange={() => toggleTarget(code)}
            />
            <span>{currencies ? `${code} — ${currencies[code]}` : code}</span>
          </label>
        ))}
      </div>
    </>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────

interface Props {
  data: CurrencyTickerData;
}

export default function CurrencyTicker({ data }: Props) {
  const { t } = useSettings();
  const base = data.baseCurrency ?? 'EUR';
  // Defensive: a target equal to the base can only mean stale saved data
  // (e.g. the base was changed after this target was already selected) —
  // never something intentional to render as a self-comparison row.
  const targets = (data.targetCurrencies ?? ['USD', 'GBP']).filter(c => c !== base);

  const { rates, isFetching, error, isStale, refetch } = useCurrencyTicker({
    baseCurrency: base,
    targetCurrencies: targets,
    refreshIntervalMin: data.refreshIntervalMin,
  });

  if (targets.length === 0) {
    return (
      <div className="sg-fx sg-fx--empty">
        <span className="sg-fx-empty-text">{t('widget.currencyTicker.noTargets')}</span>
      </div>
    );
  }

  if (isFetching && Object.keys(rates).length === 0) {
    return <div className="sg-fx sg-fx--empty"><span className="sg-fx-empty-text">{t('widget.currencyTicker.loading')}</span></div>;
  }

  if (error && Object.keys(rates).length === 0) {
    return (
      <div className="sg-fx sg-fx--empty">
        <span className="sg-fx-empty-text">{t('widget.currencyTicker.error')}</span>
        <ActionButton variant="ghost" onClick={refetch}>{t('widget.currencyTicker.retry')}</ActionButton>
      </div>
    );
  }

  return (
    <div className="sg-fx">
      {isStale && <div className="sg-fx-stale-banner">{t('widget.currencyTicker.stale')}</div>}
      <div className="sg-fx-list">
        {targets.map(code => (
          <div key={code} className="sg-fx-row">
            <span className="sg-fx-code">{base}/{code}</span>
            <span className="sg-fx-rate">{rates[code] !== undefined ? rates[code].toFixed(4) : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
