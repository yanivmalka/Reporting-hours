/**
 * דיווח במייל (lib/mailReport.ts): שומר בשרת את המפגשים הקרובים שעוד לא דווחו, ומייבא
 * תשובות שנקלטו במייל. רץ זמן קצר אחרי פתיחת האפליקציה, בכל חזרה אליה, כל 10 דקות כשהיא
 * פתוחה, ואחרי כל שינוי מקומי בדיווחים, בקורסים, בסימוני המפגשים או בהגדרות. לא מצייר דבר.
 */
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { importMailInbox, loadMailSettings, pushMailPlan } from '../lib/mailReport';
import { onLocalWrite } from '../lib/storage';
import { KEYS } from '../lib/keys';

const START_DELAY_MS = 25_000;
const EVERY_MS = 10 * 60 * 1000;
const DEBOUNCE_MS = 5_000;
const WATCHED = new Set<string>([
  KEYS.reports,
  KEYS.courses,
  KEYS.sessions,
  KEYS.workplaces,
  KEYS.vacations,
  KEYS.holidayCancel,
  KEYS.trackingStart,
  KEYS.emailReport,
]);

export function MailSync() {
  useEffect(() => {
    let busy = false;
    const run = async () => {
      if (busy) return;
      busy = true;
      try {
        const s = await loadMailSettings();
        if (s.enabled) await importMailInbox();
        await pushMailPlan();
      } catch (e) {
        console.warn('[mail] sync failed', e);
      } finally {
        busy = false;
      }
    };
    const first = setTimeout(run, START_DELAY_MS);
    const every = setInterval(run, EVERY_MS);
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const offWrite = onLocalWrite((key) => {
      if (!WATCHED.has(key)) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(run, DEBOUNCE_MS);
    });
    let off = () => {};
    if (Platform.OS === 'web') {
      const onVisible = () => document.visibilityState === 'visible' && void run();
      document.addEventListener('visibilitychange', onVisible);
      off = () => document.removeEventListener('visibilitychange', onVisible);
    } else {
      const sub = AppState.addEventListener('change', (st) => st === 'active' && void run());
      off = () => sub.remove();
    }
    return () => {
      clearTimeout(first);
      clearInterval(every);
      if (debounce) clearTimeout(debounce);
      offWrite();
      off();
    };
  }, []);
  return null;
}
