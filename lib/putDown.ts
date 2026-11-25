/**
 * זיהוי "הטלפון הונח מהיד" מתוך מד התאוצה — טהור, עם בדיקות (test/putDown.test.ts).
 * משמש את נעילת המידע הכספי (lib/appLock.ts): נועלים רק כשהטלפון הונח, לא בכל יציאה מהאפליקציה.
 *
 * טלפון ביד אף פעם לא דומם לגמרי — רעד היד מזיז את מד התאוצה בכמה אלפיות g. טלפון שמונח
 * על משטח מראה רק את רעש החיישן. לכן: חלון של `WINDOW_MS` אחרון, ובו סטיית התקן של כל ציר;
 * כשהגדולה שבהן מתחת ל־`STILL_STD_G` — הטלפון דומם, ונמדד מתי זה התחיל.
 *
 * "הונח" = דומם ברציפות `FLAT_AFTER_MS` כשהוא שוכב (מסך למעלה או למטה), או `UPRIGHT_AFTER_MS`
 * בכל תנוחה אחרת (מעמד, נשען על משהו) — ובלי נגיעה במסך באותו זמן.
 */

export type Sample = { x: number; y: number; z: number; t: number };

/** חלון המדידה (מ"ש) ותדירות הדגימה. */
export const WINDOW_MS = 1500;
export const SAMPLE_INTERVAL_MS = 100;
/** סטיית תקן מרבית (ב־g) לציר בחלון כדי להיחשב דומם. רעד יד — בדרך כלל 0.005–0.03g; משטח — עד ~0.003g. */
export const STILL_STD_G = 0.004;
/** שוכב: רכיב הכבידה בציר z לפחות כך מכלל התאוצה (~20° מהאופק). */
export const FLAT_RATIO = 0.94;
/** כמה זמן דומם עד שנחשב "הונח". */
export const FLAT_AFTER_MS = 10_000;
export const UPRIGHT_AFTER_MS = 30_000;

function std(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  return Math.sqrt(v);
}

/** האם החלון (דגימות שמכסות לפחות 80% מ־WINDOW_MS) דומם. null — אין מספיק דגימות. */
export function windowStill(win: Sample[]): boolean | null {
  if (win.length < 5 || win[win.length - 1].t - win[0].t < WINDOW_MS * 0.8) return null;
  const m = Math.max(std(win.map((s) => s.x)), std(win.map((s) => s.y)), std(win.map((s) => s.z)));
  return m < STILL_STD_G;
}

export function isFlat(s: Sample): boolean {
  const mag = Math.hypot(s.x, s.y, s.z);
  return mag > 0.5 && Math.abs(s.z) / mag >= FLAT_RATIO;
}

export type PutDownDetector = {
  add(s: Sample): void;
  /** נגיעה במסך — הטלפון בשימוש, הספירה מתחילה מחדש. */
  touch(t: number): void;
  /** כמה זמן (מ"ש) הטלפון דומם ברציפות עד `now` (0 — לא דומם / לא ידוע). */
  stillFor(now: number): number;
  /** האם הטלפון הונח (דומם מספיק זמן לפי התנוחה, בלי נגיעה). */
  putDown(now: number): boolean;
  reset(): void;
};

export function createPutDownDetector(): PutDownDetector {
  let win: Sample[] = [];
  let stillSince: number | null = null;
  let lastTouch = 0;
  let last: Sample | null = null;
  return {
    add(s) {
      win.push(s);
      last = s;
      while (win.length > 1 && s.t - win[0].t > WINDOW_MS) win.shift();
      const still = windowStill(win);
      if (still === null) return;
      if (!still) stillSince = null;
      else if (stillSince === null) stillSince = Math.max(win[0].t, lastTouch);
    },
    touch(t) {
      lastTouch = t;
      if (stillSince !== null) stillSince = t;
    },
    stillFor(now) {
      return stillSince === null ? 0 : Math.max(0, now - stillSince);
    },
    putDown(now) {
      if (stillSince === null || !last) return false;
      return now - stillSince >= (isFlat(last) ? FLAT_AFTER_MS : UPRIGHT_AFTER_MS);
    },
    reset() {
      win = [];
      stillSince = null;
      last = null;
    },
  };
}
