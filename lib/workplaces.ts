import { readJSON, writeJSON } from './storage';
import type { PayBasis } from './payBasis';

/**
 * מודל הנתונים של מקום עבודה (סעיף 3 ב־WISHLIST) והפעולות לשמירה/טעינה שלו.
 * האחסון מקומי בלבד בשלב זה (ללא שרת), תחת מפתח יחיד שמכיל את כל הרשימה.
 */

export type PaymentType = 'hourly' | 'monthly';
export type ArrivalMode = 'public_transport' | 'car' | 'walk' | 'taxi' | 'taxi_voucher';

/**
 * תזכורת להזמנת מונית לפני יום עבודה:
 *  - none — בלי תזכורת;
 *  - hoursBefore — X שעות לפני שעת היציאה (תחילת הקורס הראשון באותו יום);
 *  - nightBefore — בערב שלפני, בשעה קבועה ("HH:MM").
 */
export type TaxiReminder =
  | { kind: 'none' }
  | { kind: 'hoursBefore'; hours: number }
  | { kind: 'nightBefore'; time: string };

/** פרטי מונית למקום עבודה שמגיעים אליו במונית או במונית פתק. */
export type TaxiSettings = {
  /** טלפון תחנת המונית / הנהג */
  phone: string;
  /** שם איש הקשר (כשנבחר מאנשי הקשר) */
  contactName?: string;
  reminder: TaxiReminder;
};

export const DEFAULT_TAXI_REMINDER: TaxiReminder = { kind: 'hoursBefore', hours: 2 };

/** האם מגיעים למקום העבודה במונית (רגילה או פתק). */
export function isTaxi(mode: ArrivalMode): boolean {
  return mode === 'taxi' || mode === 'taxi_voucher';
}

/** איש קשר במקום העבודה — מזכירות, רכז/ת, מחלקת שכר וכד׳. */
export type WorkplaceContact = {
  id: string;
  /** תיאור התפקיד, למשל "מזכירות" */
  description: string;
  name?: string;
  phone?: string;
  email?: string;
};

export type Workplace = {
  id: string;
  /** שם המוסד — מכללה / אוניברסיטה */
  name: string;
  /** כתובת מקום העבודה — מוצגת בתזכורת לנסיעה */
  address?: string;
  /** אנשי קשר משויכים (מזכירות וכד׳) — ידנית או מאנשי הקשר במכשיר */
  contacts?: WorkplaceContact[];
  /** תעריף לשעה (שכר שעתי) או סכום חודשי קבוע (שכר חודשי), ב־₪ */
  rate: number;
  paymentType: PaymentType;
  /** יום בחודש (1–31) שבו מתקבל השכר — מגדיר את "החודש" הנפרד של מקום העבודה */
  payday: number;
  /**
   * תנאי תשלום "שוטף +" — מספר הימים מסוף החודש עד התשלום בפועל
   * (ברירת מחדל {@link DEFAULT_PAYMENT_TERMS}). חסר בנתונים ישנים.
   */
  paymentTermsDays?: number;
  /** כתובת המייל של מחלקת השכר — לשליחת דוח השעות החודשי */
  payrollEmail?: string;
  /** כתובות להעתק (CC) בשליחת הדוח */
  ccEmails?: string[];
  /** אחוז מס (ניכוי במקור) — לחישוב הסכום נטו לתשלום */
  taxPercent?: number;
  /** מספר עובד במקום העבודה — מופיע בדוחות ובמיילים */
  employeeNumber?: string;
  /** תיאום מס: לכל שנה לועזית — תאריך שבו נשלח ("YYYY-MM-DD") */
  taxCoordination?: Record<string, string>;
  /**
   * היסטוריית תנאים: גרסאות קודמות של התעריף / סוג התשלום / הנסיעות / המס.
   * כל גרסה חלה על תאריכים שלפני `until`. התנאים בשדות הרגילים — הנוכחיים.
   * כך שינוי תנאים לא משנה חישובים של דיווחים קודמים.
   */
  termsHistory?: TermsVersion[];
  arrivalMode: ArrivalMode;
  /** עלות נסיעה לכיוון בתחבורה ציבורית, ב־₪ */
  travelCostPerDirection: number;
  /** מספר נסיעות ליום — ברירת מחדל 2 (הלוך ושוב) */
  tripsPerDay: number;
  /** מונית / מונית פתק: טלפון והעדפת תזכורת (רק כשאופן ההגעה מונית) */
  taxi?: TaxiSettings;
  /**
   * חותמת מחיקה (מילישניות). כשקיימת — מקום העבודה נמצא ב"אשפה" ואינו
   * מוצג ברשימות הרגילות. אחרי {@link TRASH_RETENTION_DAYS} ימים הוא נמחק לצמיתות.
   */
  deletedAt?: number;
  /**
   * חותמת העברה לארכיון (מילישניות). מקום עבודה לא פעיל: לא מוצג בלו״ז,
   * בתזכורות ובבחירת מקום עבודה לדיווח חדש — אבל הדיווחים, דוחות השכר
   * והתשלומים שלו נשארים בחישובים ובהיסטוריה. אפשר להחזיר אותו בכל עת.
   */
  archivedAt?: number;
  /**
   * כשמקום העבודה באשפה: הנתונים שהועברו איתו (קורסים, דיווחים, סימוני
   * מפגשים ומונה הדקות) — מוחזרים בשחזור, ונמחקים איתו במחיקה הסופית.
   * הטיפוסים המלאים ב־lib/trash.ts.
   */
  trashed?: { courses: unknown[]; reports: unknown[]; marks: unknown[]; accumulated?: unknown };
  /** מקום עבודה שנוצר כנתוני הדגמה (lib/demo.ts) */
  demo?: boolean;
  /**
   * בסיס חישוב השכר השעתי של המקום: שעות אקדמיות (45 דק׳) או רגילות.
   * חסר — ההגדרה הכללית הישנה (`basisFor` ב־lib/payBasis.tsx).
   */
  payBasis?: PayBasis;
  /**
   * צבע מקום העבודה — משבצת בפלטה שנגזרת מצבע המערכת
   * (theme/workplaceColors.ts). נקבע אוטומטית למקום חדש ולנתונים ישנים.
   */
  colorIndex?: number;
  /**
   * כלל תשלום על מפגש שבוטל, לכל סיבה (לפי מזהה הסיבה ב־lib/cancelReasons.ts).
   * חסר — ללא תשלום.
   */
  cancelPay?: Record<string, { kind: 'none' | 'full' | 'percent' | 'fixed'; value?: number }>;
};

/** התנאים הכספיים של מקום עבודה — אלה שמשתנים לאורך זמן ונשמרים בהיסטוריה. */
export type WorkplaceTerms = {
  rate: number;
  paymentType: PaymentType;
  arrivalMode: ArrivalMode;
  travelCostPerDirection: number;
  tripsPerDay: number;
  taxPercent?: number;
};

/** גרסת תנאים קודמת — חלה על תאריכים שלפני `until` ("YYYY-MM-DD"). */
export type TermsVersion = WorkplaceTerms & { until: string };

const TERM_KEYS: (keyof WorkplaceTerms)[] = [
  'rate',
  'paymentType',
  'arrivalMode',
  'travelCostPerDirection',
  'tripsPerDay',
  'taxPercent',
];

export function termsOf(w: WorkplaceTerms): WorkplaceTerms {
  return {
    rate: w.rate,
    paymentType: w.paymentType,
    arrivalMode: w.arrivalMode,
    travelCostPerDirection: w.travelCostPerDirection,
    tripsPerDay: w.tripsPerDay,
    taxPercent: w.taxPercent ?? 0,
  };
}

export function termsChanged(a: WorkplaceTerms, b: WorkplaceTerms): boolean {
  const x = termsOf(a);
  const y = termsOf(b);
  return TERM_KEYS.some((k) => x[k] !== y[k]);
}

/**
 * מקום העבודה עם התנאים שחלו בתאריך נתון — לחישוב שכר ונסיעות של דיווח.
 * בלי תאריך, או כשאין היסטוריה — התנאים הנוכחיים.
 */
export function workplaceAt<W extends Workplace>(workplace: W, date?: string): W {
  if (!date || !workplace.termsHistory?.length) return workplace;
  const version = [...workplace.termsHistory]
    .sort((a, b) => a.until.localeCompare(b.until))
    .find((v) => date < v.until);
  if (!version) return workplace;
  const { until: _until, ...terms } = version;
  return { ...workplace, ...terms };
}

/** אחוז המס של מקום העבודה (0 כשלא הוגדר). */
export function taxPercentOf(w: Pick<Workplace, 'taxPercent'>): number {
  const n = w.taxPercent;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

/** נתוני טופס לפני שמירה — כמו Workplace אך בלי מזהה ובלי שדות מערכת. */
export type WorkplaceDraft = Omit<Workplace, 'id' | 'deletedAt' | 'archivedAt' | 'demo' | 'termsHistory' | 'trashed'>;

const STORAGE_KEY = 'reporting-hours/workplaces/v1';

/** ברירת המחדל של "שוטף +" — שוטף + 30. */
export const DEFAULT_PAYMENT_TERMS = 30;

/** תנאי התשלום של מקום עבודה ("שוטף + N"), עם ברירת מחדל לנתונים ישנים. */
export function paymentTermsOf(workplace: Pick<Workplace, 'paymentTermsDays'>): number {
  const n = workplace.paymentTermsDays;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : DEFAULT_PAYMENT_TERMS;
}

/** "שוטף + 30" */
export function paymentTermsLabel(workplace: Pick<Workplace, 'paymentTermsDays'>): string {
  return `שוטף + ${paymentTermsOf(workplace)}`;
}

/** כמה ימים מקום עבודה נשמר באשפה לפני מחיקה סופית. */
export const TRASH_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * DAY_MS;

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  hourly: 'שעתי',
  monthly: 'חודשי',
};

/**
 * היום האחרון בחודש לדיווח שכר. התקופה ("החודש") של מקום העבודה מסתיימת
 * ביום הזה, ודוח השכר צריך להישלח עד סופו — דוח שנשלח מאוחר יותר משולם
 * רק בחודש שאחרי. נשמר כ־`payday` (תחילת התקופה הבאה = היום שאחריו):
 * יום אחרון 31 ("סוף החודש") ↔ payday 1.
 */
export const LAST_DAY = 31;
export function reportDeadlineDay(w: Pick<Workplace, 'payday'>): number {
  const p = Math.round(w.payday) || 1;
  return p <= 1 ? LAST_DAY : p - 1;
}
export function paydayFromDeadline(day: number): number {
  return day >= LAST_DAY ? 1 : day + 1;
}
export function deadlineLabel(w: Pick<Workplace, 'payday'>): string {
  const d = reportDeadlineDay(w);
  return d === LAST_DAY ? 'סוף החודש' : `ה־${d} בחודש`;
}

/** "הליכה" הוסרה מהאפשרויות; נשמרת רק לקריאת נתונים ישנים (מומרת ל"רכב" בטעינה). */
export const ARRIVAL_MODE_LABELS: Record<ArrivalMode, string> = {
  car: 'רכב',
  public_transport: 'תחבורה ציבורית',
  walk: 'הליכה',
  taxi: 'מונית',
  taxi_voucher: 'מונית פתק',
};

/** ברירת מחדל לטופס מקום עבודה חדש. */
export function emptyDraft(): WorkplaceDraft {
  return {
    name: '',
    rate: 0,
    paymentType: 'hourly',
    payday: 1,
    paymentTermsDays: DEFAULT_PAYMENT_TERMS,
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
export async function loadAllPruned(): Promise<Workplace[]> {
  const raw = await readJSON<Workplace[]>(STORAGE_KEY, []);
  // "הליכה" הוסרה — כמו "רכב", בלי החזר נסיעות.
  const noWalk = (m: ArrivalMode): ArrivalMode => (m === 'walk' ? 'car' : m);
  const all = raw.map((w) => ({
    ...w,
    arrivalMode: noWalk(w.arrivalMode),
    termsHistory: w.termsHistory?.map((t) => ({ ...t, arrivalMode: noWalk(t.arrivalMode) })),
  }));
  const now = Date.now();
  const pruned = all.filter(
    (w) => w.deletedAt == null || now - w.deletedAt < TRASH_RETENTION_MS,
  );
  const kept = withColors(pruned);
  if (pruned.length !== all.length || kept.some((w, i) => w !== pruned[i])) await saveWorkplaces(kept);
  return kept;
}

/**
 * צבע למקומות שעוד אין להם: לפי מיקומם בין המקומות הפעילים (כך נצבעו עד
 * עכשיו בלוח הבקרה), ולמקום באשפה — המשבצת הפנויה הבאה.
 */
function withColors(list: Workplace[]): Workplace[] {
  if (list.every((w) => w.colorIndex != null)) return list;
  const live = list.filter((w) => w.deletedAt == null);
  return list.map((w) => {
    if (w.colorIndex != null) return w;
    const pos = live.indexOf(w);
    return { ...w, colorIndex: pos >= 0 ? pos % WORKPLACE_COLORS : freeColor(list) };
  });
}

/** מספר המשבצות בפלטת צבעי מקומות העבודה (theme/workplaceColors.ts). */
const WORKPLACE_COLORS = 8;

/** המשבצת הפחות בשימוש בין המקומות הפעילים — למקום עבודה חדש. */
export function freeColor(list: readonly Pick<Workplace, 'colorIndex' | 'deletedAt'>[]): number {
  const used = new Array(WORKPLACE_COLORS).fill(0);
  for (const w of list) if (w.deletedAt == null && w.colorIndex != null) used[w.colorIndex % WORKPLACE_COLORS] += 1;
  const min = Math.min(...used);
  return used.indexOf(min);
}

/** מקומות העבודה הפעילים בלבד (לא כולל אשפה). */
export async function loadWorkplaces(): Promise<Workplace[]> {
  const all = await loadAllPruned();
  return all.filter((w) => w.deletedAt == null);
}

/** האם מקום העבודה בארכיון (לא פעיל). */
export function isArchived(w: Pick<Workplace, 'archivedAt'>): boolean {
  return w.archivedAt != null;
}

/** מקומות העבודה הפעילים מתוך רשימה (בלי הארכיון). */
export function activeWorkplaces<W extends Pick<Workplace, 'archivedAt'>>(list: readonly W[]): W[] {
  return list.filter((w) => !isArchived(w));
}

/** העברה לארכיון (true) או החזרה ממנו (false). */
export async function setWorkplaceArchived(id: string, archived: boolean): Promise<void> {
  const all = await loadAllPruned();
  await saveWorkplaces(
    all.map((w) => (w.id === id ? { ...w, archivedAt: archived ? Date.now() : undefined } : w)),
  );
}

// העברה לאשפה, שחזור ומחיקה סופית — עם הקורסים והדיווחים: lib/trash.ts.

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

export function makeContactId(): string {
  return `ct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
  /** כשהתנאים הכספיים השתנו — מאיזה תאריך השינוי חל (ברירת מחדל: היום) */
  effectiveFrom?: string,
): Promise<Workplace[]> {
  // עובדים על הרשימה המלאה כדי לא לדרוס פריטים שנמצאים באשפה.
  const all = await loadAllPruned();
  const next = draft.id
    ? all.map((w) => {
        if (w.id !== draft.id) return w;
        let termsHistory = w.termsHistory ?? [];
        if (termsChanged(w, draft as WorkplaceTerms) && effectiveFrom) {
          // התנאים הקודמים נשמרים כגרסה שחלה עד תאריך התחולה; גרסאות
          // מאוחרות מתאריך התחולה מתבטלות (הוחלפו בתנאים החדשים).
          termsHistory = termsHistory
            .filter((v) => v.until <= effectiveFrom)
            .concat([{ ...termsOf(w), until: effectiveFrom }])
            .sort((a, b) => a.until.localeCompare(b.until));
        }
        return { ...w, ...draft, id: w.id, termsHistory };
      })
    : [...all, { ...draft, colorIndex: draft.colorIndex ?? freeColor(all), id: makeId() }];
  await saveWorkplaces(next);
  return next.filter((w) => w.deletedAt == null);
}




/** עדכון תיאום מס לשנה לועזית: תאריך שליחה, או null לביטול. */
export async function setTaxCoordination(
  workplaceId: string,
  year: string,
  date: string | null,
): Promise<Workplace[]> {
  const all = await loadAllPruned();
  const next = all.map((w) => {
    if (w.id !== workplaceId) return w;
    const map = { ...(w.taxCoordination ?? {}) };
    if (date) map[year] = date;
    else delete map[year];
    return { ...w, taxCoordination: map };
  });
  await saveWorkplaces(next);
  return next.filter((w) => w.deletedAt == null);
}

/** מקומות עבודה פעילים שלא נכללו בתיאום המס של השנה. */
export function missingTaxCoordination(workplaces: readonly Workplace[], year: string): Workplace[] {
  return workplaces.filter((w) => !w.taxCoordination?.[year]);
}
