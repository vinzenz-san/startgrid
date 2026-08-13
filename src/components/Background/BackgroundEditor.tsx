import { useRef, useState, useEffect } from 'react';
import { useBackground } from '../../contexts/BackgroundContext';
import { useSettings } from '../../contexts/SettingsContext';
import { BackgroundMode, BackgroundPanel, BackgroundPosition, UnsplashConfig, OnlineImageConfig } from '../../types/background';
import { COLOR_PRESETS } from '../../lib/presets';
import { getAdaptiveColor } from '../../lib/colorUtils';
import { MEDIA_PROXY_CONFIGURED } from '../../lib/mediaProxy';
import { BACKGROUND_PROVIDERS } from './providers';
import CustomColorPicker from '../shared/CustomColorPicker';
import { SettingsSlider, SettingsRow, SettingsSwitch, Dropdown } from '../shared/Form';
import UnsplashSettings from './UnsplashSettings';
import { DetailedSettings } from '../Layout/DetailedSettings';
import './BackgroundEditor.css';

const SIZE_LIMIT_MB = 5;

const noLabel = () => '';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type EditorTab = BackgroundPanel;

function modeToTab(mode: BackgroundMode): EditorTab {
  return BACKGROUND_PROVIDERS[mode]?.panel ?? 'colors';
}

export default function BackgroundEditor() {
  const { config, customImageUrl, setConfig, setCustomImage, clearCustomImage, bing, astronomy, wikimedia } = useBackground();
  const { colorScheme, t } = useSettings();
  const isDark = colorScheme !== 'light';

  const DATE_MODE_OPTIONS = [
    { value: 'today' as const,  label: t('background.dateMode.today') },
    { value: 'custom' as const, label: t('background.dateMode.custom') },
  ];

  const GRADIENT_TYPE_OPTIONS = [
    { value: 'linear' as const, label: t('background.gradientType.linear') },
    { value: 'radial' as const, label: t('background.gradientType.radial') },
  ];

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

  // Labels for the dropdown itself — a panel groups several provider modes
  // (e.g. "colors" spans preset/color/gradient), so it isn't any single
  // provider's own `label`.
  const PANEL_LABELS: Record<EditorTab, string> = {
    colors: t('background.panel.colors'),
    image: t('background.panel.image'),
    unsplash: t('background.panel.unsplash'),
    bing: t('background.panel.bing'),
    astronomy: t('background.panel.astronomy'),
    gradient: t('background.panel.gradient'),
    online: t('background.panel.online'),
    wikimedia: t('background.panel.wikimedia'),
  };

  // Dynamically derived from the registry (deduped by panel), then sorted
  // alphabetically by the current locale's label so a future provider just
  // needs to declare its `panel` to show up here in the right place — no
  // hardcoded tab list to maintain. Recomputed per render so the sort order
  // (and labels) track the active language.
  const PANEL_OPTIONS: { value: EditorTab; label: string }[] = (() => {
    const seen = new Set<EditorTab>();
    const options: { value: EditorTab; label: string }[] = [];
    for (const def of Object.values(BACKGROUND_PROVIDERS)) {
      if (!seen.has(def.panel)) {
        seen.add(def.panel);
        options.push({ value: def.panel, label: PANEL_LABELS[def.panel] });
      }
    }
    options.sort((a, b) => a.label.localeCompare(b.label));
    return options;
  })();
  const fileRef        = useRef<HTMLInputElement>(null);
  const customSwatchRef = useRef<HTMLButtonElement>(null);
  const letterboxBtnRef = useRef<HTMLButtonElement>(null);
  const gradFromBtnRef  = useRef<HTMLButtonElement>(null);
  const gradToBtnRef    = useRef<HTMLButtonElement>(null);
  const [dragOver, setDragOver]       = useState(false);
  const [pickerOpen, setPickerOpen]   = useState(false);
  const [lbPickerOpen, setLbPickerOpen] = useState(false);
  const [gradPickerOpen, setGradPickerOpen] = useState<'from' | 'to' | null>(null);

  const activeTab = modeToTab(config.mode);

  const lastUnsplashConfig = useRef<UnsplashConfig>({ mode: 'unsplash', value: '', source: 'topics', showAttribution: true });
  useEffect(() => {
    if (config.mode === 'unsplash') lastUnsplashConfig.current = config as UnsplashConfig;
  }, [config]);

  // Same tab-switch persistence pattern as Unsplash above — without this, the
  // user-entered URL (and any display-control tweaks) is discarded every time
  // they switch away from the Online Image tab and back.
  const lastOnlineConfig = useRef<OnlineImageConfig>({ mode: 'online', value: '' });
  useEffect(() => {
    if (config.mode === 'online') lastOnlineConfig.current = config as OnlineImageConfig;
  }, [config]);

  const switchTab = (tab: EditorTab) => {
    if (tab === activeTab) return;
    if (tab === 'colors')   { setConfig({ ...config, mode: 'preset', value: COLOR_PRESETS[0].id }); return; }
    if (tab === 'image')    { setConfig({ mode: 'custom', value: '' }); return; }
    if (tab === 'unsplash') { setConfig(lastUnsplashConfig.current); return; }
    if (tab === 'bing')     { setConfig({ mode: 'bing', value: '' }); return; }
    if (tab === 'gradient') { setConfig({ mode: 'colourGradient', value: '' }); return; }
    if (tab === 'online')   { setConfig(lastOnlineConfig.current); return; }
    // 'astronomy' / 'wikimedia' — resolve the mode from the registry rather
    // than hardcoding one branch per provider.
    const provider = Object.values(BACKGROUND_PROVIDERS).find(def => def.panel === tab);
    if (provider) setConfig({ mode: provider.mode, value: '' } as typeof config);
  };

  const isPlaceholderTab = !['colors', 'image', 'unsplash', 'bing', 'astronomy', 'gradient', 'online', 'wikimedia'].includes(activeTab);

  const processFile = (file: File) => {
    if (file.size > SIZE_LIMIT_MB * 1024 * 1024) {
      alert(t('background.imageSizeLimitAlert', { limit: SIZE_LIMIT_MB, size: (file.size / 1024 / 1024).toFixed(1) }));
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') setCustomImage(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) processFile(file);
  };

  const astro       = config.mode === 'astronomy' ? config : null;
  const bingCfg     = config.mode === 'bing' ? config : null;
  const wikiCfg     = config.mode === 'wikimedia' ? config : null;
  const grad        = config.mode === 'colourGradient' ? config : null;
  const customCfg   = config.mode === 'custom' ? config : null;
  const onlineCfg   = config.mode === 'online' ? config : null;
  const isCustomActive = config.mode === 'color' || config.mode === 'gradient';
  const isPresetActive = (id: string) => config.mode === 'preset' && config.value === id;
  // Live theme-accurate preview: exact for the mode it was picked in, derived otherwise.
  const pickerValue = config.customColor
    ? getAdaptiveColor({ color: config.customColor, pickedInDark: config.customColorScheme !== 'light' }, isDark)
    : '#6366f1';

  const handleCustomColorPick = (hex: string) => {
    setConfig({ ...config, mode: 'color', value: hex, customColor: hex, customColorScheme: isDark ? 'dark' : 'light' });
  };

  return (
    <div className="bg-editor" onClick={e => e.stopPropagation()}>

      {/* ── Mode switcher ── */}
      <Dropdown
        options={PANEL_OPTIONS}
        value={activeTab}
        onChange={switchTab}
      />

      {/* ── Colors tab ── */}
      {activeTab === 'colors' && (
        <>
          <section className="settings-section">
            <div className="settings-section-label">{t('background.panel.colors')}</div>
            <div className="preset-grid">
              {COLOR_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  className={`preset-tile${isPresetActive(preset.id) ? ' active' : ''}`}
                  data-preset-id={preset.id}
                  onClick={() => setConfig({ ...config, mode: 'preset', value: preset.id })}
                >
                  {isPresetActive(preset.id) && <span className="sg-swatch-check-lg">✓</span>}
                  <span className="preset-tile-label">{preset.label}</span>
                </button>
              ))}
            </div>

            <SettingsRow label={t('background.customColor')}>
              <button
                ref={customSwatchRef}
                className={`bg-color-swatch${isCustomActive ? ' active' : ''}`}
                style={{ background: pickerValue }}
                onClick={() => setPickerOpen(true)}
              />
            </SettingsRow>

            <SettingsRow label={t('background.autoDimNight')}>
              <SettingsSwitch
                checked={config.autoDimNight ?? false}
                onChange={v => setConfig({ ...config, autoDimNight: v })}
              />
            </SettingsRow>

            {config.autoDimNight && (
              <div className="bg-night-time-row">
                <div className="bg-night-time-field">
                  <span className="bg-night-time-label">{t('background.nightStartsAt')}</span>
                  <input
                    type="time"
                    className="bg-night-time-input"
                    value={config.nightStart || '22:00'}
                    onChange={e => setConfig({ ...config, nightStart: e.target.value || '22:00' })}
                  />
                </div>
                <div className="bg-night-time-field">
                  <span className="bg-night-time-label">{t('background.nightEndsAt')}</span>
                  <input
                    type="time"
                    className="bg-night-time-input"
                    value={config.nightEnd || '05:00'}
                    onChange={e => setConfig({ ...config, nightEnd: e.target.value || '05:00' })}
                  />
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* ── Image tab ── */}
      {activeTab === 'image' && (
        <section className="settings-section" style={{ paddingBottom: 12 }}>
          <div className="settings-section-label">{t('background.section.customImage')}</div>
          {customImageUrl ? (
            <div className="bg-custom-preview">
              <img src={customImageUrl} className="bg-custom-thumb" alt="custom background" />
              <div className="bg-custom-actions">
                <button className="bg-btn" onClick={() => setConfig({ ...config, mode: 'custom', value: '' })}>
                  {t('background.useThis')}
                </button>
                <button className="bg-btn bg-btn--danger" onClick={clearCustomImage}>
                  {t('background.remove')}
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`bg-upload-btn${dragOver ? ' bg-upload-btn--drag-over' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {t('background.uploadImageGif')}
              <span className="bg-upload-hint">{t('background.uploadHint', { limit: SIZE_LIMIT_MB })}</span>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
          <p className="bg-sync-warning">{t('background.mediaNoSyncWarning')}</p>
          {customImageUrl && customCfg && (
            <>
              <SettingsRow label={t('background.backgroundColor')}>
                <button
                  ref={letterboxBtnRef}
                  className="bg-color-swatch"
                  style={{ background: customCfg.letterboxColor ?? '#000000' }}
                  onClick={() => setLbPickerOpen(true)}
                />
              </SettingsRow>

              <DetailedSettings>
                <SettingsSlider
                  label={t('background.blur')}
                  value={customCfg.blur ?? 0}
                  onChange={v => setConfig({ ...customCfg, blur: v })}
                  min={0}
                  max={100}
                  step={1}
                  valueFormatter={noLabel}
                />

                <div className="bg-luminosity-slider-wrap">
                  <SettingsSlider
                    label={t('background.luminosity')}
                    value={customCfg.luminosity ?? 100}
                    onChange={v => setConfig({ ...customCfg, luminosity: v })}
                    min={0}
                    max={200}
                    step={5}
                    valueFormatter={noLabel}
                  />
                </div>

                <SettingsRow label={t('background.scaleToFit')}>
                  <SettingsSwitch
                    checked={customCfg.scaleToFit ?? true}
                    onChange={v => setConfig({ ...customCfg, scaleToFit: v })}
                  />
                </SettingsRow>

                <SettingsRow label={t('background.position')}>
                  <Dropdown
                    options={POSITION_OPTIONS}
                    value={customCfg.position ?? 'center'}
                    onChange={v => setConfig({ ...customCfg, position: v })}
                  />
                </SettingsRow>

                <SettingsRow label={t('background.autoDimNight')}>
                  <SettingsSwitch
                    checked={customCfg.autoDimNight ?? false}
                    onChange={v => setConfig({ ...customCfg, autoDimNight: v })}
                  />
                </SettingsRow>

                {customCfg.autoDimNight && (
                  <div className="bg-night-time-row">
                    <div className="bg-night-time-field">
                      <span className="bg-night-time-label">{t('background.nightStartsAt')}</span>
                      <input
                        type="time"
                        className="bg-night-time-input"
                        value={customCfg.nightStart || '22:00'}
                        onChange={e => setConfig({ ...customCfg, nightStart: e.target.value || '22:00' })}
                      />
                    </div>
                    <div className="bg-night-time-field">
                      <span className="bg-night-time-label">{t('background.nightEndsAt')}</span>
                      <input
                        type="time"
                        className="bg-night-time-input"
                        value={customCfg.nightEnd || '05:00'}
                        onChange={e => setConfig({ ...customCfg, nightEnd: e.target.value || '05:00' })}
                      />
                    </div>
                  </div>
                )}
              </DetailedSettings>
            </>
          )}
        </section>
      )}

      {/* ── Unsplash tab ── */}
      {activeTab === 'unsplash' && <UnsplashSettings />}

      {/* ── Bing tab — refreshes automatically, plus display controls ── */}
      {activeTab === 'bing' && bingCfg && (
        <section className="settings-section">
          <div className="settings-section-label">{t('background.panel.bing')}</div>
          {bing.error && <p className="bg-bing-error">{bing.error}</p>}

          <SettingsRow label={t('background.date')}>
            <Dropdown
              options={DATE_MODE_OPTIONS}
              value={bingCfg.dateMode ?? 'today'}
              onChange={v => setConfig({ ...bingCfg, dateMode: v })}
            />
          </SettingsRow>

          {bingCfg.dateMode === 'custom' && (
            <div className="bg-apod-date-row">
              <span className="bg-apod-date-icon" aria-hidden="true">📅</span>
              <input
                type="date"
                className="bg-apod-date-input"
                value={bingCfg.customDate ?? todayIso()}
                max={todayIso()}
                onChange={e => setConfig({ ...bingCfg, customDate: e.target.value })}
              />
            </div>
          )}

          <SettingsRow label={t('background.showTitle')}>
            <SettingsSwitch
              checked={bingCfg.showTitle ?? false}
              onChange={v => setConfig({ ...bingCfg, showTitle: v })}
            />
          </SettingsRow>

          <SettingsRow label={t('background.backgroundColor')}>
            <button
              ref={letterboxBtnRef}
              className="bg-color-swatch"
              style={{ background: bingCfg.letterboxColor ?? '#000000' }}
              onClick={() => setLbPickerOpen(true)}
            />
          </SettingsRow>

          <DetailedSettings>
            <SettingsSlider
              label={t('background.blur')}
              value={bingCfg.blur ?? 0}
              onChange={v => setConfig({ ...bingCfg, blur: v })}
              min={0}
              max={100}
              step={1}
              valueFormatter={noLabel}
            />

            <div className="bg-luminosity-slider-wrap">
              <SettingsSlider
                label={t('background.luminosity')}
                value={bingCfg.luminosity ?? 100}
                onChange={v => setConfig({ ...bingCfg, luminosity: v })}
                min={0}
                max={200}
                step={5}
                valueFormatter={noLabel}
              />
            </div>

            <SettingsRow label={t('background.scaleToFit')}>
              <SettingsSwitch
                checked={bingCfg.scaleToFit ?? false}
                onChange={v => setConfig({ ...bingCfg, scaleToFit: v })}
              />
            </SettingsRow>

            <SettingsRow label={t('background.position')}>
              <Dropdown
                options={POSITION_OPTIONS}
                value={bingCfg.position ?? 'center'}
                onChange={v => setConfig({ ...bingCfg, position: v })}
              />
            </SettingsRow>

            <SettingsRow label={t('background.autoDimNight')}>
              <SettingsSwitch
                checked={bingCfg.autoDimNight ?? false}
                onChange={v => setConfig({ ...bingCfg, autoDimNight: v })}
              />
            </SettingsRow>

            {bingCfg.autoDimNight && (
              <div className="bg-night-time-row">
                <div className="bg-night-time-field">
                  <span className="bg-night-time-label">{t('background.nightStartsAt')}</span>
                  <input
                    type="time"
                    className="bg-night-time-input"
                    value={bingCfg.nightStart || '22:00'}
                    onChange={e => setConfig({ ...bingCfg, nightStart: e.target.value || '22:00' })}
                  />
                </div>
                <div className="bg-night-time-field">
                  <span className="bg-night-time-label">{t('background.nightEndsAt')}</span>
                  <input
                    type="time"
                    className="bg-night-time-input"
                    value={bingCfg.nightEnd || '05:00'}
                    onChange={e => setConfig({ ...bingCfg, nightEnd: e.target.value || '05:00' })}
                  />
                </div>
              </div>
            )}
          </DetailedSettings>
        </section>
      )}

      {/* ── Astronomy tab — NASA Picture of the Day, refreshes automatically ── */}
      {activeTab === 'astronomy' && astro && (
        <section className="settings-section">
          <div className="settings-section-label">{t('background.panel.astronomy')}</div>
          {!MEDIA_PROXY_CONFIGURED && (
            <p className="bg-sync-warning">{t('background.astronomy.noProxyNote')}</p>
          )}
          {astronomy.error && <p className="bg-bing-error">{astronomy.error}</p>}

          <SettingsRow label={t('background.date')}>
            <Dropdown
              options={DATE_MODE_OPTIONS}
              value={astro.dateMode ?? 'today'}
              onChange={v => setConfig({ ...astro, dateMode: v })}
            />
          </SettingsRow>

          {astro.dateMode === 'custom' && (
            <div className="bg-apod-date-row">
              <span className="bg-apod-date-icon" aria-hidden="true">📅</span>
              <input
                type="date"
                className="bg-apod-date-input"
                value={astro.customDate ?? todayIso()}
                max={todayIso()}
                onChange={e => setConfig({ ...astro, customDate: e.target.value })}
              />
            </div>
          )}

          <SettingsRow label={t('background.showTitle')}>
            <SettingsSwitch
              checked={astro.showApodTitle ?? false}
              onChange={v => setConfig({ ...astro, showApodTitle: v })}
            />
          </SettingsRow>

          <SettingsRow label={t('background.backgroundColor')}>
            <button
              ref={letterboxBtnRef}
              className="bg-color-swatch"
              style={{ background: astro.letterboxColor ?? '#000000' }}
              onClick={() => setLbPickerOpen(true)}
            />
          </SettingsRow>

          <DetailedSettings>
            <SettingsSlider
              label={t('background.blur')}
              value={astro.blur ?? 0}
              onChange={v => setConfig({ ...astro, blur: v })}
              min={0}
              max={100}
              step={1}
              valueFormatter={noLabel}
            />

            <div className="bg-luminosity-slider-wrap">
              <SettingsSlider
                label={t('background.luminosity')}
                value={astro.luminosity ?? 100}
                onChange={v => setConfig({ ...astro, luminosity: v })}
                min={0}
                max={200}
                step={5}
                valueFormatter={noLabel}
              />
            </div>

            <SettingsRow label={t('background.scaleToFit')}>
              <SettingsSwitch
                checked={astro.scaleToFit ?? false}
                onChange={v => setConfig({ ...astro, scaleToFit: v })}
              />
            </SettingsRow>

            <SettingsRow label={t('background.position')}>
              <Dropdown
                options={POSITION_OPTIONS}
                value={astro.position ?? 'center'}
                onChange={v => setConfig({ ...astro, position: v })}
              />
            </SettingsRow>

            <SettingsRow label={t('background.autoDimNight')}>
              <SettingsSwitch
                checked={astro.autoDimNight ?? false}
                onChange={v => setConfig({ ...astro, autoDimNight: v })}
              />
            </SettingsRow>

            {astro.autoDimNight && (
              <div className="bg-night-time-row">
                <div className="bg-night-time-field">
                  <span className="bg-night-time-label">{t('background.nightStartsAt')}</span>
                  <input
                    type="time"
                    className="bg-night-time-input"
                    value={astro.nightStart || '22:00'}
                    onChange={e => setConfig({ ...astro, nightStart: e.target.value || '22:00' })}
                  />
                </div>
                <div className="bg-night-time-field">
                  <span className="bg-night-time-label">{t('background.nightEndsAt')}</span>
                  <input
                    type="time"
                    className="bg-night-time-input"
                    value={astro.nightEnd || '05:00'}
                    onChange={e => setConfig({ ...astro, nightEnd: e.target.value || '05:00' })}
                  />
                </div>
              </div>
            )}
          </DetailedSettings>
        </section>
      )}

      {/* ── Color Gradient tab ── */}
      {activeTab === 'gradient' && grad && (
        <section className="settings-section">
          <div className="settings-section-label">{t('background.panel.gradient')}</div>

          <SettingsRow label={t('background.gradientTypeLabel')}>
            <Dropdown
              options={GRADIENT_TYPE_OPTIONS}
              value={grad.gradientType ?? 'linear'}
              onChange={v => setConfig({ ...grad, gradientType: v })}
            />
          </SettingsRow>

          <SettingsRow label={t('background.fromColor')}>
            <button
              ref={gradFromBtnRef}
              className="bg-color-swatch"
              style={{ background: grad.from ?? '#3498db' }}
              onClick={() => setGradPickerOpen('from')}
            />
          </SettingsRow>

          <SettingsRow label={t('background.toColor')}>
            <button
              ref={gradToBtnRef}
              className="bg-color-swatch"
              style={{ background: grad.to ?? '#9b59b6' }}
              onClick={() => setGradPickerOpen('to')}
            />
          </SettingsRow>

          {(grad.gradientType ?? 'linear') === 'linear' && (
            <SettingsSlider
              label={t('background.angle')}
              value={grad.angle ?? 135}
              onChange={v => setConfig({ ...grad, angle: v })}
              min={0}
              max={360}
              step={1}
              valueFormatter={v => `${v}°`}
            />
          )}

          <SettingsRow label={t('background.autoDimNight')}>
            <SettingsSwitch
              checked={grad.autoDimNight ?? false}
              onChange={v => setConfig({ ...grad, autoDimNight: v })}
            />
          </SettingsRow>

          {grad.autoDimNight && (
            <div className="bg-night-time-row">
              <div className="bg-night-time-field">
                <span className="bg-night-time-label">{t('background.nightStartsAt')}</span>
                <input
                  type="time"
                  className="bg-night-time-input"
                  value={grad.nightStart || '22:00'}
                  onChange={e => setConfig({ ...grad, nightStart: e.target.value || '22:00' })}
                />
              </div>
              <div className="bg-night-time-field">
                <span className="bg-night-time-label">{t('background.nightEndsAt')}</span>
                <input
                  type="time"
                  className="bg-night-time-input"
                  value={grad.nightEnd || '05:00'}
                  onChange={e => setConfig({ ...grad, nightEnd: e.target.value || '05:00' })}
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Online Image tab — mirrors the Custom Image panel's layout exactly ── */}
      {activeTab === 'online' && onlineCfg && (
        <section className="settings-section">
          <div className="settings-section-label">{t('background.panel.online')}</div>

          <input
            className="bg-url-input"
            type="url"
            placeholder={t('background.onlineUrlPlaceholder')}
            value={onlineCfg.value}
            onChange={e => setConfig({ ...onlineCfg, value: e.target.value.trim() })}
            spellCheck={false}
          />

          {onlineCfg.value && (
            <>
              <SettingsRow label={t('background.backgroundColor')}>
                <button
                  ref={letterboxBtnRef}
                  className="bg-color-swatch"
                  style={{ background: onlineCfg.letterboxColor ?? '#000000' }}
                  onClick={() => setLbPickerOpen(true)}
                />
              </SettingsRow>

              <DetailedSettings>
                <SettingsSlider
                  label={t('background.blur')}
                  value={onlineCfg.blur ?? 0}
                  onChange={v => setConfig({ ...onlineCfg, blur: v })}
                  min={0}
                  max={100}
                  step={1}
                  valueFormatter={noLabel}
                />

                <div className="bg-luminosity-slider-wrap">
                  <SettingsSlider
                    label={t('background.luminosity')}
                    value={onlineCfg.luminosity ?? 100}
                    onChange={v => setConfig({ ...onlineCfg, luminosity: v })}
                    min={0}
                    max={200}
                    step={5}
                    valueFormatter={noLabel}
                  />
                </div>

                <SettingsRow label={t('background.scaleToFit')}>
                  <SettingsSwitch
                    checked={onlineCfg.scaleToFit ?? true}
                    onChange={v => setConfig({ ...onlineCfg, scaleToFit: v })}
                  />
                </SettingsRow>

                <SettingsRow label={t('background.position')}>
                  <Dropdown
                    options={POSITION_OPTIONS}
                    value={onlineCfg.position ?? 'center'}
                    onChange={v => setConfig({ ...onlineCfg, position: v })}
                  />
                </SettingsRow>

                <SettingsRow label={t('background.autoDimNight')}>
                  <SettingsSwitch
                    checked={onlineCfg.autoDimNight ?? false}
                    onChange={v => setConfig({ ...onlineCfg, autoDimNight: v })}
                  />
                </SettingsRow>

                {onlineCfg.autoDimNight && (
                  <div className="bg-night-time-row">
                    <div className="bg-night-time-field">
                      <span className="bg-night-time-label">{t('background.nightStartsAt')}</span>
                      <input
                        type="time"
                        className="bg-night-time-input"
                        value={onlineCfg.nightStart || '22:00'}
                        onChange={e => setConfig({ ...onlineCfg, nightStart: e.target.value || '22:00' })}
                      />
                    </div>
                    <div className="bg-night-time-field">
                      <span className="bg-night-time-label">{t('background.nightEndsAt')}</span>
                      <input
                        type="time"
                        className="bg-night-time-input"
                        value={onlineCfg.nightEnd || '05:00'}
                        onChange={e => setConfig({ ...onlineCfg, nightEnd: e.target.value || '05:00' })}
                      />
                    </div>
                  </div>
                )}
              </DetailedSettings>
            </>
          )}
        </section>
      )}

      {/* ── Wikimedia tab — Picture of the Day, refreshes automatically ── */}
      {activeTab === 'wikimedia' && wikiCfg && (
        <section className="settings-section">
          <div className="settings-section-label">{t('background.panel.wikimedia')}</div>
          {wikimedia.error && <p className="bg-bing-error">{wikimedia.error}</p>}

          <SettingsRow label={t('background.date')}>
            <Dropdown
              options={DATE_MODE_OPTIONS}
              value={wikiCfg.dateMode ?? 'today'}
              onChange={v => setConfig({ ...wikiCfg, dateMode: v })}
            />
          </SettingsRow>

          {wikiCfg.dateMode === 'custom' && (
            <div className="bg-apod-date-row">
              <span className="bg-apod-date-icon" aria-hidden="true">📅</span>
              <input
                type="date"
                className="bg-apod-date-input"
                value={wikiCfg.customDate ?? todayIso()}
                max={todayIso()}
                onChange={e => setConfig({ ...wikiCfg, customDate: e.target.value })}
              />
            </div>
          )}

          <SettingsRow label={t('background.showTitle')}>
            <SettingsSwitch
              checked={wikiCfg.showTitle ?? false}
              onChange={v => setConfig({ ...wikiCfg, showTitle: v })}
            />
          </SettingsRow>

          <SettingsRow label={t('background.backgroundColor')}>
            <button
              ref={letterboxBtnRef}
              className="bg-color-swatch"
              style={{ background: wikiCfg.letterboxColor ?? '#000000' }}
              onClick={() => setLbPickerOpen(true)}
            />
          </SettingsRow>

          <DetailedSettings>
            <SettingsSlider
              label={t('background.blur')}
              value={wikiCfg.blur ?? 0}
              onChange={v => setConfig({ ...wikiCfg, blur: v })}
              min={0}
              max={100}
              step={1}
              valueFormatter={noLabel}
            />

            <div className="bg-luminosity-slider-wrap">
              <SettingsSlider
                label={t('background.luminosity')}
                value={wikiCfg.luminosity ?? 100}
                onChange={v => setConfig({ ...wikiCfg, luminosity: v })}
                min={0}
                max={200}
                step={5}
                valueFormatter={noLabel}
              />
            </div>

            <SettingsRow label={t('background.scaleToFit')}>
              <SettingsSwitch
                checked={wikiCfg.scaleToFit ?? false}
                onChange={v => setConfig({ ...wikiCfg, scaleToFit: v })}
              />
            </SettingsRow>

            <SettingsRow label={t('background.position')}>
              <Dropdown
                options={POSITION_OPTIONS}
                value={wikiCfg.position ?? 'center'}
                onChange={v => setConfig({ ...wikiCfg, position: v })}
              />
            </SettingsRow>

            <SettingsRow label={t('background.autoDimNight')}>
              <SettingsSwitch
                checked={wikiCfg.autoDimNight ?? false}
                onChange={v => setConfig({ ...wikiCfg, autoDimNight: v })}
              />
            </SettingsRow>

            {wikiCfg.autoDimNight && (
              <div className="bg-night-time-row">
                <div className="bg-night-time-field">
                  <span className="bg-night-time-label">{t('background.nightStartsAt')}</span>
                  <input
                    type="time"
                    className="bg-night-time-input"
                    value={wikiCfg.nightStart || '22:00'}
                    onChange={e => setConfig({ ...wikiCfg, nightStart: e.target.value || '22:00' })}
                  />
                </div>
                <div className="bg-night-time-field">
                  <span className="bg-night-time-label">{t('background.nightEndsAt')}</span>
                  <input
                    type="time"
                    className="bg-night-time-input"
                    value={wikiCfg.nightEnd || '05:00'}
                    onChange={e => setConfig({ ...wikiCfg, nightEnd: e.target.value || '05:00' })}
                  />
                </div>
              </div>
            )}
          </DetailedSettings>
        </section>
      )}

      {/* ── Placeholder tabs (none currently) ── */}
      {isPlaceholderTab && (
        <section className="settings-section">
          <div className="settings-section-label">{PANEL_LABELS[activeTab]}</div>
          <p className="bg-bing-note">{t('background.comingSoon')}</p>
        </section>
      )}

      {/* Color pickers (portal-rendered) */}
      <CustomColorPicker
        value={config.letterboxColor ?? '#000000'}
        onChange={hex => setConfig({ ...config, letterboxColor: hex })}
        anchorRef={letterboxBtnRef}
        open={lbPickerOpen}
        onClose={() => setLbPickerOpen(false)}
      />
      <CustomColorPicker
        value={pickerValue}
        onChange={handleCustomColorPick}
        anchorRef={customSwatchRef}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
      />
      {grad && (
        <>
          <CustomColorPicker
            value={grad.from ?? '#3498db'}
            onChange={hex => setConfig({ ...grad, from: hex })}
            anchorRef={gradFromBtnRef}
            open={gradPickerOpen === 'from'}
            onClose={() => setGradPickerOpen(null)}
          />
          <CustomColorPicker
            value={grad.to ?? '#9b59b6'}
            onChange={hex => setConfig({ ...grad, to: hex })}
            anchorRef={gradToBtnRef}
            open={gradPickerOpen === 'to'}
            onClose={() => setGradPickerOpen(null)}
          />
        </>
      )}
    </div>
  );
}
