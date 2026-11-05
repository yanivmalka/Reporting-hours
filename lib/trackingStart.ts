/**
 * הגדרה כללית: תאריך התחלת העבודה עם המערכת ("YYYY-MM-DD", או null — בלי).
 *
 * מפגש לפני התאריך הזה שלא דווח אינו נחשב "דיווח חסר": לא בהתראות הבית,
 * לא בנקודות התאריכונים, לא בדוחות השכר בדף מקום העבודה ולא בהתרעות של
 * עריכת קורס. מפגש לפני התאריך שכן דווח נכלל כרגיל (בקורס, בשכר ובצפי).
 *
 * מאגר קטן ברמת המודול (כמו lib/hebrewDatePref.ts), כך שגם חישובים טהורים
 * קוראים אותו בלי להעביר פרמטר: `getTrackingStart()` / `beforeTracking(date)`.
 */
import { useSyncExternalStore } from 'react';
import { readJSON, writeJSON } from './storage';

const STORAGE_KEY = 'reporting-hours/tracking-start/v1';

let value: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

const valid = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

void readJSON<unknown>(STORAGE_KEY, null).then((saved) => {
  const next = valid(saved) ? saved : null;
  if (next !== value) {
    value = next;
    emit();
  }
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTrackingStart(): string | null {
  return value;
}

/** האם התאריך לפני תחילת העבודה עם המערכת — מפגש לא מדווח בו אינו "חסר". */
export function beforeTracking(date: string): boolean {
  return value != null && date < value;
}

export function useTrackingStart(): string | null {
  return useSyncExternalStore(subscribe, () => value, () => value);
}

export async function setTrackingStart(date: string | null): Promise<void> {
  value = date;
  emit();
  await writeJSON(STORAGE_KEY, date);
}
