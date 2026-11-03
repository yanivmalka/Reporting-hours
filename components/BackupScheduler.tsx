/**
 * מפעיל את הגיבוי היומי האוטומטי (lib/backup.ts): זמן קצר אחרי פתיחת
 * האפליקציה (אחרי שהסנכרון והתחברות הספיקו לעלות), בכל חזרה אליה, ופעם
 * בשעה כשהיא פתוחה — כך שגם אפליקציה שנשארת פתוחה בלילה תגבה ביום החדש.
 * הגיבוי עצמו רץ רק פעם ביום. לא מצייר דבר.
 */
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { runDailyBackup } from '../lib/backup';

const START_DELAY_MS = 20_000;
const HOURLY_MS = 60 * 60 * 1000;

export function BackupScheduler() {
  useEffect(() => {
    const run = () => void runDailyBackup().catch((e) => console.warn('[backup] daily failed', e));
    const first = setTimeout(run, START_DELAY_MS);
    const hourly = setInterval(run, HOURLY_MS);
    let off = () => {};
    if (Platform.OS === 'web') {
      const onVisible = () => document.visibilityState === 'visible' && run();
      document.addEventListener('visibilitychange', onVisible);
      off = () => document.removeEventListener('visibilitychange', onVisible);
    } else {
      const sub = AppState.addEventListener('change', (st) => st === 'active' && run());
      off = () => sub.remove();
    }
    return () => {
      clearTimeout(first);
      clearInterval(hourly);
      off();
    };
  }, []);
  return null;
}
