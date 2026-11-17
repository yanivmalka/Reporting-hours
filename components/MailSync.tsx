/**
 * דיווח במייל (lib/mailReport.ts). את התשובה רושם השרת מיד בנתונים המסונכרנים; כאן:
 *  - כתיבת התכנון לשרת (`pushMailPlan`): זמן קצר אחרי הפתיחה, בכל חזרה לאפליקציה, כל 10 דקות כשהיא
 *    פתוחה, ואחרי כל שינוי מקומי בדיווחים, בקורסים, בסימוני המפגשים או בהגדרות.
 *  - הודעה קופצת "נקלט דיווח מהמייל" כשהסנכרון מביא דיווח כזה (לכל חשבון במכשיר, `KEYS.mailSeen`).
 * לא מצייר דבר.
 */
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { pushMailPlan, unseenMailReports } from '../lib/mailReport';
import { onLocalWrite, readJSON, writeJSON } from '../lib/storage';
import { KEYS } from '../lib/keys';
import { authUser, getAccess, onRemoteChange } from '../lib/sync';
import { loadReports } from '../lib/reports';
import { useToast } from './Toast';

const START_DELAY_MS = 8_000;
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

/** הודעה על דיווחים מהמייל שהגיעו בסנכרון ועוד לא הוצגו במכשיר, בחשבון הנתונים הפעיל. */
async function checkUnseen(show: (m: string) => void): Promise<void> {
  const account = getAccess()?.ownerUid ?? authUser()?.uid;
  if (!account) return;
  const seen = await readJSON<Record<string, number>>(KEYS.mailSeen, {});
  const { count, latest } = unseenMailReports(await loadReports(), seen[account] ?? null);
  if (count > 0) show(count === 1 ? 'נקלט דיווח מהמייל' : `נקלטו ${count} דיווחים מהמייל`);
  if (latest !== (seen[account] ?? null)) await writeJSON(KEYS.mailSeen, { ...seen, [account]: latest });
}

export function MailSync() {
  const { showToast } = useToast();
  const toastRef = useRef(showToast);
  toastRef.current = showToast;
  useEffect(() => {
    let busy = false;
    const run = async () => {
      if (busy) return;
      busy = true;
      try {
        await pushMailPlan();
      } catch (e) {
        console.warn('[mail] plan failed', e);
      } finally {
        busy = false;
      }
    };
    const check = () => void checkUnseen((m) => toastRef.current(m)).catch((e) => console.warn('[mail] check failed', e));
    check();
    const offRemote = onRemoteChange(check);
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
      offRemote();
      off();
    };
  }, []);
  return null;
}
