/**
 * קורסים צמודים — דיווח אחד ליום.
 *
 * כשבאותו יום, באותו מקום עבודה, מתחיל מיד אחרי הקורס המדווח מפגש של קורס אחר
 * שטרם דווח (למשל אותה קבוצת תלמידות, "תולדות האדריכלות" ואחריו "תכנון אדריכלי"),
 * האשף מציע לדווח את שניהם בדיווח אחד: השעות של הקורס הראשון מתארכות עד סוף
 * השני, הפער ביניהם נרשם כהפסקה, ובשמירה המפגש של השני מסומן כבוטל —
 * "דווח יחד עם <הקורס הראשון>".
 */
import { sessionTimes, type Course } from './courses';
import { unreportedOn } from './home';
import { currentPlan, type PlanIndex } from './sessions';
import { parseTime } from './time';
import type { WorkReport } from './reports';
import type { Workplace } from './workplaces';

/** פער מרבי (בדקות) בין סוף הקורס לתחילת הבא כדי שייחשבו צמודים. */
export const JOINT_MAX_GAP_MINUTES = 60;

export type JointOffer = {
  /** הקורס שמצטרף לדיווח (מפגשו יסומן כבוטל) */
  course: Course;
  /** שעת הסיום של הדיווח המשותף — סוף המפגש של הקורס המצטרף */
  end: string;
  /** הפער בין המפגשים בדקות — נרשם כהפסקה */
  gap: number;
};

/** הסיבה שנרשמת במפגש שצורף לדיווח של קורס אחר. */
export const jointReason = (firstName: string) => `דווח יחד עם ${firstName}`;

/**
 * המפגש הצמוד הבא אחרי `course` ב־`date`, אם יש: אותו מקום עבודה, טרם דווח,
 * מתחיל בסוף המפגש (או עד שעה אחריו). אחרת null.
 */
export function jointCandidate(
  course: Course,
  date: string,
  courses: readonly Course[],
  workplaces: readonly Workplace[],
  reports: readonly WorkReport[],
  plan: PlanIndex = currentPlan(),
): JointOffer | null {
  const ownEnd = parseTime(sessionTimes(course, date).end);
  if (ownEnd == null) return null;
  let best: JointOffer | null = null;
  let bestStart = Infinity;
  for (const c of unreportedOn(courses, workplaces, reports, date, plan)) {
    if (c.id === course.id || c.workplaceId !== course.workplaceId) continue;
    const t = sessionTimes(c, date);
    const s = parseTime(t.start);
    const e = parseTime(t.end);
    if (s == null || e == null || e <= s) continue;
    const gap = s - ownEnd;
    if (gap < 0 || gap > JOINT_MAX_GAP_MINUTES) continue;
    if (s < bestStart) {
      bestStart = s;
      best = { course: c, end: t.end, gap };
    }
  }
  return best;
}
