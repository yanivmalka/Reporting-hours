/**
 * תבניות פירוט לדוח השכר שנשלח (מייל / שיתוף): המשתמש בוחר אילו רכיבים מופיעים
 * בדוח ובאיזו רמת פירוט, ושומר את הבחירה כתבנית. לכל מקום עבודה נזכרת התבנית
 * שנבחרה לו. הטקסט נבנה ב־`payrollBody` (lib/payroll.ts) לפי `PayrollDetail`.
 *
 * מפתח מסונכרן (`KEYS.payrollTemplates`) — רק בעלים ומורשה מלא שומרים; מדווח / צופה
 * יכולים לשנות את הפירוט לשליחה אחת בלי לשמור.
 */
import { readJSON, writeJSON } from './storage';
import { KEYS } from './keys';
import { parseGroupLevel, type GroupLevel } from './courseGrouping';

/**
 * איך מוצגות במייל הדקות שנפדו מהמונה לתוך הדוח: בשורה נפרדת, או בתוך יום — הדיווח
 * האחרון בחודש / היום עם הכי מעט שעות — ואז שעות היום משתנות (התחלה מוקדמת יותר או
 * סיום מאוחר יותר, לפי `redeemedEdge`). הסיכום הכולל לא משתנה (הפדיון כבר בו).
 */
export type RedeemedPlacement = 'separate' | 'lastDay' | 'shortestDay';
export type RedeemedEdge = 'start' | 'end';

export const REDEEMED_PLACEMENT_OPTIONS: { value: RedeemedPlacement; label: string }[] = [
  { value: 'separate', label: 'בשורה נפרדת' },
  { value: 'lastDay', label: 'ביום הדיווח האחרון בחודש' },
  { value: 'shortestDay', label: 'ביום עם הכי מעט שעות בחודש' },
];
export const REDEEMED_EDGE_OPTIONS: { value: RedeemedEdge; label: string }[] = [
  { value: 'start', label: 'בתחילת היום (התחלה מוקדמת יותר)' },
  { value: 'end', label: 'בסוף היום (סיום מאוחר יותר)' },
];

export type PayrollDetail = {
  /** רמת הקיבוץ בדוח; null — כפי שנבחר במסך (ההגדרה המשותפת) */
  level: GroupLevel | null;
  /** טווח התאריכים העברי בפתיחה */
  hebrewPeriod: boolean;
  /** שורה לכל מפגש / יום. כבוי — רק שורת סיכום לכל קבוצה */
  rows: boolean;
  /** עמודות בשורה (התאריך תמיד) */
  weekday: boolean;
  hebrewDate: boolean;
  times: boolean;
  breaks: boolean;
  netHours: boolean;
  academicHours: boolean;
  /** דקות שהועברו מהמפגש למונה המצטבר */
  carried: boolean;
  /** שורת "■ קבוצה — N מפגשים · X שעות" */
  groupSummary: boolean;
  /** מפגשים שבוטלו — רשימה */
  canceled: boolean;
  /** סיכום הביטולים לפי סיבה */
  canceledSummary: boolean;
  /** סכומים בשורות הביטולים */
  canceledAmounts: boolean;
  /** שורת הפדיון מהמונה */
  redeemed: boolean;
  /** היכן מוצג הפדיון (כשהוא מוצג) */
  redeemedPlacement: RedeemedPlacement;
  /** בהצגה בתוך יום — בתחילתו או בסופו */
  redeemedEdge: RedeemedEdge;
  /** שורת "הועברו למונה" בסיכום */
  carriedTotal: boolean;
  /** בסיכום: */
  totalAcademic: boolean;
  totalNet: boolean;
  totalDays: boolean;
  travel: boolean;
  pay: boolean;
  /** חתימה עם הפרטים האישיים */
  signature: boolean;
};

/** הפירוט המלא — כפי שהדוח נשלח עד כה, ועוד שורת "הועברו למונה". */
export const FULL_DETAIL: PayrollDetail = {
  level: null,
  hebrewPeriod: true,
  rows: true,
  weekday: true,
  hebrewDate: false,
  times: true,
  breaks: false,
  netHours: false,
  academicHours: true,
  carried: false,
  groupSummary: true,
  canceled: true,
  canceledSummary: true,
  canceledAmounts: true,
  redeemed: true,
  redeemedPlacement: 'separate',
  redeemedEdge: 'end',
  carriedTotal: true,
  totalAcademic: true,
  totalNet: true,
  totalDays: true,
  travel: true,
  pay: true,
  signature: true,
};

/** מקוצר — סיכום לכל קבוצה ולכל הדוח, בלי שורות מפגשים. */
export const SHORT_DETAIL: PayrollDetail = {
  ...FULL_DETAIL,
  rows: false,
  canceled: false,
};

export type PayrollTemplate = {
  id: string;
  name: string;
  detail: PayrollDetail;
  /** תבנית מובנית — לא נמחקת ולא נערכת */
  builtIn?: boolean;
};

export const BUILT_IN_TEMPLATES: readonly PayrollTemplate[] = [
  { id: 'full', name: 'מלא', detail: FULL_DETAIL, builtIn: true },
  { id: 'short', name: 'מקוצר — סיכומים בלבד', detail: SHORT_DETAIL, builtIn: true },
];

export const DEFAULT_TEMPLATE_ID = 'full';

export type PayrollTemplateStore = {
  /** תבניות של המשתמש (בלי המובנות) */
  templates: PayrollTemplate[];
  /** מזהה מקום עבודה → מזהה התבנית שנבחרה לו */
  byWorkplace: Record<string, string>;
};

const EMPTY: PayrollTemplateStore = { templates: [], byWorkplace: {} };

/** כל רכיב בוליאני — עם ברירת המחדל המלאה לשדה חסר (תבנית ישנה / פגומה). */
export function sanitizeDetail(d: Partial<PayrollDetail> | null | undefined): PayrollDetail {
  const out = { ...FULL_DETAIL };
  for (const k of Object.keys(FULL_DETAIL) as (keyof PayrollDetail)[]) {
    if (k === 'level' || k === 'redeemedPlacement' || k === 'redeemedEdge') continue;
    const v = d?.[k];
    if (typeof v === 'boolean') (out as Record<string, unknown>)[k] = v;
  }
  out.level = d?.level == null ? null : parseGroupLevel(d.level);
  if (REDEEMED_PLACEMENT_OPTIONS.some((o) => o.value === d?.redeemedPlacement)) out.redeemedPlacement = d!.redeemedPlacement!;
  if (d?.redeemedEdge === 'start' || d?.redeemedEdge === 'end') out.redeemedEdge = d.redeemedEdge;
  return out;
}

export function sanitizeStore(raw: unknown): PayrollTemplateStore {
  const s = raw as Partial<PayrollTemplateStore> | null;
  const templates = (Array.isArray(s?.templates) ? s.templates : [])
    .filter((t): t is PayrollTemplate => !!t && typeof t.id === 'string' && typeof t.name === 'string')
    .filter((t) => !BUILT_IN_TEMPLATES.some((b) => b.id === t.id))
    .map((t) => ({ id: t.id, name: t.name.trim() || 'תבנית', detail: sanitizeDetail(t.detail) }));
  const byWorkplace: Record<string, string> = {};
  for (const [k, v] of Object.entries(s?.byWorkplace ?? {})) if (typeof v === 'string') byWorkplace[k] = v;
  return { templates, byWorkplace };
}

/** המובנות ואחריהן של המשתמש. */
export const allTemplates = (store: PayrollTemplateStore): PayrollTemplate[] => [
  ...BUILT_IN_TEMPLATES,
  ...store.templates,
];

/** התבנית של מקום עבודה (המלאה, אם לא נבחרה או נמחקה). */
export function templateFor(store: PayrollTemplateStore, workplaceId: string): PayrollTemplate {
  const list = allTemplates(store);
  const id = store.byWorkplace[workplaceId] ?? DEFAULT_TEMPLATE_ID;
  return list.find((t) => t.id === id) ?? list[0];
}

export const sameDetail = (a: PayrollDetail, b: PayrollDetail) =>
  (Object.keys(FULL_DETAIL) as (keyof PayrollDetail)[]).every((k) => a[k] === b[k]);

/** שמירת תבנית חדשה / עדכון קיימת של המשתמש (טהור). */
export function upsertTemplate(store: PayrollTemplateStore, t: PayrollTemplate): PayrollTemplateStore {
  if (BUILT_IN_TEMPLATES.some((b) => b.id === t.id)) return store;
  const clean = { id: t.id, name: t.name.trim() || 'תבנית', detail: sanitizeDetail(t.detail) };
  const exists = store.templates.some((x) => x.id === t.id);
  return {
    ...store,
    templates: exists ? store.templates.map((x) => (x.id === t.id ? clean : x)) : [...store.templates, clean],
  };
}

/** מחיקת תבנית של המשתמש; מקומות שבחרו בה חוזרים למלאה (טהור). */
export function removeTemplate(store: PayrollTemplateStore, id: string): PayrollTemplateStore {
  const byWorkplace = Object.fromEntries(Object.entries(store.byWorkplace).filter(([, v]) => v !== id));
  return { templates: store.templates.filter((t) => t.id !== id), byWorkplace };
}

export function assignTemplate(store: PayrollTemplateStore, workplaceId: string, id: string): PayrollTemplateStore {
  return { ...store, byWorkplace: { ...store.byWorkplace, [workplaceId]: id } };
}

export const newTemplateId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function loadPayrollTemplates(): Promise<PayrollTemplateStore> {
  return sanitizeStore(await readJSON<unknown>(KEYS.payrollTemplates, EMPTY));
}

export async function savePayrollTemplates(store: PayrollTemplateStore): Promise<PayrollTemplateStore> {
  const clean = sanitizeStore(store);
  await writeJSON(KEYS.payrollTemplates, clean);
  return clean;
}
