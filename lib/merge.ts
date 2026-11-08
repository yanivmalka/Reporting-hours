/**
 * מיזוג תלת־כיווני של ערך JSON מסונכרן (lib/sync.ts): הגרסה האחרונה שסונכרנה (בסיס),
 * הגרסה במכשיר והגרסה בענן. כך שני משתמשים (בעלים ומורשה) או שני מכשירים שעבדו
 * במקביל לא דורסים זה את זה:
 *
 * - רשימת רשומות (לכל פריט `id`, או `courseId` + `date` בסימוני מפגש): מיזוג לפי רשומה.
 *   רשומה ששונתה רק בצד אחד — השינוי שלו; נמחקה בצד אחד ולא שונתה בשני — נמחקת;
 *   חדשה בצד אחד — נוספת.
 * - אובייקט: מיזוג לפי שדה, באותו אופן ברקורסיה.
 * - מספרים ששונו בשני הצדדים, כש־`additive` (מונה הדקות המצטברות): שני השינויים מצטברים.
 * - כל השאר: צד שלא השתנה מהבסיס מקבל את השינוי של השני; שונו שניהם — המכשיר מנצח.
 */

type Json = unknown;

const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);

function recordKey(x: Json): string | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id === 'string') return 'id:' + o.id;
  if (typeof o.courseId === 'string' && typeof o.date === 'string') return 'cd:' + o.courseId + '|' + o.date;
  return null;
}
function isRecordList(x: Json): x is object[] {
  return Array.isArray(x) && x.every((i) => recordKey(i) != null);
}
const isPlainObject = (x: Json): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

export function merge3(base: Json, local: Json, remote: Json, additive = false): Json {
  if (same(local, remote)) return local;
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;

  if (isRecordList(local) && isRecordList(remote) && (base === undefined || isRecordList(base))) {
    const b = new Map((base as object[] | undefined)?.map((i) => [recordKey(i)!, i]) ?? []);
    const l = new Map(local.map((i) => [recordKey(i)!, i]));
    const r = new Map(remote.map((i) => [recordKey(i)!, i]));
    const out: Json[] = [];
    const pick = (k: string): Json | undefined => {
      const inL = l.has(k);
      const inR = r.has(k);
      const inB = b.has(k);
      if (inL && inR) return merge3(b.get(k), l.get(k), r.get(k), additive);
      if (inL) {
        // לא בענן: נמחק שם (אם היה בבסיס ולא השתנה כאן) או חדש כאן.
        if (inB && same(l.get(k), b.get(k))) return undefined;
        return l.get(k);
      }
      if (inR) {
        if (inB && same(r.get(k), b.get(k))) return undefined; // נמחק במכשיר
        return r.get(k);
      }
      return undefined;
    };
    const seen = new Set<string>();
    for (const k of r.keys()) {
      seen.add(k);
      const v = pick(k);
      if (v !== undefined) out.push(v);
    }
    for (const k of l.keys()) {
      if (seen.has(k)) continue;
      const v = pick(k);
      if (v !== undefined) out.push(v);
    }
    return out;
  }

  if (isPlainObject(local) && isPlainObject(remote) && (base === undefined || isPlainObject(base))) {
    const b = (base ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(remote), ...Object.keys(local)]);
    for (const k of keys) {
      const inL = k in local;
      const inR = k in remote;
      const inB = k in b;
      if (inL && inR) out[k] = merge3(b[k], local[k], remote[k], additive);
      else if (inL) {
        if (!(inB && same(local[k], b[k]))) out[k] = local[k];
      } else if (inR) {
        if (!(inB && same(remote[k], b[k]))) out[k] = remote[k];
      }
    }
    return out;
  }

  if (additive && typeof local === 'number' && typeof remote === 'number' && typeof base === 'number') {
    return remote + (local - base);
  }
  return local;
}

/** מיזוג של מחרוזות JSON. בסיס חסר (null) — אין היסטוריה משותפת. */
export function merge3Raw(baseRaw: string | null, localRaw: string, remoteRaw: string, additive = false): string {
  try {
    const base = baseRaw == null ? undefined : JSON.parse(baseRaw);
    return JSON.stringify(merge3(base, JSON.parse(localRaw), JSON.parse(remoteRaw), additive));
  } catch {
    return localRaw;
  }
}
