/** יומן — גלילה עם "מגנט" לראש האריח (טהור, עם בדיקות). */

/** השהיה מרגע שהרשימה נעצרת ועד שהיום מסומן (מ״ש). */
export const SETTLE_MS = 180;

/**
 * נקודות המגנט: ראש כל יום מתחת לפס המוצמד (8 פיקסלים מרווח, כמו בגלילה
 * יזומה ליום). אריח גבוה מהמסך מקבל נקודות ביניים, כדי שאפשר יהיה לעצור
 * גם באמצעו.
 */
export function snapPoints(
  days: [string, { y: number; bottom: number }][],
  listTop: number,
  stripHeight: number,
  windowHeight: number,
): { offsets: number[]; dates: string[] } {
  const view = Math.max(200, windowHeight - stripHeight - 120);
  const step = Math.round(view * 0.8);
  const pts: { y: number; date: string }[] = [];
  for (const [date, pos] of [...days].sort((a, b) => a[1].y - b[1].y)) {
    if (!Number.isFinite(pos.y)) continue;
    const top = Math.round(listTop + pos.y - stripHeight - 8);
    if (top <= 0) continue;
    pts.push({ y: top, date });
    for (let y = top + step; y < top + (pos.bottom - pos.y) - view * 0.5; y += step) pts.push({ y: Math.round(y), date });
  }
  pts.sort((a, b) => a.y - b.y);
  const out: { y: number; date: string }[] = [];
  for (const p of pts) if (!out.length || p.y - out[out.length - 1].y > 4) out.push(p);
  return { offsets: out.map((p) => p.y), dates: out.map((p) => p.date) };
}

/**
 * היעד בדפדפן (שבו אין snapToOffsets): בכיוון הגלילה האחרון — הנקודה הבאה;
 * לפני הנקודה הראשונה / אחרי האחרונה — בלי מגנט (גלילה חופשית).
 */
export function webSnapTarget(offsets: number[], y: number, dir: number): number | null {
  if (!offsets.length || y < offsets[0] - 40 || y > offsets[offsets.length - 1] + 40) return null;
  if (offsets.some((o) => Math.abs(o - y) <= 2)) return null;
  if (dir > 0) return offsets.find((o) => o > y) ?? offsets[offsets.length - 1];
  if (dir < 0) return [...offsets].reverse().find((o) => o < y) ?? offsets[0];
  return offsets.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));
}

export function sameOffsets(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1);
}
