/**
 * סיבות ביטול ותשלום על מפגשים שבוטלו.
 *
 * - רשימת סיבות גלובלית לעריכה (הוספה, שינוי שם, מחיקה, סדר). ברירת מחדל:
 *   מחלה, ביטול מצד המוסד, שביתה, מבחנים, אירוע מיוחד. סימון ביטול שומר את
 *   טקסט הסיבה (וגם את מזהה הסיבה כשנבחרה מהרשימה), ולכן סיבה שנמחקה נשמרת
 *   בביטולים ישנים.
 * - כלל תשלום לכל מוסד ולכל סיבה (`Workplace.cancelPay`, לפי מזהה הסיבה):
 *   ללא תשלום (ברירת מחדל) · מלא לפי השעות המתוכננות · אחוז · סכום קבוע.
 * - מפגש מבוטל בתשלום נכלל בדוח השכר (שורה לכל מפגש + סיכום לפי סיבה), בצפי
 *   ובפוטנציאל.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { ACADEMIC_HOUR_MINUTES } from './academic';
import { sessionMinutes, type Course } from './courses';
import type { PayBasis } from './payBasis';
import type { Cancellation } from './sessions';
import { readJSON, writeJSON } from './storage';
import { workplaceAt, type Workplace } from './workplaces';

export type CancelReason = { id: string; name: string };

export type CancelPayKind = 'none' | 'full' | 'percent' | 'fixed';
export type CancelPayRule = { kind: CancelPayKind; /** אחוז (percent) או סכום ב־₪ (fixed) */ value?: number };

export const CANCEL_PAY_LABELS: Record<CancelPayKind, string> = {
  none: 'ללא תשלום',
  full: 'מלא לפי השעות המתוכננות',
  percent: 'אחוז',
  fixed: 'סכום קבוע',
};

export const DEFAULT_CANCEL_REASONS: CancelReason[] = [
  { id: 'r_sick', name: 'מחלה' },
  { id: 'r_institution', name: 'ביטול מצד המוסד' },
  { id: 'r_strike', name: 'שביתה' },
  { id: 'r_exams', name: 'מבחנים' },
  { id: 'r_event', name: 'אירוע מיוחד' },
];

const KEY = 'reporting-hours/cancel-reasons/v1';

// מאגר ברמת המודול — כמו אינדקס הביטולים: חישובים טהורים קוראים currentReasons().
let reasons: CancelReason[] = DEFAULT_CANCEL_REASONS;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function loadCancelReasons(): Promise<CancelReason[]> {
  const saved = await readJSON<CancelReason[] | null>(KEY, null);
  if (Array.isArray(saved)) {
    reasons = saved.filter((r) => r && typeof r.id === 'string' && typeof r.name === 'string');
    emit();
  }
  return reasons;
}
void loadCancelReasons();

export function currentReasons(): readonly CancelReason[] {
  return reasons;
}

export async function saveCancelReasons(list: CancelReason[]): Promise<void> {
  // נשמר כמו שהוקלד (גם בזמן הקלדה — בלי לחתוך רווחים או למחוק שם ריק).
  reasons = list.map((r) => ({ id: r.id, name: r.name }));
  emit();
  await writeJSON(KEY, reasons);
}

export const makeReasonId = () => `r_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * רשימת הסיבות כ־hook — מתעדכנת מיד בכל שינוי. נטענת מחדש מהאחסון בכל עלייה
 * של רכיב, כדי לקלוט סיבות שהגיעו בסנכרון מהשרת אחרי עליית האפליקציה.
 */
export function useCancelReasons(): readonly CancelReason[] {
  useEffect(() => {
    void loadCancelReasons();
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => reasons,
    () => reasons,
  );
}

/** מזהה הסיבה של ביטול: לפי המזהה שנשמר, אחרת לפי שם סיבה קיימת. */
export function reasonIdOf(cancel: Pick<Cancellation, 'reason' | 'reasonId'>, list: readonly CancelReason[] = reasons): string | null {
  if (cancel.reasonId) return cancel.reasonId;
  const name = cancel.reason.trim();
  return list.find((r) => r.name.trim() === name)?.id ?? null;
}

/** כלל התשלום של מוסד לביטול. */
export function cancelRuleFor(w: Workplace, cancel: Cancellation | null): CancelPayRule {
  if (!cancel || cancel.kind !== 'canceled') return { kind: 'none' };
  const id = reasonIdOf(cancel);
  return (id && w.cancelPay?.[id]) || { kind: 'none' };
}

/**
 * הסכום על מפגש שבוטל, לפי כלל המוסד לסיבה. במקום בשכר חודשי — 0 (המשכורת
 * קבועה ממילא).
 */
export function canceledSessionPay(
  w: Workplace,
  course: Pick<Course, 'start' | 'end' | 'breakMinutes'>,
  date: string,
  cancel: Cancellation | null,
  basis: PayBasis,
): number {
  const rule = cancelRuleFor(w, cancel);
  if (rule.kind === 'none') return 0;
  const at = workplaceAt(w, date);
  if (at.paymentType !== 'hourly') return 0;
  if (rule.kind === 'fixed') return Math.max(0, rule.value ?? 0);
  const per = basis === 'academic' ? ACADEMIC_HOUR_MINUTES : 60;
  const full = (Math.max(0, at.rate) * sessionMinutes(course)) / per;
  if (rule.kind === 'full') return full;
  return (full * Math.min(100, Math.max(0, rule.value ?? 0))) / 100;
}
