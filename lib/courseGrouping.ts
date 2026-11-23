/**
 * רמת הקיבוץ של דיווחי השעות — הגדרה אחת משותפת לכל המקומות שמציגים מידע מקובץ:
 *   - 'workplace' — לפי מקום עבודה בלבד;
 *   - 'course'    — מקום עבודה + שם קורס ("תכנון אדריכלי");
 *   - 'courseDay' — מקום עבודה + שם קורס + יום בשבוע ("תכנון אדריכלי · יום ב׳").
 *
 * חלה על: לוח הבקרה (עיגולי המפגשים בכל מקום עבודה), היומן (סיכום מקובץ בלשונית "דיווחים"),
 * דוח השכר — בתצוגה, במייל לשכר ובשיתוף — וייצוא CSV / PDF. בכל מסך כזה יש בורר, ושינוי בו
 * חל על כולם.
 *
 * ההעדפה (`KEYS.courseGrouping`) נשמרת כהעדפת תצוגה ('viewerDevice': מסונכרנת בין המכשירים של
 * המשתמש, ובחשבון ששותף — נשארת במכשיר של המורשה). ערכים מגרסה קודמת: 'merged' → 'course',
 * 'split' → 'courseDay'. החלוקה עצמה — טהורה.
 */
import { useSyncExternalStore } from 'react';
import { WEEKDAY_SHORT, occursOn, type Course } from './courses';
import { currentPlan, type PlanIndex } from './sessions';
import type { WorkReport } from './reports';
import { parseTime } from './time';
import { dateFromIso } from './dates';
import { readJSON, writeJSON } from './storage';
import { KEYS } from './keys';

export type GroupLevel = 'workplace' | 'course' | 'courseDay';

export const GROUP_LEVELS: readonly GroupLevel[] = ['workplace', 'course', 'courseDay'];

/** תוויות הבורר (מהרחב לצר). */
export const GROUP_LEVEL_OPTIONS: { value: GroupLevel; label: string }[] = [
  { value: 'workplace', label: 'מקום עבודה' },
  { value: 'course', label: '+ קורס' },
  { value: 'courseDay', label: '+ קורס ויום' },
];

/** תיאור מלא של הרמה — לכותרות ולמסמכים ("לפי מקום עבודה וקורס"). */
export function groupLevelTitle(level: GroupLevel): string {
  return level === 'workplace'
    ? 'לפי מקום עבודה'
    : level === 'course'
      ? 'לפי מקום עבודה וקורס'
      : 'לפי מקום עבודה, קורס ויום';
}

export const DEFAULT_GROUP_LEVEL: GroupLevel = 'course';

/** ערך שמור (גם מגרסה קודמת) → רמה; לא מוכר — null. */
export function parseGroupLevel(saved: unknown): GroupLevel | null {
  if (saved === 'merged') return 'course';
  if (saved === 'split') return 'courseDay';
  return GROUP_LEVELS.includes(saved as GroupLevel) ? (saved as GroupLevel) : null;
}

// ───────────────────────── קורסים (לוח הבקרה) ─────────────────────────

export type CourseDisplayGroup = { key: string; label: string; courses: Course[] };

const nameOf = (c: Pick<Course, 'name'>) => c.name.trim();

/** "יום ב׳" / "ימים ב׳, ה׳" — לפי הימים בשבוע של הקורסים. */
export function weekdaysLabel(courses: readonly Pick<Course, 'weekday'>[]): string {
  const days = [...new Set(courses.map((c) => c.weekday))].sort((a, b) => a - b);
  if (days.length === 0) return '';
  return `${days.length > 1 ? 'ימים' : 'יום'} ${days.map((d) => WEEKDAY_SHORT[d]).join(', ')}`;
}

/** האם יש בין הקורסים שמות כפולים (אז יש הבדל בין 'course' ל־'courseDay'). */
export function hasSharedNames(courses: readonly Pick<Course, 'name'>[]): boolean {
  const names = courses.map(nameOf);
  return new Set(names).size < names.length;
}

/**
 * חלוקת הקורסים של מקום עבודה לקבוצות תצוגה, בסדר ההופעה.
 * 'workplace' — קבוצה אחת לכל הקורסים (בלי תווית). 'course' — קבוצה לכל שם, ולשם משותף
 * מתווספים כל הימים. 'courseDay' — קבוצה לכל קורס, עם היום (ואם לאותו שם יש שני קורסים באותו
 * יום — גם שעת ההתחלה).
 */
export function groupCoursesForDisplay(courses: readonly Course[], level: GroupLevel): CourseDisplayGroup[] {
  if (level === 'workplace') {
    return courses.length ? [{ key: 'all', label: '', courses: [...courses] }] : [];
  }
  const byName = new Map<string, Course[]>();
  for (const c of courses) byName.set(nameOf(c), [...(byName.get(nameOf(c)) ?? []), c]);
  if (level === 'course') {
    return [...byName].map(([name, list]) => ({
      key: list[0].id,
      label: list.length > 1 ? `${name} · ${weekdaysLabel(list)}` : name,
      courses: list,
    }));
  }
  return courses.map((c) => {
    const same = byName.get(nameOf(c)) ?? [c];
    const sameDay = same.filter((o) => o.weekday === c.weekday).length > 1;
    return { key: c.id, label: `${nameOf(c)} · ${weekdaysLabel([c])}${sameDay ? ` ${c.start}` : ''}`, courses: [c] };
  });
}

// ───────────────────────── דיווחים ─────────────────────────

/** מה שצריך לדעת על פריט כדי לקבץ אותו. `course: null` — לא במסגרת קורס קבוע. */
export type GroupSource = { workplaceId: string; course: string | null; date: string };

export type ItemGroup<T> = {
  key: string;
  workplaceId: string;
  /** שם הקורס (ברמות 'course' / 'courseDay'); null — ללא קורס, או ברמת מקום עבודה */
  course: string | null;
  /** יום בשבוע 0–6 (רק ב־'courseDay') */
  weekday: number | null;
  label: string;
  /** התווית בלי שם מקום העבודה ("תכנון · יום ב׳"; ברמת מקום עבודה — "") */
  detail: string;
  items: T[];
};

export type GroupLabelOptions = {
  /** שם מקום העבודה — לתווית (כשמוצגים כמה מקומות יחד) */
  workplaceName?: (workplaceId: string) => string;
  /** תווית לעבודה שלא במסגרת קורס */
  noCourse?: string;
};

export const NO_COURSE_LABEL = 'עבודה שלא במסגרת קורס קבוע';

/**
 * לאיזה קורס שייך דיווח: הקורס שנבחר בו; אחרת קורס של אותו מקום שמתקיים בתאריך וחופף
 * בשעות; אחרת לפי הנושא. null — לא במסגרת קורס קבוע.
 */
export function reportCourseName(report: WorkReport, courses: readonly Course[], plan: PlanIndex = currentPlan()): string | null {
  if (report.courseId) {
    const byId = courses.find((c) => c.id === report.courseId);
    if (byId) return byId.name;
  }
  const s = parseTime(report.start) ?? 0;
  const e = parseTime(report.end) ?? 0;
  const match = courses.find((c) => {
    if (c.workplaceId !== report.workplaceId || !occursOn(c, report.date, plan.moves)) return false;
    const cs = parseTime(c.start) ?? 0;
    const ce = parseTime(c.end) ?? 0;
    return cs < e && ce > s;
  });
  if (match) return match.name;
  const byName = courses.find((c) => c.workplaceId === report.workplaceId && c.name === report.note);
  return byName?.name ?? null;
}


/**
 * קיבוץ פריטים (דיווחים, מפגשים, שורות ייצוא) לפי הרמה. סדר: מקום עבודה (לפי השם), קורס
 * (א״ב, "ללא קורס" אחרון), יום בשבוע; ובתוך קבוצה — סדר הקלט.
 */
export function groupItems<T>(
  items: readonly T[],
  level: GroupLevel,
  source: (item: T) => GroupSource,
  opts: GroupLabelOptions = {},
): ItemGroup<T>[] {
  const noCourse = opts.noCourse ?? NO_COURSE_LABEL;
  const map = new Map<string, ItemGroup<T>>();
  for (const item of items) {
    const s = source(item);
    const course = level === 'workplace' ? null : s.course?.trim() || null;
    const weekday = level === 'courseDay' ? dateFromIso(s.date).getDay() : null;
    const key = `${s.workplaceId}|${level === 'workplace' ? '' : course ?? '∅'}|${weekday ?? ''}`;
    let g = map.get(key);
    if (!g) {
      const parts: string[] = [];
      if (level !== 'workplace') parts.push(course ?? noCourse);
      if (weekday != null) parts.push(`יום ${WEEKDAY_SHORT[weekday]}`);
      const detail = parts.join(' · ');
      const wpName = opts.workplaceName?.(s.workplaceId);
      const label = [wpName, detail].filter(Boolean).join(' · ');
      g = { key, workplaceId: s.workplaceId, course, weekday, label, detail, items: [] };
      map.set(key, g);
    }
    g.items.push(item);
  }
  const wpName = (id: string) => opts.workplaceName?.(id) ?? id;
  const noCourseGroup = (g: ItemGroup<T>) => level !== 'workplace' && g.course == null;
  return [...map.values()].sort(
    (a, b) =>
      (a.workplaceId === b.workplaceId ? 0 : wpName(a.workplaceId).localeCompare(wpName(b.workplaceId), 'he')) ||
      Number(noCourseGroup(a)) - Number(noCourseGroup(b)) ||
      (a.course ?? '').localeCompare(b.course ?? '', 'he') ||
      (a.weekday ?? 0) - (b.weekday ?? 0),
  );
}

// ── ההעדפה (מאגר קטן ברמת המודול, כמו lib/hebrewDatePref.ts) ──

let value: GroupLevel = DEFAULT_GROUP_LEVEL;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

void readJSON<unknown>(KEYS.courseGrouping, DEFAULT_GROUP_LEVEL).then((saved) => {
  const level = parseGroupLevel(saved);
  if (level && level !== value) {
    value = level;
    emit();
  }
});

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useGroupLevel(): GroupLevel {
  return useSyncExternalStore(subscribe, () => value, () => value);
}

/** הרמה הנוכחית — לקוד שאינו רכיב. */
export const groupLevelNow = (): GroupLevel => value;

export async function setGroupLevel(level: GroupLevel): Promise<void> {
  value = level;
  emit();
  await writeJSON(KEYS.courseGrouping, level);
}
