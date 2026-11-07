/**
 * מה עושים בדקות העודפות של דיווח (דקות שאינן משלימות שעה אקדמית):
 *   - 'carry'   — למונה המצטבר (ברירת מחדל).
 *   - 'include' — נכללות בדיווח כשבר שעה.
 * הגדרה כללית, נבחרת במסך "דקות מצטברות" (קבוצה "הגדרות"). האשף לא שואל
 * בכל דיווח — רק מציג את ההגדרה עם קישור לשינוי. דיווח קיים שומר את מה שנקבע בו.
 */
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';

export type LeftoverMode = 'carry' | 'include';

export const DEFAULT_LEFTOVER_MODE: LeftoverMode = 'carry';

const STORAGE_KEY = 'reporting-hours/leftover-mode/v1';

export async function loadLeftoverMode(): Promise<LeftoverMode> {
  const v = await readJSON<unknown>(STORAGE_KEY, null);
  return v === 'include' || v === 'carry' ? v : DEFAULT_LEFTOVER_MODE;
}

export function useLeftoverMode(): [LeftoverMode, (m: LeftoverMode) => void] {
  const [mode, setModeState] = useState<LeftoverMode>(DEFAULT_LEFTOVER_MODE);
  useEffect(() => {
    let active = true;
    loadLeftoverMode().then((m) => active && setModeState(m));
    return () => {
      active = false;
    };
  }, []);
  const setMode = useCallback((m: LeftoverMode) => {
    setModeState(m);
    void writeJSON(STORAGE_KEY, m);
  }, []);
  return [mode, setMode];
}
