/**
 * המלצות לסידור פריטים לא פעילים — הצעה בלבד, המשתמש מאשר או דוחה.
 * לפי כללי "מחיקה מול ארכיון" (lib/trash.ts):
 *
 *   - מקום עבודה פעיל שיש לו דיווחים, בלי קורס פעיל או עתידי, ובלי דיווח
 *     ב־{@link IDLE_DAYS} הימים האחרונים → להעביר לארכיון.
 *   - מקום עבודה בלי דיווחים כלל ובלי קורס פעיל או עתידי → להעביר לאשפה
 *     (אם אף דוח שכר שלו לא נשלח; אחרת — ארכיון).
 *   - קורס שתקופתו הסתיימה ולא דווח עליו אף פעם → למחוק.
 *
 * המלצה שנדחתה ("לא עכשיו") לא מוצגת שוב לאותו פריט. המודול טהור.
 */
import { reportsOfCourse, type Course } from './courses';
import { isoDate } from './dashboard';
import type { StatusMap } from './payroll';
import type { WorkReport } from './reports';
import { readJSON, writeJSON } from './storage';
import { isArchived, type Workplace } from './workplaces';

/** כמה ימים בלי דיווח ובלי קורס פעיל עד שמציעים להעביר מקום עבודה לארכיון. */
export const IDLE_DAYS = 60;

export type Recommendation =
  | { key: string; kind: 'archive-workplace'; workplace: Workplace; lastReport: string }
  | { key: string; kind: 'trash-workplace'; workplace: Workplace }
  | { key: string; kind: 'delete-course'; course: Course; workplace?: Workplace };

const DISMISSED_KEY = 'reporting-hours/recommend-dismissed/v1';

export async function loadDismissedRecommendations(): Promise<string[]> {
  return readJSON<string[]>(DISMISSED_KEY, []);
}

export async function dismissRecommendation(key: string): Promise<string[]> {
  const list = await loadDismissedRecommendations();
  const next = list.includes(key) ? list : [...list, key].slice(-200);
  await writeJSON(DISMISSED_KEY, next);
  return next;
}

function hasLockedPayroll(workplaceId: string, statuses: StatusMap): boolean {
  return Object.entries(statuses).some(
    ([key, st]) => key.startsWith(`${workplaceId}|`) && Boolean(st.sentAt || st.paidAt),
  );
}

export function recommendations(
  workplaces: readonly Workplace[],
  courses: readonly Course[],
  reports: readonly WorkReport[],
  statuses: StatusMap,
  dismissed: readonly string[] = [],
  today: Date = new Date(),
): Recommendation[] {
  const todayIso = isoDate(today);
  const idleSince = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - IDLE_DAYS));
  const out: Recommendation[] = [];

  for (const w of workplaces) {
    if (isArchived(w)) continue;
    const mine = reports.filter((r) => r.workplaceId === w.id);
    const liveCourse = courses.some((c) => c.workplaceId === w.id && c.to >= todayIso);
    if (liveCourse) continue;
    if (mine.length === 0) {
      out.push(
        hasLockedPayroll(w.id, statuses)
          ? { key: `archive-workplace|${w.id}`, kind: 'archive-workplace', workplace: w, lastReport: '' }
          : { key: `trash-workplace|${w.id}`, kind: 'trash-workplace', workplace: w },
      );
      continue;
    }
    const last = mine.reduce((m, r) => (r.date > m ? r.date : m), '');
    if (last < idleSince) {
      out.push({ key: `archive-workplace|${w.id}`, kind: 'archive-workplace', workplace: w, lastReport: last });
    }
  }

  // קורסים של מקום שמוצע ממילא לאשפה — נכללים בהצעה שלו.
  const trashing = new Set(out.filter((r) => r.kind === 'trash-workplace').map((r) => r.workplace.id));
  for (const c of courses) {
    if (c.to >= todayIso || trashing.has(c.workplaceId)) continue;
    if (!workplaces.some((w) => w.id === c.workplaceId)) continue;
    if (reportsOfCourse(c, reports).length > 0) continue;
    out.push({
      key: `delete-course|${c.id}`,
      kind: 'delete-course',
      course: c,
      workplace: workplaces.find((w) => w.id === c.workplaceId),
    });
  }

  return out.filter((r) => !dismissed.includes(r.key));
}
