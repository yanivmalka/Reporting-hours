/**
 * הגדרה: הצגת תאריך עברי בבחירת תאריכים (תאריכון, טווח תאריכים).
 *
 * ברירת המחדל — מופעל, כמו שהיה עד עכשיו. כשכבויה, התאריכונים מציגים רק
 * את התאריך הלועזי: בלי התאריך העברי בשורת התאריך שנבחר, בלי שם החודש
 * העברי בכותרת ובלי היום העברי בכל תא.
 *
 * מאגר קטן ברמת המודול (בלי Provider): נטען פעם אחת, וכל רכיב שקורא
 * `useShowHebrewDates()` מתעדכן מיד כשמשנים את ההגדרה.
 */
import { useSyncExternalStore } from 'react';
import { readJSON, writeJSON } from './storage';

const STORAGE_KEY = 'reporting-hours/show-hebrew-dates/v1';

let value = true;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

void readJSON<unknown>(STORAGE_KEY, true).then((saved) => {
  if (typeof saved === 'boolean' && saved !== value) {
    value = saved;
    emit();
  }
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** האם להציג תאריך עברי בתאריכונים. */
export function useShowHebrewDates(): boolean {
  return useSyncExternalStore(subscribe, () => value, () => value);
}

export async function setShowHebrewDates(on: boolean): Promise<void> {
  value = on;
  emit();
  await writeJSON(STORAGE_KEY, on);
}
