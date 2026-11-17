/** מצב הטופס, הקבוצות והמרות של טופס מקום העבודה (app/workplace-form.tsx). */
import { type CancelPayKind } from '../../lib/cancelReasons';
import { ARRIVAL_MODE_LABELS, reportDeadlineDay, PAYMENT_TYPE_LABELS, DEFAULT_TAXI_REMINDER, emptyDraft, paymentTermsOf, type ArrivalMode, type PaymentType, type TaxiReminder } from '../../lib/workplaces';

/** מצב הטופס — שדות מספריים נשמרים כמחרוזת כדי לאפשר עריכה חופשית. */
/** איש קשר בטופס — כל השדות כמחרוזות */
export type ContactRow = { id: string; description: string; name: string; phone: string; email: string };

/** כלל תשלום על ביטול בטופס — הערך כמחרוזת לעריכה חופשית. */
export type CancelPayRow = { kind: CancelPayKind; value: string };

export type FormState = {
  /** כלל תשלום על ביטול, לכל סיבה (מזהה) */
  cancelPay: Record<string, CancelPayRow>;
  name: string;
  address: string;
  contacts: ContactRow[];
  rate: string;
  paymentType: PaymentType;
  payday: string;
  paymentTermsDays: string;
  payrollEmail: string;
  ccEmails: string;
  taxPercent: string;
  employeeNumber: string;
  arrivalMode: ArrivalMode;
  travelCostPerDirection: string;
  tripsPerDay: string;
  /** מונית: טלפון, שם איש קשר והעדפת תזכורת */
  taxiPhone: string;
  taxiContact: string;
  taxiReminderKind: TaxiReminder['kind'];
  taxiHours: string;
  taxiNightTime: string;
  /** משבצת הצבע בפלטת מקומות העבודה */
  colorIndex: number;
  /** תשלום לפי שעה אקדמית (45 דק׳); null — לא נקבע במקום (ההגדרה הכללית) */
  academic: boolean | null;
};

export type Errors = Partial<Record<keyof FormState, string>> & { contactErrors?: Record<string, string> };

/**
 * קבוצות הטופס, לפי הסדר: כללי · שכר ותשלום · (ביטולים) · קורסים · חופשות · הגעה
 * ונסיעות · דוחות שכר · ניהול. בעריכה — קבוצות מתקפלות עם שורת תקציר;
 * ביצירה — וויזארד, צעד לכל קבוצה.
 */
export type GroupKey = 'general' | 'pay' | 'cancel' | 'courses' | 'vacations' | 'arrival' | 'payroll' | 'manage';
export const GROUP_TITLES: Record<GroupKey, string> = {
  general: 'כללי',
  pay: 'שכר ותשלום',
  cancel: 'ביטולים',
  courses: 'קורסים',
  vacations: 'חופשות',
  arrival: 'הגעה ונסיעות',
  payroll: 'דוחות שכר',
  manage: 'ניהול',
};
export const EDIT_GROUPS: GroupKey[] = ['general', 'pay', 'cancel', 'courses', 'vacations', 'arrival', 'payroll', 'manage'];
/** ביצירה: קורסים, חופשות וניהול — רק אחרי שמירה. */
export const NEW_STEPS: GroupKey[] = ['general', 'pay', 'cancel', 'arrival', 'payroll'];
/** לאיזו קבוצה שייכת כל שגיאה (לפתיחת הקבוצה / לחזרה לצעד). */
export const ERROR_GROUP: Partial<Record<string, GroupKey>> = {
  name: 'general',
  contactErrors: 'general',
  rate: 'pay',
  payday: 'pay',
  paymentTermsDays: 'pay',
  taxPercent: 'pay',
  employeeNumber: 'pay',
  address: 'arrival',
  travelCostPerDirection: 'arrival',
  tripsPerDay: 'arrival',
  taxiPhone: 'arrival',
  taxiHours: 'arrival',
  taxiNightTime: 'arrival',
  payrollEmail: 'payroll',
  ccEmails: 'payroll',
  cancelPay: 'cancel',
};
export const groupsWithErrors = (e: Errors): GroupKey[] =>
  [...new Set(Object.entries(e).filter(([, v]) => Boolean(v)).map(([k]) => ERROR_GROUP[k] ?? 'general'))];

/** אפשרויות "שוטף +" לבחירה (בלי הקלדה חופשית). */
export const TERMS_OPTIONS = [0, 15, 30, 45, 60, 90];

export const PAYMENT_OPTIONS = (Object.keys(PAYMENT_TYPE_LABELS) as PaymentType[]).map(
  (value) => ({ value, label: PAYMENT_TYPE_LABELS[value] }),
);
export const ARRIVAL_OPTIONS = (Object.keys(ARRIVAL_MODE_LABELS) as ArrivalMode[])
  .filter((value) => value !== 'walk')
  .map((value) => ({ value, label: ARRIVAL_MODE_LABELS[value] }));

export function draftToForm(d: ReturnType<typeof emptyDraft>): FormState {
  const reminder = d.taxi?.reminder ?? DEFAULT_TAXI_REMINDER;
  return {
    cancelPay: Object.fromEntries(
      Object.entries(d.cancelPay ?? {}).map(([k, r]) => [k, { kind: r.kind, value: r.value != null ? String(r.value) : '' }]),
    ),
    name: d.name,
    address: d.address ?? '',
    contacts: (d.contacts ?? []).map((c) => ({
      id: c.id,
      description: c.description,
      name: c.name ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
    })),
    rate: String(d.rate),
    paymentType: d.paymentType,
    payday: String(reportDeadlineDay(d)),
    paymentTermsDays: String(paymentTermsOf(d)),
    payrollEmail: d.payrollEmail ?? '',
    taxPercent: String(d.taxPercent ?? 0),
    employeeNumber: d.employeeNumber ?? '',
    ccEmails: (d.ccEmails ?? []).join(', '),
    arrivalMode: d.arrivalMode,
    travelCostPerDirection: String(d.travelCostPerDirection),
    tripsPerDay: String(d.tripsPerDay),
    taxiPhone: d.taxi?.phone ?? '',
    taxiContact: d.taxi?.contactName ?? '',
    taxiReminderKind: reminder.kind,
    taxiHours: String(reminder.kind === 'hoursBefore' ? reminder.hours : 2),
    taxiNightTime: reminder.kind === 'nightBefore' ? reminder.time : '21:00',
    colorIndex: d.colorIndex ?? 0,
    academic: d.payBasis == null ? null : d.payBasis === 'academic',
  };
}

export const TAXI_REMINDER_OPTIONS: { value: TaxiReminder['kind']; label: string }[] = [
  { value: 'hoursBefore', label: 'שעות לפני' },
  { value: 'nightBefore', label: 'ערב לפני' },
  { value: 'none', label: 'בלי תזכורת' },
];

export function formToReminder(f: FormState): TaxiReminder {
  if (f.taxiReminderKind === 'hoursBefore') return { kind: 'hoursBefore', hours: parseNum(f.taxiHours) };
  if (f.taxiReminderKind === 'nightBefore') return { kind: 'nightBefore', time: f.taxiNightTime };
  return { kind: 'none' };
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export const splitEmails = (v: string) =>
  v
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);

export function parseNum(value: string): number {
  return Number(value.replace(',', '.').trim());
}
