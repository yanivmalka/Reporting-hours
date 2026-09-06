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
  /**
   * חותמת מחיקה (מילישניות). כשקיימת — מקום העבודה נמצא ב"אשפה" ואינו
   * מוצג ברשימות הרגילות. אחרי {@link TRASH_RETENTION_DAYS} ימים הוא נמחק לצמיתות.
   */
  deletedAt?: number;
};

/** נתוני טופס לפני שמירה — כמו Workplace אך בלי מזהה ובלי שדות מערכת. */
export type WorkplaceDraft = Omit<Workplace, 'id' | 'deletedAt'>;

const STORAGE_KEY = 'reporting-hours/workplaces/v1';

/** כמה ימים מקום עבודה נשמר באשפה לפני מחיקה סופית. */
export const TRASH_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * DAY_MS;

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

export function saveWorkplaces(list: Workplace[]): Promise<void> {
  return writeJSON(STORAGE_KEY, list);
}

/**
 * טוען את הרשימה המלאה (פעילים + אשפה), מנקה מהאשפה פריטים שפג תוקפם
 * (מעל {@link TRASH_RETENTION_DAYS} ימים) ושומר חזרה אם משהו נוקה.
 */
async function loadAllPruned(): Promise<Workplace[]> {
  const all = await readJSON<Workplace[]>(STORAGE_KEY, []);
  const now = Date.now();
  const kept = all.filter(
    (w) => w.deletedAt == null || now - w.deletedAt < TRASH_RETENTION_MS,
  );
  if (kept.length !== all.length) await saveWorkplaces(kept);
  return kept;
}

/** מקומות העבודה הפעילים בלבד (לא כולל אשפה). */
export async function loadWorkplaces(): Promise<Workplace[]> {
  const all = await loadAllPruned();
  return all.filter((w) => w.deletedAt == null);
}

/** מקומות העבודה שבאשפה, מהנמחק אחרון לראשון. */
export async function loadDeletedWorkplaces(): Promise<Workplace[]> {
  const all = await loadAllPruned();
  return all
    .filter((w) => w.deletedAt != null)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

/** כמה ימים שלמים נותרו לשחזור מקום עבודה מהאשפה (0 ומעלה). */
export function trashDaysLeft(workplace: Workplace, now: number = Date.now()): number {
  if (workplace.deletedAt == null) return TRASH_RETENTION_DAYS;
  const remaining = TRASH_RETENTION_MS - (now - workplace.deletedAt);
  return Math.max(0, Math.ceil(remaining / DAY_MS));
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
  // עובדים על הרשימה המלאה כדי לא לדרוס פריטים שנמצאים באשפה.
  const all = await loadAllPruned();
  const next = draft.id
    ? all.map((w) => (w.id === draft.id ? { ...w, ...draft, id: w.id } : w))
    : [...all, { ...draft, id: makeId() }];
  await saveWorkplaces(next);
  return next.filter((w) => w.deletedAt == null);
}

/**
 * מעביר מקום עבודה לאשפה (מחיקה רכה). ניתן לשחזר אותו תוך
 * {@link TRASH_RETENTION_DAYS} ימים. מחזיר את רשימת הפעילים המעודכנת.
 */
export async function trashWorkplace(id: string): Promise<Workplace[]> {
  const all = await loadAllPruned();
  const next = all.map((w) =>
    w.id === id && w.deletedAt == null ? { ...w, deletedAt: Date.now() } : w,
  );
  await saveWorkplaces(next);
  return next.filter((w) => w.deletedAt == null);
}

/** מוציא מקום עבודה מהאשפה ומחזיר אותו לרשימה הפעילה. מחזיר את רשימת האשפה המעודכנת. */
export async function restoreWorkplace(id: string): Promise<Workplace[]> {
  const all = await loadAllPruned();
  const next: Workplace[] = all.map((w) =>
    w.id === id ? { ...w, deletedAt: undefined } : w,
  );
  await saveWorkplaces(next);
  return next.filter((w) => w.deletedAt != null);
}

/** מחיקה סופית של מקום עבודה (מתוך האשפה). מחזיר את רשימת האשפה המעודכנת. */
export async function deleteWorkplace(id: string): Promise<Workplace[]> {
  const all = await loadAllPruned();
  const next = all.filter((w) => w.id !== id);
  await saveWorkplaces(next);
  return next.filter((w) => w.deletedAt != null);
}
