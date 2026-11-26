/**
 * פירוט מועדי התשלום כמו בדף תנועות בחשבון עו"ש: שורה לכל תשלום לפי התאריך שלו
 * (התקבל — תאריך הקבלה; אחרת — המועד הצפוי), מהחדש לישן, עם יתרה מצטברת של התקופה
 * וסימון "היום" בין מה שכבר עבר לבין מה שלפניך.
 */
import type { ScheduledPayment } from './forecast';

export type LedgerKind = 'received' | 'expected' | 'overdue';

export type LedgerRow = {
  payment: ScheduledPayment;
  /** התאריך שבו השורה מוצגת ("YYYY-MM-DD") */
  date: string;
  kind: LedgerKind;
  amount: number;
  /** הסכום המצטבר בתקופה עד השורה הזו (כולל) */
  running: number;
  /** השורה לפני היום / התקבלה — מתחת לסימון "היום" */
  past: boolean;
};

/**
 * @param amountOf הסכום שמוצג לתשלום (נטו / ברוטו לפי הבחירה; תשלום שהתקבל — מה שסומן)
 * @returns השורות מהחדש לישן, ו־`todayIndex` — המקום של סימון "היום" ברשימה (לפני השורה הזו).
 */
export function paymentLedger(
  payments: readonly ScheduledPayment[],
  today: string,
  amountOf: (p: ScheduledPayment) => number,
): { rows: LedgerRow[]; todayIndex: number } {
  const asc = payments
    .map((p) => {
      const kind: LedgerKind = p.paidAt ? 'received' : p.expected < today ? 'overdue' : 'expected';
      const date = p.paidAt ?? p.expected;
      return { payment: p, date, kind, amount: amountOf(p), past: kind !== 'expected' };
    })
    // עבר לפני עתיד; בתוך כל צד — לפי תאריך, ובאותו תאריך לפי שם המקום.
    .sort(
      (a, b) =>
        Number(b.past) - Number(a.past) ||
        a.date.localeCompare(b.date) ||
        a.payment.workplace.name.localeCompare(b.payment.workplace.name, 'he'),
    );
  let running = 0;
  const rows = asc.map((r) => ({ ...r, running: (running += r.amount) }));
  rows.reverse();
  const todayIndex = rows.findIndex((r) => r.past);
  return { rows, todayIndex: todayIndex < 0 ? rows.length : todayIndex };
}
