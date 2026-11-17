/**
 * דיווח במייל (lib/mailReport.ts): שומר בשרת את המפגשים הקרובים שעוד לא דווחו, ומייבא
 * תשובות שנקלטו במייל. רץ אחרי כל משיכה מהענן (פתיחה, חזרה לאפליקציה, מעבר חשבון), כל 10 דקות
 * כשהיא פתוחה, ואחרי כל שינוי מקומי בדיווחים, בקורסים, בסימוני המפגשים או בהגדרות.
 * כשיובאו דיווחים — המסכים הפתוחים נטענים מחדש ומוצגת הודעה קופצת.
 */
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { importMailInbox, pushMailPlan } from '../lib/mailReport';
import { onLocalWrite } from '../lib/storage';
import { KEYS } from '../lib/keys';
import { onAccessChange, onSyncStatus } from '../lib/sync';
import { notifyDataChanged } from '../lib/demo';
import { useToast } from './Toast';

/** גיבוי למקרה שאין משיכה מהענן (למשל בלי חיבור) — לא מחכים לה יותר מזה. */
const START_DELAY_MS = 8_000;
const SYNCED_GAP_MS = 60_000;
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
  const { showToast } = useToast();
  const toastRef = useRef(showToast);
  toastRef.current = showToast;
  useEffect(() => {
    let busy = false;
    let again = false;
    const run = async () => {
      if (busy) {
        again = true; // הגיע אירוע בזמן ריצה (למשל משיכה שהסתיימה) — רצים שוב בסופה
        return;
      }
      busy = true;
      try {
        // הייבוא לא תלוי בהגדרה "מופעל": תשובה שכבר נקלטה בשרת נכנסת גם אם כובה בינתיים.
        try {
          const n = await importMailInbox();
          if (n > 0) {
            notifyDataChanged();
            toastRef.current(n === 1 ? 'נקלט דיווח מהמייל' : `נקלטו ${n} דיווחים מהמייל`);
          }
        } catch (e) {
          console.warn('[mail] import failed', e);
        }
        await pushMailPlan();
      } catch (e) {
        console.warn('[mail] plan failed', e);
      } finally {
        busy = false;
        if (again) {
          again = false;
          void run();
        }
      }
    };
    // אחרי משיכה מהענן הנתונים המקומיים עדכניים והמשתמש מחובר — זה הרגע לייבא.
    // ("synced" מגיע גם אחרי כל דחיפה — לכן לכל היותר פעם בדקה מהמקור הזה.)
    let lastSynced = 0;
    const offStatus = onSyncStatus((st) => {
      if (st !== 'synced' || Date.now() - lastSynced < SYNCED_GAP_MS) return;
      lastSynced = Date.now();
      void run();
    });
    // מעבר לחשבון ששותף (או חזרה לשלך) — מייבאים לחשבון החדש מיד אחרי המשיכה שלו.
    const offAccess = onAccessChange(() => {
      lastSynced = 0;
    });
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
      offStatus();
      offAccess();
      off();
    };
  }, []);
  return null;
}
