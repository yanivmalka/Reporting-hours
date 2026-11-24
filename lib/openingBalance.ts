/**
 * נקודת פתיחה מדו"ח שכר קודם — מה שכבר עבדת לפני שהתחלת לדווח במערכת.
 *
 * כשמתחילים לעבוד עם המערכת באמצע תקופת שכר (lib/trackingStart.ts), המפגשים
 * שלפני תאריך תחילת העבודה אינם בצפי ובפוטנציאל, ולכן הצפי לתשלום של התקופה
 * חסר. נקודת פתיחה משלימה אותו: המשתמש מזין לפי דוח השכר הקודם שלו, לכל מקום
 * עבודה (ולקורס, אם רוצים), כמה ימים וכמה שעות כבר עבד ובאיזה תאריך.
 *
 * בצפי לתשלום (lib/forecast.ts) נקודת פתיחה נספרת **כדיווח רגיל** בתקופה שבה
 * חל התאריך שלה — שכר לפי התעריף ושעות לפי הבסיס שהוזן, והחזר נסיעות לכל יום —
 * ומסומנת בממשק כ"הוזן ידנית". היא אינה דיווח: אינה ביומן, אינה "מכסה" מפגש
 * מתוכנן ואינה נכנסת לדוח השכר שנשלח למוסד.
 *
 * מאגר קטן ברמת המודול (כמו lib/trackingStart.ts), כך שחישובי הצפי הטהורים
 * קוראים אותו בלי פרמטר נוסף: `getOpenings()`. מסך שמציג צפי טוען אותו מחדש
 * עם שאר הנתונים (`loadOpenings()` בתוך `useScreenData`), כדי שיתעדכן גם אחרי
 * סנכרון או מעבר לחשבון ששותף.
 */
import { useSyncExternalStore } from 'react';
import { ACADEMIC_HOUR_MINUTES } from './academic';
import type { PayBasis } from './payBasis';
import { readJSON, writeJSON } from './storage';
import { travelCostForDay } from './travel';
import { workplaceAt, type Workplace } from './workplaces';
import { KEYS } from './keys';

export type OpeningEntry = {
  id: string;
  workplaceId: string;
  /** הקורס (רשות) — לפירוט בלבד; בלי קורס — לכל מקום העבודה */
  courseId?: string;
  /** התאריך שאליו משויכת נקודת הפתיחה ("YYYY-MM-DD") — קובע את תקופת השכר */
  date: string;
  /** ימי עבודה שכבר עבדת (להחזר נסיעות ולספירת ימים) */
  days: number;
  /** שעות שכבר עבדת, לפי `basis` */
  hours: number;
  /** באיזה סוג שעות הוזן: אקדמיות (45 דק׳) או רגילות (60 דק׳) */
  basis: PayBasis;
  /** הערה חופשית — למשל "לפי דוח אוקטובר" */
  note?: string;
  createdAt: number;
};

export type OpeningDraft = Omit<OpeningEntry, 'id' | 'createdAt'>;

const STORAGE_KEY = KEYS.openingBalance;

let value: OpeningEntry[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

function clean(list: unknown): OpeningEntry[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (e): e is OpeningEntry =>
        !!e && typeof e.id === 'string' && typeof e.workplaceId === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date ?? ''),
    )
    .map((e) => ({ ...e, days: num(e.days), hours: num(e.hours), basis: e.basis === 'regular' ? 'regular' : 'academic' }));
}

/** טעינה מהאחסון — מעדכנת גם את המאגר שהצפי קורא ממנו. */
export async function loadOpenings(): Promise<OpeningEntry[]> {
  const next = clean(await readJSON<unknown>(STORAGE_KEY, []));
  if (JSON.stringify(next) !== JSON.stringify(value)) {
    value = next;
    emit();
  }
  return value;
}

void loadOpenings();

export function getOpenings(): readonly OpeningEntry[] {
  return value;
}

export function useOpenings(): readonly OpeningEntry[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => value,
    () => value,
  );
}

export async function saveOpenings(list: readonly OpeningEntry[]): Promise<void> {
  value = clean(list);
  emit();
  await writeJSON(STORAGE_KEY, value);
}

export async function addOpening(draft: OpeningDraft): Promise<OpeningEntry> {
  const entry: OpeningEntry = {
    ...draft,
    id: `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  };
  await saveOpenings([...(await loadOpenings()), entry]);
  return entry;
}

export async function updateOpening(id: string, draft: OpeningDraft): Promise<void> {
  const list = await loadOpenings();
  await saveOpenings(list.map((e) => (e.id === id ? { ...e, ...draft, id, createdAt: e.createdAt } : e)));
}

export async function deleteOpening(id: string): Promise<void> {
  await saveOpenings((await loadOpenings()).filter((e) => e.id !== id));
}

/** דקות העבודה של נקודת פתיחה. */
export function openingMinutes(e: Pick<OpeningEntry, 'hours' | 'basis'>): number {
  return num(e.hours) * (e.basis === 'regular' ? 60 : ACADEMIC_HOUR_MINUTES);
}

/** נקודת הפתיחה בתקופה של מקום עבודה — כמה נכנסה, ושכר ונסיעות כמו בדיווח רגיל. */
export type OpeningInPeriod = {
  count: number;
  days: number;
  /** דקות עבודה (לפי מה שהוזן) */
  minutes: number;
  /** שכר (ברוטו); במקום חודשי — 0, הסכום הקבוע מחושב בצפי */
  pay: number;
  travel: number;
  entries: OpeningEntry[];
};

/**
 * סיכום נקודות הפתיחה של מקום עבודה בתקופה [start, end]. שכר שעתי — תעריף × שעות
 * לפי בסיס החישוב של המקום (`basis`), בתנאים שחלו בתאריך של נקודת הפתיחה.
 */
export function openingFor(
  w: Workplace,
  period: { start: string; end: string },
  basis: PayBasis,
  entries: readonly OpeningEntry[] = value,
): OpeningInPeriod {
  const mine = entries.filter((e) => e.workplaceId === w.id && e.date >= period.start && e.date <= period.end);
  let pay = 0;
  let travel = 0;
  let minutes = 0;
  let days = 0;
  const per = basis === 'regular' ? 60 : ACADEMIC_HOUR_MINUTES;
  for (const e of mine) {
    const m = openingMinutes(e);
    const at = workplaceAt(w, e.date);
    minutes += m;
    days += Math.round(num(e.days));
    if (at.paymentType === 'hourly') pay += (Math.max(0, at.rate) * m) / per;
    travel += travelCostForDay(w, e.date) * Math.round(num(e.days));
  }
  return { count: mine.length, days, minutes, pay, travel, entries: mine };
}

/** תיאור קצר לסימון בממשק: "נקודת פתיחה (הוזן ידנית): 12 ש׳ · 4 ימים". */
export function openingLabel(o: Pick<OpeningInPeriod, 'days' | 'minutes'>, basis: PayBasis): string {
  const per = basis === 'regular' ? 60 : ACADEMIC_HOUR_MINUTES;
  const h = Math.round((o.minutes / per) * 100) / 100;
  const hours = `${h} ${basis === 'regular' ? 'ש׳' : 'ש״א'}`;
  const days = o.days === 1 ? 'יום אחד' : `${o.days} ימים`;
  return `נקודת פתיחה (הוזן ידנית): ${hours}${o.days ? ` · ${days}` : ''}`;
}
