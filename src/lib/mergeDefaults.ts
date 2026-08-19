/** Shallow-merges `stored` over `defaults`, field by field, treating both
 *  `undefined` and `null` in `stored` as "use the default" — for the case
 *  where an object exists in storage but an individual field is missing
 *  (a stale/partial persisted shape from before a field was added). */
export function mergeDefaults<T extends object>(stored: Partial<T> | null | undefined, defaults: T): T {
  const result = { ...defaults };
  if (stored) {
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const v = stored[key];
      if (v !== undefined && v !== null) result[key] = v as T[keyof T];
    }
  }
  return result;
}
