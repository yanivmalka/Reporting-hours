/**
 * מצב צפייה בלבד — המשתמש בוחר להציג את המערכת לקריאה בלבד (למשל כדי לעיין
 * בלי חשש לשינוי בטעות). כשהוא מופעל `useAccess()` (components/Access.tsx)
 * מחזיר `canReport` ו־`canEdit` כבויים, כמו הרשאת "צפייה" בשיתוף: כפתורי
 * הדיווח והעריכה מוסתרים, ומסכי עריכה מציגים "מעבר למצב עריכה".
 * לכל מכשיר (`KEYS.viewOnly`) — חל בכל חשבון שפתוח במכשיר. מאגר קטן ברמת המודול.
 */
import { useSyncExternalStore } from 'react';
import { readJSON, writeJSON } from './storage';
import { KEYS } from './keys';

let value = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

void readJSON<unknown>(KEYS.viewOnly, false).then((saved) => {
  if (typeof saved === 'boolean' && saved !== value) {
    value = saved;
    emit();
  }
});

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useViewOnly(): boolean {
  return useSyncExternalStore(subscribe, () => value, () => value);
}

export async function setViewOnly(on: boolean): Promise<void> {
  value = on;
  emit();
  await writeJSON(KEYS.viewOnly, on);
}
