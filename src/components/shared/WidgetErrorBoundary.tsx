import { Component, useSyncExternalStore, type ErrorInfo, type ReactNode } from 'react';
import type { TranslationKey } from '../../i18n';
import { clearCrash, isCrashed, subscribeCrashState } from '../../lib/devCrashState';

interface Props {
  widgetId: string;
  onRemove: () => void;
  t: (key: TranslationKey) => string;
  children: ReactNode;
}

// Dev-only: throws during render when the Dev Panel has flagged this widget
// id for a simulated crash — must live below WidgetErrorBoundary in the tree
// since a boundary can't catch an error thrown in its own render pass.
export function CrashProbe({ widgetId, children }: { widgetId: string; children: ReactNode }) {
  const crashed = useSyncExternalStore(subscribeCrashState, () => isCrashed(widgetId));
  if (crashed) throw new Error(`[DevPanel] Simulated crash for widget ${widgetId}`);
  return children;
}

interface State { hasError: boolean; }

export default class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[StartGrid] Widget crashed:', this.props.widgetId, error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    // Widget content is keyed by id upstream, but guard against an id reuse
    // (e.g. type swap on the same slot) leaving a stale crashed state behind.
    if (this.state.hasError && prevProps.widgetId !== this.props.widgetId) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        <div className="sg-widget-orphan-body">
          <span className="sg-widget-orphan-icon">⚠</span>
          <span className="sg-widget-orphan-title">{t('widgets.crashedTitle')}</span>
          <span className="sg-widget-orphan-desc">{t('widgets.crashedDesc')}</span>
          <div className="sg-widget-crashed-actions">
            <button
              className="sg-widget-orphan-remove"
              onClick={() => {
                clearCrash(this.props.widgetId);
                this.setState({ hasError: false });
              }}
            >
              {t('widgets.crashedReload')}
            </button>
            <button
              className="sg-widget-orphan-remove"
              onClick={this.props.onRemove}
            >
              {t('widgets.crashedRemove')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
