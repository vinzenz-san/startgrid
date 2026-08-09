// Generic trailing-edge debounce: coalesces a burst of calls within `ms` of
// each other into a single call using the last set of arguments. Used to
// keep continuous UI input (dragging a slider or color picker) from
// flooding chrome.storage.sync, which enforces MAX_WRITE_OPERATIONS_PER_MINUTE.
export interface Debounced<Args extends unknown[]> {
  (...args: Args): void;
  /** Run a still-pending call immediately instead of waiting out the delay. */
  flush: () => void;
  /** Drop a still-pending call without running it. */
  cancel: () => void;
}

export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, ms: number): Debounced<Args> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Args | null = null;

  const debounced = ((...args: Args) => {
    pendingArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const args = pendingArgs;
      pendingArgs = null;
      if (args) fn(...args);
    }, ms);
  }) as Debounced<Args>;

  debounced.flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pendingArgs) {
      const args = pendingArgs;
      pendingArgs = null;
      fn(...args);
    }
  };

  debounced.cancel = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    pendingArgs = null;
  };

  return debounced;
}
