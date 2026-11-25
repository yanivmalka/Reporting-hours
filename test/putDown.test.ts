import { describe, expect, it } from 'vitest';
import {
  createPutDownDetector,
  FLAT_AFTER_MS,
  SAMPLE_INTERVAL_MS,
  UPRIGHT_AFTER_MS,
  windowStill,
  type Sample,
} from '../lib/putDown';

/** רעש דטרמיניסטי בעוצמה `amp` (g) סביב תנוחה נתונה. */
function feed(
  d: ReturnType<typeof createPutDownDetector>,
  from: number,
  ms: number,
  amp: number,
  pose: { x: number; y: number; z: number },
): number {
  let t = from;
  for (let i = 0; t < from + ms; i++, t += SAMPLE_INTERVAL_MS) {
    const n = (k: number) => amp * Math.sin(i * 1.7 + k) * (i % 3 === 0 ? 1 : -0.8);
    d.add({ x: pose.x + n(0), y: pose.y + n(1), z: pose.z + n(2), t });
  }
  return t;
}

const FLAT = { x: 0, y: 0, z: 1 };
const UPRIGHT = { x: 0, y: 0.8, z: 0.6 };
const HAND = 0.02; // רעד יד
const TABLE = 0.001; // רעש חיישן על משטח

describe('putDown', () => {
  it('needs a full window before deciding', () => {
    const win: Sample[] = [0, 100, 200].map((t) => ({ x: 0, y: 0, z: 1, t }));
    expect(windowStill(win)).toBeNull();
  });

  it('never fires while held in the hand', () => {
    const d = createPutDownDetector();
    const t = feed(d, 0, 120_000, HAND, UPRIGHT);
    expect(d.putDown(t)).toBe(false);
    expect(d.stillFor(t)).toBe(0);
  });

  it('fires ~10s after being laid flat on a table', () => {
    const d = createPutDownDetector();
    let t = feed(d, 0, 5_000, HAND, UPRIGHT);
    t = feed(d, t, FLAT_AFTER_MS - 2_000, TABLE, FLAT);
    expect(d.putDown(t)).toBe(false);
    t = feed(d, t, 3_000, TABLE, FLAT);
    expect(d.putDown(t)).toBe(true);
  });

  it('upright (stand) takes longer', () => {
    const d = createPutDownDetector();
    let t = feed(d, 0, 3_000, HAND, UPRIGHT);
    t = feed(d, t, FLAT_AFTER_MS + 2_000, TABLE, UPRIGHT);
    expect(d.putDown(t)).toBe(false);
    t = feed(d, t, UPRIGHT_AFTER_MS, TABLE, UPRIGHT);
    expect(d.putDown(t)).toBe(true);
  });

  it('picking it up again resets', () => {
    const d = createPutDownDetector();
    let t = feed(d, 0, 6_000, TABLE, FLAT);
    t = feed(d, t, 2_000, HAND, UPRIGHT);
    expect(d.stillFor(t)).toBe(0);
    t = feed(d, t, 6_000, TABLE, FLAT);
    expect(d.putDown(t)).toBe(false);
  });

  it('a touch on the screen restarts the count', () => {
    const d = createPutDownDetector();
    let t = feed(d, 0, FLAT_AFTER_MS - 1_000, TABLE, FLAT);
    d.touch(t);
    t = feed(d, t, 5_000, TABLE, FLAT);
    expect(d.putDown(t)).toBe(false);
    t = feed(d, t, FLAT_AFTER_MS, TABLE, FLAT);
    expect(d.putDown(t)).toBe(true);
  });
});
