/**
 * דיווח במייל (docs/fixes-spec-2026-11-17.md סעיף 8). הצד שבשרת — Cloud Functions בריפו
 * apps-platform (functions/): שליחת תזכורת על מפגש שלא דווח, וקליטת התשובה.
 *
 * הצד באפליקציה:
 *  - הגדרות (`KEYS.emailReport`, מסונכרן): הפעלה, שעת השליחה, וכמה ימים טקסט המייל מוצג לפני שעובר לארכיון.
 *  - `pushMailPlan` — כותב לשרת את המפגשים של 14 הימים הקרובים (שמתקיימים ועוד לא דווחו), כדי שהשרת
 *    יוכל לשלוח בלי לחשב בעצמו ביטולים, חגים וחופשות:
 *    apps/reporting-hours/users/{uid}/mail/plan.
 *  - את התשובה רושם השרת מיד בנתונים המסונכרנים (kv: הדיווח עם `viaEmail` ומונה הדקות, או סימון "בוטל"),
 *    כמו מכשיר נוסף — וכל מכשיר וכל מורשה רואים אותה בסנכרון הבא, בלי שמישהו יפתח את האפליקציה.
 *  - `unseenMailReports` — להודעה "נקלט דיווח מהמייל" כשהסנכרון מביא דיווח כזה.
 * התכנון — רק הבעלים המחוברים (לא בחשבון ששותף, לא בהדגמה).
 */
import { doc, setDoc } from 'firebase/firestore';
import { APP_ID, firestore } from './firebase';
import { readJSON, writeJSON } from './storage';
import { KEYS } from './keys';
import { authUser, getAccess, isDemoActive } from './sync';
import { courseReported, coursesOn, loadCourses, sessionTimes, type Course } from './courses';
import { loadReports, type WorkReport } from './reports';
import { activeWorkplaces, loadWorkplaces, type Workplace } from './workplaces';
import { currentPlan, loadPlanIndex, type PlanIndex } from './sessions';
import { beforeTracking } from './trackingStart';
import { dateFromIso, isoDate } from './dates';

export type MailReportSettings = {
  enabled: boolean;
  /** שעת השליחה "HH:MM" (שעון ישראל) */
  sendTime: string;
  /** אחרי כמה ימים טקסט המייל שהתקבל עובר לארכיון בתצוגת הדיווח */
  archiveDays: number;
};

export const DEFAULT_MAIL_SETTINGS: MailReportSettings = { enabled: false, sendTime: '21:00', archiveDays: 30 };
export const MAILBOX = 'reportinghours.app@gmail.com';
const PLAN_DAYS = 14;

export async function loadMailSettings(): Promise<MailReportSettings> {
  return { ...DEFAULT_MAIL_SETTINGS, ...(await readJSON<Partial<MailReportSettings>>(KEYS.emailReport, {})) };
}

export async function saveMailSettings(s: MailReportSettings): Promise<void> {
  await writeJSON(KEYS.emailReport, s);
}

export type MailPlanItem = {
  courseId: string;
  courseName: string;
  workplaceId: string;
  workplaceName: string;
  start: string;
  end: string;
  breakMinutes: number;
};

/** המפגשים שמתקיימים ועוד לא דווחו, לכל יום מ־`from` ו־`days` ימים קדימה. */
export function buildPlanDays(
  courses: readonly Course[],
  workplaces: readonly Workplace[],
  reports: readonly WorkReport[],
  from: string,
  days = PLAN_DAYS,
  plan: PlanIndex = currentPlan(),
): Record<string, MailPlanItem[]> {
  const byId = new Map(activeWorkplaces(workplaces).map((w) => [w.id, w]));
  const out: Record<string, MailPlanItem[]> = {};
  const d = dateFromIso(from);
  for (let i = 0; i < days; i++, d.setDate(d.getDate() + 1)) {
    const date = isoDate(d);
    if (beforeTracking(date)) continue;
    const items: MailPlanItem[] = [];
    for (const c of coursesOn(courses, date, undefined, plan.cancel, plan.moves)) {
      const w = byId.get(c.workplaceId);
      if (!w || courseReported(c, date, reports)) continue;
      items.push({
        courseId: c.id,
        courseName: c.name,
        workplaceId: w.id,
        workplaceName: w.name,
        ...sessionTimes(c, date),
      });
    }
    if (items.length) out[date] = items;
  }
  return out;
}

/** מי רשאי: הבעלים המחוברים, לא בחשבון ששותף ולא בהדגמה. */
async function ownerUid(): Promise<string | null> {
  const user = authUser();
  if (!user?.email || getAccess() || (await isDemoActive())) return null;
  return user.uid;
}

/** כתיבת התכנון לשרת (גם כשהדיווח במייל כבוי — כדי שהשרת יידע להפסיק). */
export async function pushMailPlan(): Promise<void> {
  const db = firestore();
  const uid = await ownerUid();
  if (!db || !uid) return;
  const settings = await loadMailSettings();
  const [courses, workplaces, reports] = await Promise.all([loadCourses(), loadWorkplaces(), loadReports()]);
  // אחרי טעינת הקורסים — תמונה טרייה של הביטולים וההעברות.
  const plan = await loadPlanIndex();
  const today = isoDate(new Date());
  await setDoc(doc(db, 'apps', APP_ID, 'users', uid, 'mail', 'plan'), {
    enabled: settings.enabled,
    email: authUser()?.email?.toLowerCase() ?? '',
    sendTime: settings.sendTime,
    days: settings.enabled ? buildPlanDays(courses, workplaces, reports, today, PLAN_DAYS, plan) : {},
    updated: Date.now(),
  });
}

/**
 * דיווחים שנרשמו מהמייל ועוד לא הוצגה עליהם הודעה במכשיר: אלה שהתקבלו אחרי `seenAt`.
 * `seenAt` null (פעם ראשונה במכשיר / בחשבון) — אין הודעה, רק מסמנים את המצב הנוכחי.
 */
export function unseenMailReports(
  reports: readonly Pick<WorkReport, 'viaEmail'>[],
  seenAt: number | null,
): { count: number; latest: number } {
  let latest = seenAt ?? 0;
  let count = 0;
  for (const r of reports) {
    const at = r.viaEmail?.receivedAt;
    if (!at) continue;
    if (seenAt != null && at > seenAt) count++;
    if (at > latest) latest = at;
  }
  return { count, latest };
}

/** האם טקסט המייל של הדיווח כבר בארכיון (עברו `archiveDays` ימים מקבלתו). */
export function mailTextArchived(receivedAt: number, archiveDays: number, now = Date.now()): boolean {
  return now - receivedAt > archiveDays * 86_400_000;
}

/** סימני כיווניות (Gmail בעברית עוטף בהם את שורת הציטוט) — מוסרים לפני ההשוואה. */
const BIDI = /[‎‏‪-‮⁦-⁩]/g;

/** שורה (או שתי שורות מחוברות) שפותחת את ההתכתבות המצוטטת. */
function startsQuote(line: string, next: string): boolean {
  const l = line.replace(BIDI, '').trim();
  if (!l) return false;
  if (l.startsWith('>')) return true;
  if (/^-{2,}\s*(original message|forwarded message|הודעה מקורית|הודעה שהועברה)/i.test(l)) return true;
  if (/^_{8,}$/.test(l)) return true;
  if (/^(from|מאת):\s/i.test(l)) return true;
  const two = `${l} ${next.replace(BIDI, '').trim()}`;
  const attribution = (s: string) =>
    /^on\s.+\swrote:$/i.test(s) || /^בתאריך\s.+(מאת\s.+|כתב(\/ה|ה)?):$/.test(s) || /^ב[־-]?.+כתב(\/ה|ה)?:$/.test(s);
  return attribution(l) || attribution(two);
}

/**
 * תשובה במייל → הטקסט שהמשתמש כתב (`reply`) ושאר ההתכתבות המצוטטת (`quoted`, ריק אם אין).
 * בתצוגת הדיווח מוצגת התשובה, וההתכתבות מקופלת.
 */
export function splitMailReply(text: string): { reply: string; quoted: string } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const at = lines.findIndex((l, i) => startsQuote(l, lines[i + 1] ?? ''));
  const reply = at > 0 ? lines.slice(0, at).join('\n').trim() : '';
  // אין ציטוט, או שאין טקסט לפניו — מציגים את הכול.
  if (!reply) return { reply: text.trim(), quoted: '' };
  return { reply, quoted: lines.slice(at).join('\n').trim() };
}
