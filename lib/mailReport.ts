/**
 * דיווח במייל (docs/fixes-spec-2026-11-17.md סעיף 8). הצד שבשרת — Cloud Functions בריפו
 * apps-platform (functions/): שליחת תזכורת על מפגש שלא דווח, וקליטת התשובה.
 *
 * הצד באפליקציה:
 *  - הגדרות (`KEYS.emailReport`, מסונכרן): הפעלה, שעת השליחה, וכמה ימים טקסט המייל מוצג לפני שעובר לארכיון.
 *  - `pushMailPlan` — כותב לשרת את המפגשים של 14 הימים הקרובים (שמתקיימים ועוד לא דווחו), כדי שהשרת
 *    יוכל לשלוח בלי לחשב בעצמו ביטולים, חגים וחופשות:
 *    apps/reporting-hours/users/{uid}/mail/plan.
 *  - `importMailInbox` — תשובות שנקלטו (users/{uid}/mailInbox, status 'new') הופכות לדיווח או לסימון "בוטל".
 * התכנון — רק הבעלים המחוברים. הייבוא — הבעלים, או מורשה עם הרשאת דיווח / מלאה בחשבון ששותף
 * (כדי שדיווח מהמייל ייכנס גם כשמי שפותח את האפליקציה צופה בחשבון של הבעלים). לא בהדגמה.
 */
import { collection, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { APP_ID, firestore } from './firebase';
import { readJSON, writeJSON } from './storage';
import { KEYS } from './keys';
import { authUser, getAccess, isDemoActive } from './sync';
import { courseReported, coursesOn, loadCourses, type Course } from './courses';
import { addReport, loadReports, makeBreakId, type WorkReport } from './reports';
import { activeWorkplaces, loadWorkplaces, type Workplace } from './workplaces';
import { loadCancelIndex, setSessionMark } from './sessions';
import { beforeTracking } from './trackingStart';
import { dateFromIso, isoDate } from './dates';
import { buildReportDraft } from './reportForm';
import { loadLeftoverMode } from './leftover';
import { DEFAULT_PAY_BASIS, isPayBasis, type PayBasis } from './payBasis';
import { addAccumulatedMinutes } from './accumulated';

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
): Record<string, MailPlanItem[]> {
  const byId = new Map(activeWorkplaces(workplaces).map((w) => [w.id, w]));
  const out: Record<string, MailPlanItem[]> = {};
  const d = dateFromIso(from);
  for (let i = 0; i < days; i++, d.setDate(d.getDate() + 1)) {
    const date = isoDate(d);
    if (beforeTracking(date)) continue;
    const items: MailPlanItem[] = [];
    for (const c of coursesOn(courses, date)) {
      const w = byId.get(c.workplaceId);
      if (!w || courseReported(c, date, reports)) continue;
      items.push({
        courseId: c.id,
        courseName: c.name,
        workplaceId: w.id,
        workplaceName: w.name,
        start: c.start,
        end: c.end,
        breakMinutes: c.breakMinutes,
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

/**
 * לאיזה חשבון מייבאים תשובות: הבעלים עצמם, או — בחשבון ששותף — הבעלים ששיתף, כשלמורשה יש
 * הרשאה לכתוב דיווחים (`report` / `full`). צפייה בלבד — לא מייבאים.
 */
async function importUid(): Promise<string | null> {
  const user = authUser();
  if (!user?.email || (await isDemoActive())) return null;
  const a = getAccess();
  if (!a) return user.uid;
  return a.role === 'report' || a.role === 'full' ? a.ownerUid : null;
}

/** כתיבת התכנון לשרת (גם כשהדיווח במייל כבוי — כדי שהשרת יידע להפסיק). */
export async function pushMailPlan(): Promise<void> {
  const db = firestore();
  const uid = await ownerUid();
  if (!db || !uid) return;
  const settings = await loadMailSettings();
  await loadCancelIndex();
  const [courses, workplaces, reports] = await Promise.all([loadCourses(), loadWorkplaces(), loadReports()]);
  const today = isoDate(new Date());
  await setDoc(doc(db, 'apps', APP_ID, 'users', uid, 'mail', 'plan'), {
    enabled: settings.enabled,
    email: authUser()?.email?.toLowerCase() ?? '',
    sendTime: settings.sendTime,
    days: settings.enabled ? buildPlanDays(courses, workplaces, reports, today) : {},
    updated: Date.now(),
  });
}

type InboxDoc = {
  courseId: string;
  workplaceId: string;
  date: string;
  kind: 'held' | 'times' | 'canceled';
  start?: string;
  end?: string;
  breakMinutes?: number;
  reason?: string;
  text: string;
  receivedAt: number;
  status: 'new' | 'imported';
};

/** תשובות שנקלטו במייל → דיווחים / סימוני ביטול. מחזיר כמה יובאו. */
export async function importMailInbox(): Promise<number> {
  const db = firestore();
  const uid = await importUid();
  if (!db || !uid) return 0;
  const col = collection(db, 'apps', APP_ID, 'users', uid, 'mailInbox');
  const snap = await getDocs(query(col, where('status', '==', 'new')));
  if (snap.empty) return 0;
  const [courses, workplaces, leftover, basisRaw] = await Promise.all([
    loadCourses(),
    loadWorkplaces(),
    loadLeftoverMode(),
    readJSON<unknown>(KEYS.payBasis, null),
  ]);
  const basis: PayBasis = isPayBasis(basisRaw) ? basisRaw : DEFAULT_PAY_BASIS;
  let n = 0;
  for (const d of snap.docs) {
    const m = d.data() as InboxDoc;
    const course = courses.find((c) => c.id === m.courseId) ?? null;
    let reportId: string | undefined;
    if (m.kind === 'canceled') {
      await setSessionMark(m.courseId, m.date, 'canceled', m.reason || undefined);
    } else {
      const reports = await loadReports();
      // כבר דווח באפליקציה בינתיים — לא יוצרים כפילות.
      if (!course || !courseReported(course, m.date, reports)) {
        const { draft, carried } = buildReportDraft(
          {
            workplaceId: m.workplaceId,
            date: m.date,
            start: m.start ?? '',
            end: m.end ?? '',
            breaks: m.breakMinutes ? [{ id: makeBreakId(), minutes: String(m.breakMinutes) }] : [],
            note: course?.name ?? '',
            leftoverChoice: leftover,
          },
          { workplaces, basis, course, extraKind: null },
        );
        const saved = await addReport({ ...draft, viaEmail: { text: m.text, receivedAt: m.receivedAt } });
        reportId = saved.find((r) => r.viaEmail?.receivedAt === m.receivedAt && r.date === m.date)?.id;
        if (carried > 0) await addAccumulatedMinutes(m.workplaceId, carried);
      }
    }
    await updateDoc(d.ref, { status: 'imported', importedAt: Date.now(), ...(reportId ? { reportId } : {}) });
    n++;
  }
  return n;
}

/** האם טקסט המייל של הדיווח כבר בארכיון (עברו `archiveDays` ימים מקבלתו). */
export function mailTextArchived(receivedAt: number, archiveDays: number, now = Date.now()): boolean {
  return now - receivedAt > archiveDays * 86_400_000;
}
