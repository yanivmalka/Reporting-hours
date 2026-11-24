/**
 * הצגת סכומי ההכנסה — נטו (אחרי מס) או ברוטו, אחד בכל פעם, לפי בחירה בכפתור "נטו | ברוטו"
 * (components/AmountModeToggle.tsx). הסכומים מחושבים תמיד בשני הצורות (lib/forecast.ts);
 * כאן רק נבחר מה מוצג. העדפת תצוגה (`KEYS.amountMode`, 'viewerDevice'), ברירת מחדל — נטו.
 */
import { useSyncExternalStore } from 'react';
import { KEYS } from './keys';
import { readJSON, writeJSON } from './storage';
import type { ForecastCell, ForecastMonth } from './forecast';

export type AmountMode = 'net' | 'gross';

export const AMOUNT_MODE_LABEL: Record<AmountMode, string> = { net: 'נטו', gross: 'ברוטו' };

/** החודשים כשמוצג ברוטו: הסכומים הראשיים מוחלפים בברוטו (גם לכל מקום), כך שכל החישובים שאחריהם נשארים כמו שהם. */
export function forecastForMode(months: ForecastMonth[], mode: AmountMode): ForecastMonth[] {
  if (mode === 'net') return months;
  const cell = (c: ForecastCell): ForecastCell => ({ ...c, ...c.gross });
  return months.map((m) => ({
    ...m,
    ...m.gross,
    byWorkplace: Object.fromEntries(Object.entries(m.byWorkplace).map(([id, c]) => [id, cell(c)])),
  }));
}

/** סכום יחיד לפי המצב — נטו או ברוטו. */
export function amountByMode(a: { net: number; gross: number }, mode: AmountMode): number {
  return mode === 'gross' ? a.gross : a.net;
}

// ── ההעדפה (מאגר קטן ברמת המודול, כמו lib/courseGrouping.ts) ──

let value: AmountMode = 'net';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

void readJSON<unknown>(KEYS.amountMode, 'net').then((saved) => {
  if ((saved === 'net' || saved === 'gross') && saved !== value) {
    value = saved;
    emit();
  }
});

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAmountMode(): AmountMode {
  return useSyncExternalStore(
    subscribe,
    () => value,
    () => value,
  );
}

export async function setAmountMode(mode: AmountMode): Promise<void> {
  value = mode;
  emit();
  await writeJSON(KEYS.amountMode, mode);
}
