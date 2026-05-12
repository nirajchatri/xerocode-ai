import type { LucideIcon } from 'lucide-react';
import {
  Binary,
  Calendar,
  CalendarClock,
  Clock,
  List,
  ToggleLeft,
  Type,
  Hash,
} from 'lucide-react';

import type { DataFieldKind, DataListBarAccent } from './agentNodeData';
import { DATA_FIELD_KINDS, DATA_FIELD_LABELS } from './agentNodeData';

/** Visual theme for palette, canvas chip, inspector. */
export type DataFieldAppearance = {
  kind: DataFieldKind;
  label: string;
  bar: string;
  Icon: LucideIcon;
};

const META: Record<DataFieldKind, { bar: string; Icon: LucideIcon }> = {
  string: { bar: 'bg-cyan-600', Icon: Type },
  number: { bar: 'bg-indigo-600', Icon: Hash },
  boolean: { bar: 'bg-fuchsia-600', Icon: ToggleLeft },
  decimal: { bar: 'bg-teal-600', Icon: Binary },
  date: { bar: 'bg-amber-600', Icon: Calendar },
  time: { bar: 'bg-orange-600', Icon: Clock },
  datetime: { bar: 'bg-lime-600', Icon: CalendarClock },
  list: { bar: 'bg-emerald-600', Icon: List },
};

export function dataFieldAppearances(): readonly DataFieldAppearance[] {
  return DATA_FIELD_KINDS.map((kind) => ({
    kind,
    label: DATA_FIELD_LABELS[kind],
    ...META[kind],
  }));
}

export function appearanceForDataField(kind?: DataFieldKind | null): DataFieldAppearance | null {
  if (!kind || !(kind in META)) return null;
  const k = kind as DataFieldKind;
  return { kind: k, label: DATA_FIELD_LABELS[k], ...META[k] };
}

const LIST_BAR_BY_ACCENT: Record<DataListBarAccent, string> = {
  emerald: 'bg-emerald-600',
  teal: 'bg-teal-600',
  cyan: 'bg-cyan-600',
  violet: 'bg-violet-600',
  amber: 'bg-amber-500',
  rose: 'bg-rose-600',
};

/** Swatches for Data List toolbar (must match `DataListBarAccent` keys). */
export const DATA_LIST_BAR_SWATCHES: ReadonlyArray<{ key: DataListBarAccent; header: string }> = [
  { key: 'emerald', header: 'bg-emerald-600' },
  { key: 'teal', header: 'bg-teal-600' },
  { key: 'cyan', header: 'bg-cyan-600' },
  { key: 'violet', header: 'bg-violet-600' },
  { key: 'amber', header: 'bg-amber-500' },
  { key: 'rose', header: 'bg-rose-600' },
];

/** Bar Tailwind class for a Data List node. */
export function dataListBarClass(accent: DataListBarAccent | undefined): string {
  const a = accent && LIST_BAR_BY_ACCENT[accent] ? accent : 'emerald';
  return LIST_BAR_BY_ACCENT[a];
}
