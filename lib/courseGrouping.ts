/**
 * תצוגת הקורסים בפירוט מקום עבודה בלוח הבקרה, כשלאותו שם קורס יש כמה ימים
 * (קורס בכמה ימים בשבוע, או קורסים נפרדים עם אותו שם):
 *   - 'split'  — קורס לכל יום, ולשם מתווסף היום ("תכנון אדריכלי · יום ב׳");
 *   - 'merged' — מאוחד לפי השם, כמו בדוח השכר ("תכנון אדריכלי · ימים ב׳, ה׳").
 * ההעדפה (`KEYS.courseGrouping`) נשמרת כהעדפת תצוגה. החלוקה עצמה — טהורה.
 */
import { useSyncExternalStore } from 'react';
import { WEEKDAY_SHORT, type Course } from './courses';
import { readJSON, writeJSON } from './storage';
import { KEYS } from './keys';

export type CourseGroupMode = 'split' | 'merged';

export type CourseDisplayGroup = { key: string; label: string; courses: Course[] };

const nameOf = (c: Pick<Course, 'name'>) => c.name.trim();

/** "יום ב׳" / "ימים ב׳, ה׳" — לפי הימים בשבוע של הקורסים. */
export function weekdaysLabel(courses: readonly Pick<Course, 'weekday'>[]): string {
  const days = [...new Set(courses.map((c) => c.weekday))].sort((a, b) => a - b);
  if (days.length === 0) return '';
  return `${days.length > 1 ? 'ימים' : 'יום'} ${days.map((d) => WEEKDAY_SHORT[d]).join(', ')}`;
}

/** האם יש בין הקורסים שמות כפולים (אז יש מה לבחור בין פיצול לאיחוד). */
export function hasSharedNames(courses: readonly Pick<Course, 'name'>[]): boolean {
  const names = courses.map(nameOf);
  return new Set(names).size < names.length;
}

/**
 * חלוקת הקורסים לקבוצות תצוגה, בסדר ההופעה. שם ייחודי — בלי תוספת. שם משותף:
 * בפיצול — היום (ואם גם היום זהה — שעת ההתחלה); באיחוד — קבוצה אחת עם כל הימים.
 */
export function groupCoursesForDisplay(courses: readonly Course[], mode: CourseGroupMode): CourseDisplayGroup[] {
  const byName = new Map<string, Course[]>();
  for (const c of courses) byName.set(nameOf(c), [...(byName.get(nameOf(c)) ?? []), c]);
  if (mode === 'merged') {
    return [...byName].map(([name, list]) => ({
      key: list[0].id,
      label: list.length > 1 ? `${name} · ${weekdaysLabel(list)}` : name,
      courses: list,
    }));
  }
  return courses.map((c) => {
    const same = byName.get(nameOf(c)) ?? [c];
    if (same.length === 1) return { key: c.id, label: nameOf(c), courses: [c] };
    const sameDay = same.filter((o) => o.weekday === c.weekday).length > 1;
    return { key: c.id, label: `${nameOf(c)} · ${weekdaysLabel([c])}${sameDay ? ` ${c.start}` : ''}`, courses: [c] };
  });
}

// ── ההעדפה (מאגר קטן ברמת המודול, כמו lib/hebrewDatePref.ts) ──

let value: CourseGroupMode = 'split';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

void readJSON<unknown>(KEYS.courseGrouping, 'split').then((saved) => {
  if ((saved === 'split' || saved === 'merged') && saved !== value) {
    value = saved;
    emit();
  }
});

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useCourseGrouping(): CourseGroupMode {
  return useSyncExternalStore(subscribe, () => value, () => value);
}

export async function setCourseGrouping(mode: CourseGroupMode): Promise<void> {
  value = mode;
  emit();
  await writeJSON(KEYS.courseGrouping, mode);
}
