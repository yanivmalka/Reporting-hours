/**
 * לוח החופשות המרכזי (מפרט הצפי, שלב 1 — מצב "ביטול").
 *
 * מודל שטוח, בלי עץ הורשה:
 *   - חופשה כללית (`scope.kind === 'all'`) חלה על כל המקומות והקורסים;
 *   - חופשת מקום עבודה — על כל הקורסים שלו;
 *   - חופשת קורס — על הקורס בלבד.
 * כל רמה שקיבלה חופשה בהורשה יכולה להתעלם ממנה: מזהה המקום או הקורס נכנס
 * ל־`exclude`. התעלמות של מקום עבודה חלה גם על הקורסים שלו.
 *
 * החופשה לא נשמרת על המפגשים — היא מחושבת בכל טעינה בתוך אינדקס הביטולים
 * (lib/sessions.ts), כמו החגים, ולכן חלה מיד גם על קורסים חדשים. מפגש בחופשה
 * לא נכלל בפוטנציאל ובצפי ולא נספר כדיווח חסר. מפגש שכבר דווח לא מושפע.
 *
 * המודול טהור מבחינת תלויות: הוא לא מייבא את lib/sessions או lib/courses
 * בזמן ריצה (רק טיפוסים), כדי שלא ייווצר מעגל. השמירה עוברת דרך
 * `saveVacations` ב־lib/sessions.ts, שגם בונה מחדש את האינדקס.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { readJSON } from './storage';

export type VacationScope =
  | { kind: 'all' }
  | { kind: 'workplace'; id: string }
  | { kind: 'course'; id: string };

export type Vacation = {
  id: string;
  /** שם לתצוגה ("חופשת חנוכה") — רשות */
  name?: string;
  /** תאריך ראשון, כולל (YYYY-MM-DD) */
  from: string;
  /** תאריך אחרון, כולל */
  to: string;
  /** שלב 1: 'cancel' בלבד. 'shift' (הזזה לסוף הקורס) — בהמשך. */
  mode: 'cancel';
  scope: VacationScope;
  /** מזהי מקומות עבודה וקורסים שמתעלמים מהחופשה */
  exclude: string[];
};

export const VACATIONS_KEY = 'reporting-hours/vacations/v1';

export const makeVacationId = () => `v_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** מאיפה חופשה חלה על קורס — לתצוגה בדף הקורס ובדף מקום העבודה. */
export type VacationSource = 'board' | 'workplace' | 'course';

/** האם החופשה רלוונטית לקורס (לפני התעלמות), ומאיזו רמה הגיעה. */
export function vacationSourceFor(
  v: Vacation,
  courseId: string,
  workplaceId: string | undefined,
): VacationSource | null {
  if (v.scope.kind === 'all') return 'board';
  if (v.scope.kind === 'workplace') return v.scope.id === workplaceId ? 'workplace' : null;
  return v.scope.id === courseId ? 'course' : null;
}

/** האם הקורס (או מקום העבודה שלו) מתעלם מהחופשה. */
export function vacationIgnored(v: Vacation, courseId: string, workplaceId: string | undefined): boolean {
  return v.exclude.includes(courseId) || (workplaceId != null && v.exclude.includes(workplaceId));
}

/** החופשה שחלה על מפגש של קורס בתאריך, או null. */
export function vacationOn(
  list: readonly Vacation[],
  courseId: string,
  workplaceId: string | undefined,
  date: string,
): Vacation | null {
  for (const v of list) {
    if (v.mode !== 'cancel' || date < v.from || date > v.to) continue;
    if (!vacationSourceFor(v, courseId, workplaceId)) continue;
    if (vacationIgnored(v, courseId, workplaceId)) continue;
    return v;
  }
  return null;
}

/** הטקסט לסיבת הביטול: "חופשה · חופשת חנוכה". */
export function vacationReason(v: Vacation): string {
  return v.name?.trim() ? `חופשה · ${v.name.trim()}` : 'חופשה';
}

/** החופשות שנוגעות למקום עבודה: חופשות הלוח (עם מצב ההתעלמות) והחופשות שלו. */
export function vacationsForWorkplace(list: readonly Vacation[], workplaceId: string) {
  return {
    inherited: list.filter((v) => v.scope.kind === 'all'),
    own: list.filter((v) => v.scope.kind === 'workplace' && v.scope.id === workplaceId),
  };
}

/** החופשות שנוגעות לקורס: בהורשה (לוח + מקום עבודה) ושל הקורס עצמו. */
export function vacationsForCourse(list: readonly Vacation[], courseId: string, workplaceId: string) {
  return {
    inherited: list.filter(
      (v) => v.scope.kind === 'all' || (v.scope.kind === 'workplace' && v.scope.id === workplaceId),
    ),
    own: list.filter((v) => v.scope.kind === 'course' && v.scope.id === courseId),
  };
}

function isVacation(v: unknown): v is Vacation {
  const x = v as Vacation;
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.from === 'string' &&
    typeof x.to === 'string' &&
    !!x.scope &&
    typeof x.scope.kind === 'string'
  );
}

/**
 * טעינה מהאחסון, עם ניקוי רשומות פגומות והשלמת שדות חסרים. `updateCache` —
 * עדכון המאגר והמאזינים (אינדקס הביטולים מעדכן בעצמו, אחרי שנבנה מחדש).
 */
export async function readVacations(updateCache = true): Promise<Vacation[]> {
  const saved = await readJSON<unknown>(VACATIONS_KEY, []);
  const list = Array.isArray(saved)
    ? saved.filter(isVacation).map((v) => ({
        ...v,
        mode: 'cancel' as const,
        exclude: Array.isArray(v.exclude) ? v.exclude.filter((e) => typeof e === 'string') : [],
      }))
    : [];
  if (updateCache) setVacationsCache(list);
  return list;
}

// ── מאגר ברמת המודול, לתצוגה מיידית בכל המסכים ──

let cache: Vacation[] = [];
const listeners = new Set<() => void>();

/** עדכון המאגר (נקרא מטעינה ומשמירה). */
export function setVacationsCache(list: Vacation[]): void {
  cache = list;
  listeners.forEach((l) => l());
}

export function currentVacations(): readonly Vacation[] {
  return cache;
}

/**
 * רשימת החופשות כ־hook — מתעדכנת מיד בכל שינוי, ונטענת מחדש בעליית מסך כדי
 * לקלוט חופשות שהגיעו בסנכרון.
 */
export function useVacations(): readonly Vacation[] {
  useEffect(() => {
    void readVacations();
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => cache,
    () => cache,
  );
}

/** "d/m–d/m" (או יום יחיד) לתצוגה קצרה. */
export function vacationRangeLabel(v: Pick<Vacation, 'from' | 'to'>): string {
  const short = (iso: string) => {
    const [, m, d] = iso.split('-').map(Number);
    return `${d}/${m}`;
  };
  return v.from === v.to ? short(v.from) : `⁦${short(v.from)}–${short(v.to)}⁩`;
}
