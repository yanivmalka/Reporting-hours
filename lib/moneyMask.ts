/** הסתרת סכומים בטקסט כשהמידע הכספי נעול (lib/appLock.ts). */

/** סכום ב־₪ (כפי ש־`formatShekels` מציג: "1,234 ₪", "-12.50 ₪") ← "••• ₪". */
const MONEY_RE = /-?\d[\d,]*(?:\.\d+)?\s?₪/g;

export function maskMoney(text: string): string {
  return text.replace(MONEY_RE, '••• ₪');
}

export const hasMoney = (text: string): boolean => /\d\s?₪/.test(text);
