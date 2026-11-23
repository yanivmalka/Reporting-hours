/**
 * איחוד עיגולי מפגשים לעיגול אחד לכל יום — כשבאותו יום יש כמה מפגשים (כמה קורסים באותו מקום).
 * מצב העיגול המאוחד, לפי המפגשים שמתקיימים באותו יום (דווח / טרם דווח):
 *   כולם דווחו → "דווח" · אף אחד → "מתוכנן" · חלק → "דווח חלקית" (`partial`, עם "1/2").
 * אם אף מפגש לא מתקיים (בוטל, חג, חופשה, הועבר) — המצב של הראשון. טהור.
 */
export type DayPart = { date: string; state: string; reportId?: string };

export type MergedDay<D extends DayPart> = {
  date: string;
  /** מצב העיגול המאוחד; 'partial' — חלק מהמפגשים דווחו */
  state: D['state'] | 'partial';
  /** כל המפגשים של היום, בסדר הקלט */
  parts: D[];
  /** במצב חלקי: כמה דווחו מתוך כמה שמתקיימים */
  reported: number;
  held: number;
};

const HELD = new Set(['reported', 'open']);

export function mergeDotsByDay<D extends DayPart>(dots: readonly D[]): MergedDay<D>[] {
  const map = new Map<string, D[]>();
  for (const d of dots) map.set(d.date, [...(map.get(d.date) ?? []), d]);
  return [...map].map(([date, parts]) => {
    const held = parts.filter((p) => HELD.has(p.state));
    const reported = held.filter((p) => p.state === 'reported').length;
    const state: MergedDay<D>['state'] =
      held.length === 0
        ? parts[0].state
        : reported === held.length
          ? 'reported'
          : reported === 0
            ? 'open'
            : 'partial';
    return { date, state, parts, reported, held: held.length };
  });
}
