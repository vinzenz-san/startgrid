import type { Widget, WidgetBase, WidgetType } from '../types/widget';
import { WIDGET_REGISTRY } from '../components/widgets/registry';

/**
 * The one audited bridge between a runtime (type, data) pair and the
 * Widget discriminated union. TypeScript can't verify a generic pairing
 * matches the right union member without enumerating every variant, so
 * this performs the narrowing assertion in exactly one place, backed by
 * a runtime check — unlike the `as Widget` casts this replaces — that
 * `type` is a real registry entry and `data` is a plausible object,
 * which catches the concrete failure mode registry drift would cause.
 */
export function assertWidget(candidate: {
  id: string;
  type: WidgetType;
  data: unknown;
} & Omit<WidgetBase, 'id' | 'type' | 'data'>): Widget {
  if (!(candidate.type in WIDGET_REGISTRY)) {
    throw new Error(`assertWidget: unknown widget type "${String(candidate.type)}"`);
  }
  if (candidate.data === null || typeof candidate.data !== 'object') {
    throw new Error(`assertWidget: widget "${candidate.type}" data must be an object`);
  }
  return candidate as Widget;
}

/** Same check for a widget not yet given an id (buildNewWidget/preset-building call sites). */
export function assertWidgetData(candidate: {
  type: WidgetType;
  data: unknown;
} & Omit<WidgetBase, 'id' | 'type' | 'data'>): Omit<Widget, 'id'> {
  if (!(candidate.type in WIDGET_REGISTRY)) {
    throw new Error(`assertWidgetData: unknown widget type "${String(candidate.type)}"`);
  }
  if (candidate.data === null || typeof candidate.data !== 'object') {
    throw new Error(`assertWidgetData: widget "${candidate.type}" data must be an object`);
  }
  return candidate as Omit<Widget, 'id'>;
}
