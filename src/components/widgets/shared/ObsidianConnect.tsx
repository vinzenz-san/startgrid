import { useEffect, useState } from 'react';
import { SettingsRow } from '../../shared/Form';
import { useSettings } from '../../../contexts/SettingsContext';
import { useObsidian } from '../../../hooks/useObsidian';
import { DEFAULT_BASE_URL, type ConnectionTestResult } from '../../../lib/obsidianApi';
import { isExtensionEnv } from '../../../lib/permissions';
import './obsidian.css';

/**
 * The connection block every Obsidian widget renders in its settings panel.
 *
 * The connection itself is global (one record in storage.local), so
 * configuring it from any one widget wires up all of them — this component is
 * just the shared editor for that record, mirroring how each Outlook widget
 * renders the same useMsAuth-backed account section.
 */
export default function ObsidianConnect() {
  const { t } = useSettings();
  const { isConfigured, hasPermission, connection, checking, save, disconnect, grantPermission, test } = useObsidian();

  const [baseUrl,   setBaseUrl]   = useState(DEFAULT_BASE_URL);
  const [apiKey,    setApiKey]    = useState('');
  const [vaultName, setVaultName] = useState('');
  const [testing,   setTesting]   = useState(false);
  const [result,    setResult]    = useState<ConnectionTestResult | null>(null);

  // Hydrate the form once the stored record arrives.
  useEffect(() => {
    if (!connection) return;
    setBaseUrl(connection.baseUrl);
    setApiKey(connection.apiKey);
    setVaultName(connection.vaultName ?? '');
  }, [connection]);

  const stop = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onMouseDown:   (e: React.MouseEvent)   => e.stopPropagation(),
    onDragStart:   (e: React.DragEvent)    => e.stopPropagation(),
  };

  function persist() {
    if (!apiKey.trim()) return;
    void save({
      baseUrl:   baseUrl.trim() || DEFAULT_BASE_URL,
      apiKey:    apiKey.trim(),
      vaultName: vaultName.trim() || undefined,
    });
  }

  async function handleTest() {
    setTesting(true);
    setResult(null);
    const candidate = {
      baseUrl:   baseUrl.trim() || DEFAULT_BASE_URL,
      apiKey:    apiKey.trim(),
      vaultName: vaultName.trim() || undefined,
    };
    const res = await test(candidate);
    if (res.ok) await save(candidate);
    setResult(res);
    setTesting(false);
  }

  function resultMessage(res: ConnectionTestResult): string {
    if (res.ok) {
      return res.version
        ? t('widget.obsidian.testOkVersion', { version: res.version })
        : t('widget.obsidian.testOk');
    }
    switch (res.code) {
      case 'NO_PERMISSION':  return t('widget.obsidian.errNoPermission');
      case 'NOT_CONFIGURED': return t('widget.obsidian.errNoKey');
      case 'UNAUTHORIZED':   return t('widget.obsidian.errUnauthorized');
      case 'UNREACHABLE':    return t('widget.obsidian.errUnreachable');
      default:               return t('widget.obsidian.errGeneric');
    }
  }

  if (!isExtensionEnv) {
    return <p className="sg-obs-hint">{t('widget.obsidian.previewOnly')}</p>;
  }

  return (
    <div className="sg-cal-settings-section">
      {!hasPermission && !checking && (
        <>
          {/* Called straight from the click — lib/permissions.ts explains why
              nothing may be awaited before permissions.request() in Firefox. */}
          <button className="sg-cal-connect-btn" onClick={() => void grantPermission()}>
            {t('widget.obsidian.grantAccess')}
          </button>
          <p className="sg-obs-hint">{t('widget.obsidian.grantNote')}</p>
        </>
      )}

      <SettingsRow label={t('widget.obsidian.serverUrl')}>
        <input
          className="sg-obs-input sg-obs-input--mono"
          placeholder={DEFAULT_BASE_URL}
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          onBlur={persist}
          {...stop}
        />
      </SettingsRow>

      <SettingsRow label={t('widget.obsidian.apiKey')}>
        <input
          className="sg-obs-input sg-obs-input--mono"
          type="password"
          autoComplete="off"
          placeholder={t('widget.obsidian.apiKeyPlaceholder')}
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          onBlur={persist}
          {...stop}
        />
      </SettingsRow>

      <SettingsRow label={t('widget.obsidian.vaultName')}>
        <input
          className="sg-obs-input"
          placeholder={t('widget.obsidian.vaultPlaceholder')}
          value={vaultName}
          onChange={e => setVaultName(e.target.value)}
          onBlur={persist}
          {...stop}
        />
      </SettingsRow>

      <button
        className="sg-cal-connect-btn"
        onClick={() => void handleTest()}
        disabled={testing || !apiKey.trim()}
      >
        {testing ? t('widget.obsidian.testing') : t('widget.obsidian.testConnection')}
      </button>

      {result && (
        <p className={result.ok ? 'sg-obs-result sg-obs-result--ok' : 'sg-cal-connect-error'}>
          {resultMessage(result)}
        </p>
      )}

      {isConfigured && (
        <button
          className="sg-cal-connect-btn sg-cal-connect-btn--disconnect"
          onClick={() => { void disconnect(); setApiKey(''); setResult(null); }}
        >
          {t('widget.obsidian.disconnect')}
        </button>
      )}

      <p className="sg-obs-hint">{t('widget.obsidian.setupHint')}</p>
    </div>
  );
}
