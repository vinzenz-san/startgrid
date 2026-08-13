import { useRef, useState } from 'react';
import { useBackground } from '../../contexts/BackgroundContext';
import { useSettings } from '../../contexts/SettingsContext';
import { extractCollectionId } from '../../hooks/useUnsplash';
import { MEDIA_PROXY_CONFIGURED } from '../../lib/mediaProxy';
import { BackgroundPosition, UnsplashConfig } from '../../types/background';
import { SettingsRow, SettingsSlider, SettingsSwitch, Dropdown } from '../shared/Form';
import { DetailedSettings } from '../Layout/DetailedSettings';
import CustomColorPicker from '../shared/CustomColorPicker';
import './UnsplashSettings.css';

const noLabel = () => '';

export default function UnsplashSettings() {
  const { config, setConfig, unsplash } = useBackground();
  const { t } = useSettings();
  const [lbPickerOpen, setLbPickerOpen] = useState(false);
  const letterboxBtnRef = useRef<HTMLButtonElement>(null);

  if (config.mode !== 'unsplash') return null;
  const uc = config as UnsplashConfig;

  const POSITION_OPTIONS: { value: BackgroundPosition; label: string }[] = [
    { value: 'center',       label: t('background.pos.center') },
    { value: 'top',          label: t('background.pos.top') },
    { value: 'bottom',       label: t('background.pos.bottom') },
    { value: 'left',         label: t('background.pos.left') },
    { value: 'right',        label: t('background.pos.right') },
    { value: 'top-left',     label: t('background.pos.topLeft') },
    { value: 'top-right',    label: t('background.pos.topRight') },
    { value: 'bottom-left',  label: t('background.pos.bottomLeft') },
    { value: 'bottom-right', label: t('background.pos.bottomRight') },
  ];

  const TOPIC_CHIPS = [
    { label: t('background.unsplash.topic.nature'),       id: '6sMVjTLSkeQ' },
    { label: t('background.unsplash.topic.architecture'), id: 'rnSKDHwwYUk' },
    { label: t('background.unsplash.topic.travel'),       id: 'Fzo3zuOHN6w' },
    { label: t('background.unsplash.topic.minimal'),      id: '_8zFHuhRhyo' },
    { label: t('background.unsplash.topic.street'),       id: 'xHxYTMHLgOc' },
    { label: t('background.unsplash.topic.technology'),   id: 'qPYsDzvJOYc' },
    { label: t('background.unsplash.topic.wallpapers'),   id: 'bo8jQKTaE0Y' },
  ];

  const INTERVAL_OPTIONS: { label: string; value: string }[] = [
    { label: t('background.unsplash.interval.newTab'), value: '0' },
    { label: t('background.unsplash.interval.5min'),   value: '300' },
    { label: t('background.unsplash.interval.15min'),  value: '900' },
    { label: t('background.unsplash.interval.1hour'),  value: '3600' },
    { label: t('background.unsplash.interval.day'),    value: '86400' },
    { label: t('background.unsplash.interval.week'),   value: '604800' },
  ];

  const SOURCE_TABS: { label: string; value: NonNullable<UnsplashConfig['source']> }[] = [
    { label: t('background.unsplash.sourceOfficial'),   value: 'official' },
    { label: t('background.unsplash.sourceTopics'),     value: 'topics' },
    { label: t('background.unsplash.sourceSearch'),     value: 'search' },
    { label: t('background.unsplash.sourceCollection'), value: 'collection' },
  ];

  const update = (patch: Partial<UnsplashConfig>) =>
    setConfig({ ...uc, ...patch });

  const source    = uc.source ?? 'official';
  const topics    = uc.topics ?? [];
  const interval  = String(uc.rotationInterval ?? 86400);
  const showAttr  = uc.showAttribution ?? true;

  const toggleTopic = (id: string) => {
    const next = topics.includes(id)
      ? topics.filter(t => t !== id)
      : [...topics, id];
    update({ topics: next });
  };

  return (
    <div className="sg-usp">

      {/* Source tabs */}
      <section className="settings-section">
        {!MEDIA_PROXY_CONFIGURED && (
          <p className="bg-sync-warning">{t('background.unsplash.noProxyNote')}</p>
        )}
        <div className="settings-section-label">{t('background.unsplash.source')}</div>
        <div className="sg-usp-tabs">
          {SOURCE_TABS.map(t => (
            <button
              key={t.value}
              className={`sg-usp-tab${source === t.value ? ' sg-usp-tab--active' : ''}`}
              onClick={() => update({ source: t.value })}
            >
              {t.label}
            </button>
          ))}
        </div>

        {source === 'official' && (
          <p className="bg-sync-warning" style={{ marginTop: 6 }}>
            {t('background.unsplash.officialNote')}
          </p>
        )}

        {source === 'topics' && (
          <div className="sg-usp-chips">
            {TOPIC_CHIPS.map(chip => (
              <button
                key={chip.id}
                className={`sg-usp-chip${topics.includes(chip.id) ? ' sg-usp-chip--active' : ''}`}
                onClick={() => toggleTopic(chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {source === 'search' && (
          <input
            className="sg-usp-input sg-usp-input--search"
            type="text"
            placeholder={t('background.unsplash.searchPlaceholder')}
            value={uc.query ?? ''}
            onChange={e => update({ query: e.target.value })}
          />
        )}

        {source === 'collection' && (
          <input
            className="sg-usp-input sg-usp-input--search"
            type="text"
            placeholder={t('background.unsplash.collectionIdPlaceholder')}
            value={uc.collectionId ?? ''}
            onChange={e => update({ collectionId: e.target.value.trim() })}
            onPaste={e => {
              const pasted = e.clipboardData.getData('text');
              if (pasted && /\/(collections|kollektionen)\//i.test(pasted)) {
                e.preventDefault();
                update({ collectionId: extractCollectionId(pasted) });
              }
            }}
          />
        )}

        <SettingsRow label={t('background.showTitle')}>
          <SettingsSwitch checked={showAttr} onChange={v => update({ showAttribution: v })} />
        </SettingsRow>
      </section>

      <SettingsRow label={t('background.backgroundColor')}>
        <button
          ref={letterboxBtnRef}
          className="bg-color-swatch"
          style={{ background: uc.letterboxColor ?? '#000000' }}
          onClick={() => setLbPickerOpen(true)}
        />
      </SettingsRow>

      {/* Rotation interval + attribution — advanced */}
      <DetailedSettings>
        <SettingsSlider
          label={t('background.blur')}
          value={uc.blur ?? 0}
          onChange={v => update({ blur: v })}
          min={0}
          max={100}
          step={1}
          valueFormatter={noLabel}
        />

        <div className="bg-luminosity-slider-wrap">
          <SettingsSlider
            label={t('background.luminosity')}
            value={uc.luminosity ?? 100}
            onChange={v => update({ luminosity: v })}
            min={0}
            max={200}
            step={5}
            valueFormatter={noLabel}
          />
        </div>

        <SettingsRow label={t('background.scaleToFit')}>
          <SettingsSwitch
            checked={uc.scaleToFit ?? false}
            onChange={v => update({ scaleToFit: v })}
          />
        </SettingsRow>

        <SettingsRow label={t('background.position')}>
          <Dropdown
            options={POSITION_OPTIONS}
            value={uc.position ?? 'center'}
            onChange={v => update({ position: v })}
          />
        </SettingsRow>

        <SettingsRow label={t('background.autoDimNight')}>
          <SettingsSwitch
            checked={uc.autoDimNight ?? false}
            onChange={v => update({ autoDimNight: v })}
          />
        </SettingsRow>

        {uc.autoDimNight && (
          <div className="bg-night-time-row">
            <div className="bg-night-time-field">
              <span className="bg-night-time-label">{t('background.nightStartsAt')}</span>
              <input
                type="time"
                className="bg-night-time-input"
                value={uc.nightStart || '22:00'}
                onChange={e => update({ nightStart: e.target.value || '22:00' })}
              />
            </div>
            <div className="bg-night-time-field">
              <span className="bg-night-time-label">{t('background.nightEndsAt')}</span>
              <input
                type="time"
                className="bg-night-time-input"
                value={uc.nightEnd || '05:00'}
                onChange={e => update({ nightEnd: e.target.value || '05:00' })}
              />
            </div>
          </div>
        )}

        <SettingsRow label={t('background.unsplash.showNewPhoto')}>
          <Dropdown
            options={INTERVAL_OPTIONS}
            value={interval}
            onChange={v => update({ rotationInterval: Number(v) })}
          />
        </SettingsRow>

        {/* Current attribution preview */}
        {unsplash.attribution && (
          <p className="sg-usp-attr-preview">
            {t('background.unsplash.currentAttributionPrefix')} <em>{unsplash.attribution.photographerName}</em> {t('background.unsplash.currentAttributionSuffix')}
          </p>
        )}
      </DetailedSettings>

      {/* Fetch controls */}
      <section className="settings-section">
        <div className="sg-usp-fetch-row">
          <button
            className="bg-btn sg-usp-fetch-btn"
            onClick={unsplash.fetchNow}
            disabled={unsplash.isFetching}
          >
            {unsplash.isFetching ? t('background.unsplash.loading') : t('background.unsplash.nextPhoto')}
          </button>
        </div>
        {unsplash.error && (
          <p className="sg-usp-error">{unsplash.error}</p>
        )}
      </section>

      <CustomColorPicker
        value={uc.letterboxColor ?? '#000000'}
        onChange={hex => update({ letterboxColor: hex })}
        anchorRef={letterboxBtnRef}
        open={lbPickerOpen}
        onClose={() => setLbPickerOpen(false)}
      />

    </div>
  );
}
