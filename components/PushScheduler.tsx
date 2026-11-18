/**
 * התראות לטלפון (lib/push.ts, lib/pushPlan.ts):
 *  - מתזמן מחדש את ההתראות במכשיר — זמן קצר אחרי הפתיחה, בכל חזרה לאפליקציה, אחרי כל שינוי
 *    מקומי בנתונים הרלוונטיים ואחרי סנכרון מהענן (כך דיווח שהגיע מהמייל מבטל את "לא לשכוח לדווח").
 *  - לחיצה על התראה פותחת את המסך שלה.
 * רק בנתונים שלך: כשצופים בחשבון ששותף — ההתראות שכבר תוזמנו נשארות, ולא מחושבות מחדש.
 * לא מצייר דבר. אנדרואיד בלבד.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { activeKinds, clearScheduled, loadPushPrefs, pushPermitted, pushPlatform, syncScheduled, usePushPrefs } from '../lib/push';
import { planPush } from '../lib/pushPlan';
import { loadWorkplaces } from '../lib/workplaces';
import { loadCourses } from '../lib/courses';
import { loadReports } from '../lib/reports';
import { loadSessionNotes } from '../lib/sessionNotes';
import { loadPayrollStatus } from '../lib/payroll';
import { onLocalWrite } from '../lib/storage';
import { getAccess, onRemoteChange } from '../lib/sync';
import { KEYS } from '../lib/keys';

const START_DELAY_MS = 3_000;
const DEBOUNCE_MS = 2_000;
const WATCHED = new Set<string>([
  KEYS.reports,
  KEYS.courses,
  KEYS.sessions,
  KEYS.sessionNotes,
  KEYS.workplaces,
  KEYS.vacations,
  KEYS.holidayCancel,
  KEYS.trackingStart,
  KEYS.payroll,
]);

let busy = false;
let again = false;

async function reschedule(): Promise<void> {
  if (busy) {
    again = true;
    return;
  }
  busy = true;
  try {
    do {
      again = false;
      const prefs = await loadPushPrefs();
      if (!prefs.enabled || !(await pushPermitted())) {
        await clearScheduled();
        continue;
      }
      if (getAccess()) continue; // חשבון ששותף — לא נוגעים
      // loadCourses מעדכן גם את אינדקס הביטולים (חגים, חופשות, סימונים) ש־planPush משתמש בו.
      const [workplaces, courses, reports, notes, payroll] = await Promise.all([
        loadWorkplaces(),
        loadCourses(),
        loadReports(),
        loadSessionNotes(),
        loadPayrollStatus(),
      ]);
      const items = planPush({ workplaces, courses, reports, notes, payroll, now: new Date(), kinds: activeKinds(prefs) });
      await syncScheduled(items);
    } while (again);
  } catch (e) {
    console.warn('[push] schedule failed', e);
  } finally {
    busy = false;
  }
}

export function PushScheduler() {
  const router = useRouter();
  const { enabled, off, loaded } = usePushPrefs();

  // תזמון מחדש: בפתיחה, בשינוי ההגדרה, בחזרה לאפליקציה ובכל שינוי בנתונים.
  useEffect(() => {
    if (!pushPlatform || !loaded) return;
    const first = setTimeout(() => void reschedule(), START_DELAY_MS);
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const soon = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void reschedule(), DEBOUNCE_MS);
    };
    const offWrite = onLocalWrite((key) => WATCHED.has(key) && soon());
    const offRemote = onRemoteChange(soon);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && soon());
    return () => {
      clearTimeout(first);
      if (debounce) clearTimeout(debounce);
      offWrite();
      offRemote();
      sub.remove();
    };
  }, [loaded, enabled, off.join(',')]);

  // לחיצה על התראה — המסך שלה (גם כשהאפליקציה נפתחה מההתראה).
  useEffect(() => {
    if (!pushPlatform) return;
    const open = (r: Notifications.NotificationResponse | null) => {
      const href = r?.notification.request.content.data?.href;
      if (typeof href !== 'string' || !href) return;
      void Notifications.clearLastNotificationResponseAsync();
      router.push(href as Href);
    };
    // פתיחה מההתראה: אחרי שהניווט מוכן.
    const cold = setTimeout(() => void Notifications.getLastNotificationResponseAsync().then(open), 300);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => {
      clearTimeout(cold);
      sub.remove();
    };
  }, [router]);

  return null;
}
