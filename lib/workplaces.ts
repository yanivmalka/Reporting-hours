import { readJSON, writeJSON } from './storage';

/**
 * מודל הנתונים של מקום עבודה (סעיף 3 ב־WISHLIST) והפעולות לשמירה/טעינה שלו.
 * האחסון מקומי בלבד בשלב זה (ללא שרת), תחת מפתח יחיד שמכיל את כל הרשימה.
 */

export type PaymentType = 'hourly' | 'monthly';
export type ArrivalMode = 'public_transport' | 'car' | 'walk';

export type Workplace = {
  id: string;
  /** שם המוסד — מכללה / אוניברסיטה */
  name: string;
  /** תעריף לשעה (שכר שעתי) או סכום חודשי קבוע (שכר חודשי), ב־₪ */
  rate: number;
  paymentType: PaymentType;
  /** יום בחודש (1–31) שבו מתקבל השכר — מגדיר את "החודש" הנפרד של מקום העבודה */
  payday: number;
  arrivalMode: ArrivalMode;
  /** עלות נסיעה לכיוון בתחבורה ציבורית, ב־₪ */
  travelCostPerDirection: number;
  /** מספר נסיעות ליום — ברירת מחדל 2 (הלוך ושוב) */
  tripsPerDay: number;
};

/** נתוני טופס לפני שמירה — כמו Workplace אך בלי מזהה. */
export type WorkplaceDraft = Omit<Workplace, 'id'>;

const STORAGE_KEY = 'reporting-hours/workplaces/v1';

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  hourly: 'שעתי',
  monthly: 'חודשי',
};

export const ARRIVAL_MODE_LABELS: Record<ArrivalMode, string> = {
  public_transport: 'תחבורה ציבורית',
  car: 'רכב',
  walk: 'הליכה',
};

/** ברירת מחדל לטופס מקום עבודה חדש. */
export function emptyDraft(): WorkplaceDraft {
  return {
    name: '',
    rate: 0,
    paymentType: 'hourly',
    payday: 1,
    arrivalMode: 'public_transport',
    travelCostPerDirection: 0,
    tripsPerDay: 2,
  };
}

export function loadWorkplaces(): Promise<Workplace[]> {
  return readJSON<Workplace[]>(STORAGE_KEY, []);
}

export function saveWorkplaces(list: Workplace[]): Promise<void> {
  return writeJSON(STORAGE_KEY, list);
}

function makeId(): string {
  return `wp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * מוסיף מקום עבודה חדש (כשאין `id`) או מעדכן קיים (כשיש `id`),
 * שומר את הרשימה המעודכנת ומחזיר אותה.
 */
export async function upsertWorkplace(
  draft: WorkplaceDraft & { id?: string },
): Promise<Workplace[]> {
  const list = await loadWorkplaces();
  const next = draft.id
    ? list.map((w) => (w.id === draft.id ? { ...w, ...draft, id: w.id } : w))
    : [...list, { ...draft, id: makeId() }];
  await saveWorkplaces(next);
  return next;
}

export async function deleteWorkplace(id: string): Promise<Workplace[]> {
  const list = await loadWorkplaces();
  const next = list.filter((w) => w.id !== id);
  await saveWorkplaces(next);
  return next;
}
