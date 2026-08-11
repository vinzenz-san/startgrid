// Dev-only: lets the Dev Panel force a specific widget instance to throw on
// its next render, to exercise WidgetErrorBoundary without a real bug.
type Listener = () => void;

const crashed = new Set<string>();
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach(l => l());
}

export function triggerCrash(widgetId: string) {
  crashed.add(widgetId);
  notify();
}

export function clearCrash(widgetId: string) {
  if (crashed.delete(widgetId)) notify();
}

export function isCrashed(widgetId: string): boolean {
  return crashed.has(widgetId);
}

export function subscribeCrashState(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
