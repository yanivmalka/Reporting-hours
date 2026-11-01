/**
 * נתוני הדגמה: ארבעה חודשים של דיווחים של מרצה ל"תולדות האדריכלות" ולסדנאות
 * תכנון (מטבחים, חדרי רחצה, פרויקט גמר — וילה ומבנה ציבור) בשמונה סמינרים.
 *
 * - מערכת שבועית קבועה: א׳–ה׳, 1–3 סמינרים ביום, 5–9 שעות אקדמיות ביום.
 * - זמני הסיום אינם "עגולים", כך שמופיעות דקות עודפות: חלקן מועברות למונה
 *   "דקות עבודה מצטברות" וחלקן נכללות בדיווח — וחלק מהמונה כבר נפדה.
 * - דילוג על חגי תשרי ותשעה באב ועל ימי היעדרות אקראיים.
 * - הנתונים דטרמיניסטיים (מחולל אקראי עם seed קבוע), ומסומנים `demo: true`
 *   כדי שאפשר יהיה למחוק אותם בלי לגעת בנתונים אמיתיים.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACADEMIC_HOUR_MINUTES } from './academic';
import { loadAccumulated, saveAccumulated, type AccumulatedEntry } from './accumulated';
import { loadReports, saveReports, type WorkReport } from './reports';
import { readJSON, writeJSON } from './storage';
import { formatTime } from './time';
import { saveWorkplaces, type Workplace } from './workplaces';

const KEY_PREFIX = 'reporting-hours/';
const DEMO_META_KEY = 'reporting-hours/demo/v1';
/** דגל שנשמר אחרי הבדיקה הראשונה, כדי שנתוני ההדגמה ייטענו אוטומטית פעם אחת בלבד. */
const AUTO_SEED_FLAG = 'reporting-hours/demo-auto/v1';
const WORKPLACES_KEY = 'reporting-hours/workplaces/v1';

const DAY_MS = 24 * 60 * 60 * 1000;

/** מאזינים לשינוי נתונים (טעינה/מחיקה של הדגמה, איפוס) — כדי שמסכים פתוחים יתרעננו. */
const listeners = new Set<() => void>();
export function onDataChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function notify() {
  listeners.forEach((l) => l());
}

type DemoMeta = {
  /** כמה דקות/שעות הוסיפו נתוני ההדגמה למונה של כל מקום עבודה */
  byWorkplace?: Record<string, AccumulatedEntry>;
  loadedAt: number;
};

// ───────────────────────── מקומות העבודה ─────────────────────────

type Track = 'history' | 'studio';

type DemoWorkplace = Workplace & { track: Track; group?: string };

const WORKPLACES: DemoWorkplace[] = [
  {
    id: 'demo_wp_1',
    paymentTermsDays: 30,
    name: 'סמינר "קו ומרחב" לעיצוב פנים — ירושלים',
    rate: 220,
    paymentType: 'hourly',
    payday: 10,
    arrivalMode: 'public_transport',
    travelCostPerDirection: 6,
    tripsPerDay: 2,
    track: 'history',
  },
  {
    id: 'demo_wp_2',
    paymentTermsDays: 45,
    name: 'מכללת "מבנה" לאדריכלות ועיצוב — מודיעין',
    rate: 240,
    paymentType: 'hourly',
    payday: 9,
    arrivalMode: 'car',
    travelCostPerDirection: 0,
    tripsPerDay: 2,
    track: 'studio',
  },
  {
    id: 'demo_wp_3',
    paymentTermsDays: 30,
    name: 'סמינר "שרטוט" — בית שמש',
    rate: 195,
    paymentType: 'hourly',
    payday: 15,
    arrivalMode: 'public_transport',
    travelCostPerDirection: 12.5,
    tripsPerDay: 2,
    track: 'studio',
  },
  {
    id: 'demo_wp_4',
    paymentTermsDays: 0,
    name: 'המדרשה לעיצוב "אבן וחומר"',
    rate: 6800,
    paymentType: 'monthly',
    payday: 1,
    arrivalMode: 'walk',
    travelCostPerDirection: 0,
    tripsPerDay: 2,
    track: 'history',
  },
  {
    id: 'demo_wp_5',
    paymentTermsDays: 60,
    name: 'סמינר "פרופורציה" — מבשרת ציון',
    rate: 205,
    paymentType: 'hourly',
    payday: 5,
    arrivalMode: 'public_transport',
    travelCostPerDirection: 8,
    tripsPerDay: 2,
    track: 'studio',
  },
  {
    id: 'demo_wp_6',
    paymentTermsDays: 30,
    name: 'מכללת "קשת" לעיצוב ואדריכלות',
    rate: 230,
    paymentType: 'hourly',
    payday: 12,
    arrivalMode: 'car',
    travelCostPerDirection: 0,
    tripsPerDay: 2,
    track: 'history',
  },
  {
    id: 'demo_wp_7',
    paymentTermsDays: 90,
    name: 'בית הספר להנדסאים "יסוד"',
    rate: 185,
    paymentType: 'hourly',
    payday: 1,
    arrivalMode: 'public_transport',
    travelCostPerDirection: 6,
    tripsPerDay: 2,
    track: 'history',
  },
  {
    id: 'demo_wp_8',
    paymentTermsDays: 30,
    name: 'סמינר "פתח" לאמנויות ועיצוב',
    rate: 4200,
    paymentType: 'monthly',
    payday: 10,
    arrivalMode: 'public_transport',
    travelCostPerDirection: 16,
    tripsPerDay: 2,
    track: 'studio',
  },
];

/** מקום עבודה ישן שהסתיים — מוצג באשפה כדי שגם היא "תחיה". */
const TRASHED_WORKPLACE: Workplace = {
  id: 'demo_wp_old',
  name: 'סמינר "תכנית" — סמסטר אביב (הסתיים)',
  rate: 190,
  paymentType: 'hourly',
  payday: 10,
  arrivalMode: 'public_transport',
  travelCostPerDirection: 6,
  tripsPerDay: 2,
};

/**
 * מערכת שבועית: לכל יום (0=א׳ … 4=ה׳) — הסמינרים שבהם מלמדים, לפי הסדר,
 * ומספר השעות האקדמיות המתוכנן בכל אחד. סך היום: 5–9 שעות אקדמיות.
 */
const TIMETABLE: Record<number, { wp: string; hours: number }[]> = {
  0: [
    { wp: 'demo_wp_1', hours: 3 },
    { wp: 'demo_wp_5', hours: 3 },
  ],
  1: [
    { wp: 'demo_wp_2', hours: 2 },
    { wp: 'demo_wp_7', hours: 2 },
    { wp: 'demo_wp_4', hours: 3 },
  ],
  2: [{ wp: 'demo_wp_3', hours: 6 }],
  3: [
    { wp: 'demo_wp_6', hours: 4 },
    { wp: 'demo_wp_1', hours: 4 },
  ],
  4: [
    { wp: 'demo_wp_8', hours: 3 },
    { wp: 'demo_wp_4', hours: 2 },
    { wp: 'demo_wp_5', hours: 3 },
  ],
};

// ───────────────────────── תוכן השיעורים ─────────────────────────

const HISTORY_TOPICS = [
  'מבוא: מהי אדריכלות?',
  'מצרים העתיקה ומסופוטמיה',
  'יוון הקלאסית — הסדרים הדורי, היוני והקורינתי',
  'רומא: הקשת, הקמרון והכיפה',
  'האדריכלות הביזנטית',
  'הרומנסק',
  'הגותיקה והקתדרלות',
  'הרנסנס — ברונלסקי ואלברטי',
  'הבארוק',
  'הניאו־קלאסיציזם',
  'המהפכה התעשייתית — ברזל וזכוכית',
  'הבאוהאוס',
  'לה קורבוזיה ו"חמש הנקודות"',
  'הסגנון הבינלאומי בתל אביב',
  'אדריכלות ישראלית — שנות ה־50 וה־60',
  'אדריכלות עכשווית',
  'חזרה לקראת מבחן',
];

/** סדנאות התכנון לפי שבוע מתחילת התקופה (0–17), עם שלבי עבודה והגשות. */
function studioTopic(week: number): string {
  const kitchens = [
    'סדנת מטבחים — מבוא, ארגונומיה ומשולש העבודה',
    'סדנת מטבחים — תכנון חזיתות ופריסות',
    'סדנת מטבחים — חומרים ופרזול',
    'מטבחים — ביקורת ביניים',
    'הגשה: מטבחים',
  ];
  const baths = [
    'סדנת חדרי רחצה — מבוא, מידות ותקנות',
    'סדנת חדרי רחצה — אינסטלציה וניקוז בתכנון',
    'סדנת חדרי רחצה — חיפויים ופרטים',
    'חדרי רחצה — ביקורת ביניים',
    'הגשה: חדרי רחצה',
  ];
  const villa = [
    'פרויקט גמר: וילה — ניתוח מגרש וקונספט',
    'פרויקט גמר: וילה — תכניות קומה',
    'פרויקט גמר: וילה — חתכים וחזיתות',
    'פרויקט גמר: וילה — ביקורת ביניים',
  ];
  const publicBldg = [
    'פרויקט גמר: מבנה ציבור — פרוגרמה',
    'פרויקט גמר: מבנה ציבור — תכנון מרחבי',
    'פרויקט גמר: מבנה ציבור — ביקורת ביניים',
    'הגשה: פרויקט גמר — וילה ומבנה ציבור',
  ];
  const all = [...kitchens, ...baths, ...villa, ...publicBldg];
  return all[Math.min(all.length - 1, Math.max(0, week))];
}

// ───────────────────────── עזרי תאריך ואקראיות ─────────────────────────

/** מחולל אקראי דטרמיניסטי (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    chance: (p: number) => next() < p,
    pick: <T>(list: readonly T[]) => list[Math.floor(next() * list.length)],
  };
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ימים ללא לימודים (חגי תשרי תשפ"ז, תשעה באב ועוד). */
const HOLIDAYS = new Set([
  '2026-07-23', // תשעה באב
  '2026-09-11',
  '2026-09-13', // ראש השנה
  '2026-09-20',
  '2026-09-21', // יום כיפור
  '2026-09-24',
  '2026-09-25',
  '2026-09-27',
  '2026-09-28',
  '2026-09-29',
  '2026-09-30',
  '2026-10-01',
  '2026-10-02', // סוכות
]);

const roundTo5 = (minutes: number) => Math.round(minutes / 5) * 5;

let breakSeq = 0;
const breakId = () => `demo_br_${(breakSeq++).toString(36)}`;

// ───────────────────────── המחולל ─────────────────────────

type Generated = { reports: WorkReport[]; carriedTotal: number };

/** מייצר דיווחים מתחילת החודש, ארבעה חודשים אחורה, ועד אתמול. */
export function generateDemoReports(today: Date = new Date()): Generated {
  const r = rng(20260701);
  const from = new Date(today.getFullYear(), today.getMonth() - 4, 1);
  const until = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 23);
  const historyLesson: Record<string, number> = {};
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  const reports: WorkReport[] = [];
  let carriedTotal = 0;
  breakSeq = 0;

  const totalWeeks = Math.max(1, Math.ceil((until.getTime() - from.getTime()) / (7 * DAY_MS)));
  // מעבר יום לפי לוח השנה (ולא +24 שעות) — כדי לא להיתקע במעבר שעון חורף/קיץ.
  for (
    let d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
    d <= until;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12)
  ) {
    const weekday = d.getDay();
    if (weekday > 4) continue; // שישי ושבת
    const date = iso(d);
    if (HOLIDAYS.has(date)) continue;
    if (r.chance(0.04)) continue; // יום היעדרות / ביטול

    const week = Math.floor(Math.round((d.getTime() - fromDay.getTime()) / DAY_MS) / 7);
    const slots = TIMETABLE[weekday];

    // שעות אקדמיות לכל מפגש, עם תנודה קלה ושמירה על 5–9 ביום.
    const hours = slots.map((s) => Math.max(1, s.hours + r.pick([-1, 0, 0, 0, 1])));
    let total = hours.reduce((a, b) => a + b, 0);
    while (total > 9) {
      const i = hours.indexOf(Math.max(...hours));
      hours[i] -= 1;
      total -= 1;
    }
    while (total < 5) {
      hours[r.int(0, hours.length - 1)] += 1;
      total += 1;
    }

    let clock = r.pick([8 * 60, 8 * 60 + 15, 8 * 60 + 30, 9 * 60]);
    slots.forEach((slot, i) => {
      const wp = WORKPLACES.find((w) => w.id === slot.wp)!;
      const academic = hours[i];

      // הפסקות: מפגש של 3 שעות אקדמיות ומעלה — הפסקה אחת או שתיים.
      const breaks =
        academic >= 3
          ? Array.from({ length: academic >= 5 ? 2 : 1 }, () => ({
              id: breakId(),
              minutes: r.pick([10, 15, 15, 20, 30]),
            }))
          : [];
      const breakTotal = breaks.reduce((a, b) => a + b.minutes, 0);

      // זמן נטו: השעות האקדמיות + דקות עודפות "לא עגולות" (או אפס).
      const extra = r.chance(0.25) ? 0 : r.pick([5, 10, 10, 15, 20, 25, 30, 35, 40]);
      const net = academic * ACADEMIC_HOUR_MINUTES + extra;
      const start = roundTo5(clock);
      const end = start + net + breakTotal;
      const leftover = net % ACADEMIC_HOUR_MINUTES;
      const carried = leftover > 0 && r.chance(0.6) ? leftover : 0;
      carriedTotal += carried;

      let note: string;
      if (wp.track === 'history') {
        const n = historyLesson[wp.id] ?? 0;
        historyLesson[wp.id] = n + 1;
        // הנושא מתקדם לפי השבוע בסמסטר; כל מפגש ממוספר בנפרד.
        const idx = Math.min(
          HISTORY_TOPICS.length - 1,
          Math.floor((week / totalWeeks) * HISTORY_TOPICS.length),
        );
        note = `תולדות האדריכלות, שנה א׳ · מפגש ${n + 1}: ${HISTORY_TOPICS[idx]}`;
      } else {
        note = studioTopic(week);
      }

      reports.push({
        id: `demo_wr_${date}_${i}`,
        workplaceId: wp.id,
        date,
        start: formatTime(start),
        end: formatTime(end),
        breaks,
        carriedMinutes: carried,
        note,
        demo: true,
        createdAt: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() + end * 60 * 1000,
      });

      clock = end + r.pick([30, 40, 45, 60, 75]); // נסיעה בין סמינרים
    });
  }
  return { reports, carriedTotal };
}

// ───────────────────────── טעינה ומחיקה ─────────────────────────

export async function isDemoLoaded(): Promise<boolean> {
  return (await readJSON<DemoMeta | null>(DEMO_META_KEY, null)) != null;
}

/**
 * טוען (או טוען מחדש) את נתוני ההדגמה: מחליף דיווחי הדגמה קודמים, מוסיף או
 * מעדכן את מקומות העבודה לדוגמה, ומעדכן את מונה הדקות המצטברות — כשחלק
 * ממנו כבר "נפדה" לשעות אקדמיות. נתונים אמיתיים אינם נפגעים.
 */
export async function loadDemoData(): Promise<number> {
  await removeDemoData();

  // מקומות עבודה — לפי מזהה קבוע, בלי לדרוס מקומות עבודה של המשתמש.
  const existing = await readJSON<Workplace[]>(WORKPLACES_KEY, []);
  const demoWps: Workplace[] = WORKPLACES.map(({ track: _t, group: _g, ...w }) => ({
    ...w,
    demo: true,
  }));
  const trashed: Workplace = {
    ...TRASHED_WORKPLACE,
    demo: true,
    deletedAt: Date.now() - 6 * DAY_MS,
  };
  const ids = new Set([...demoWps, trashed].map((w) => w.id));
  await saveWorkplaces([...existing.filter((w) => !ids.has(w.id)), ...demoWps, trashed]);

  // דיווחים.
  const { reports } = generateDemoReports();
  const current = await loadReports();
  await saveReports([...current.filter((r) => !r.demo), ...reports]);

  // מונה מצטבר לכל סמינר: רוב הדקות כבר נפדו; בחלק מהסמינרים נשארה שעה
  // אחת זמינה לפדיון, ובאחרים רק יתרה קטנה.
  const carriedBy: Record<string, number> = {};
  for (const r of reports) {
    if (r.carriedMinutes > 0) carriedBy[r.workplaceId] = (carriedBy[r.workplaceId] ?? 0) + r.carriedMinutes;
  }
  const contributions: Record<string, AccumulatedEntry> = {};
  Object.entries(carriedBy).forEach(([id, sum], i) => {
    const redeemedHours = Math.max(0, Math.floor(sum / ACADEMIC_HOUR_MINUTES) - (i % 2 === 0 ? 1 : 0));
    contributions[id] = { minutes: sum - redeemedHours * ACADEMIC_HOUR_MINUTES, redeemedHours };
  });
  const acc = await loadAccumulated();
  const byWorkplace = { ...acc.byWorkplace };
  for (const [id, c] of Object.entries(contributions)) {
    const e = byWorkplace[id] ?? { minutes: 0, redeemedHours: 0 };
    byWorkplace[id] = { minutes: e.minutes + c.minutes, redeemedHours: e.redeemedHours + c.redeemedHours };
  }
  await saveAccumulated({ byWorkplace });

  const meta: DemoMeta = { byWorkplace: contributions, loadedAt: Date.now() };
  await writeJSON(DEMO_META_KEY, meta);
  await writeJSON(AUTO_SEED_FLAG, true);
  notify();
  return reports.length;
}

/**
 * מוחק את דיווחי ההדגמה ואת תרומתם למונה המצטבר. מקומות העבודה, ההעדפות
 * (מראה, שפה, בסיס חישוב) והדיווחים האמיתיים נשארים.
 */
export async function removeDemoData(): Promise<number> {
  const current = await loadReports();
  const kept = current.filter((r) => !r.demo);
  const removed = current.length - kept.length;
  if (removed > 0) await saveReports(kept);

  const meta = await readJSON<DemoMeta | null>(DEMO_META_KEY, null);
  if (meta) {
    const acc = await loadAccumulated();
    const byWorkplace = { ...acc.byWorkplace };
    if (meta.byWorkplace) {
      for (const [id, c] of Object.entries(meta.byWorkplace)) {
        const e = byWorkplace[id];
        if (!e) continue;
        byWorkplace[id] = {
          minutes: Math.max(0, e.minutes - c.minutes),
          redeemedHours: Math.max(0, e.redeemedHours - c.redeemedHours),
        };
      }
    } else {
      // הדגמה ישנה (מונה גלובלי) — מאפסים את המונים של סמינרי ההדגמה.
      for (const id of Object.keys(byWorkplace)) if (id.startsWith('demo_wp_')) delete byWorkplace[id];
    }
    await saveAccumulated({ byWorkplace });
    await AsyncStorage.removeItem(DEMO_META_KEY).catch(() => {});
  }
  if (removed > 0) notify();
  return removed;
}

/** מחיקת כל נתוני האפליקציה: דיווחים, מקומות עבודה, מונה והעדפות. */
export async function resetAllData(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(KEY_PREFIX)));
  } catch {
    // אחסון לא זמין — אין מה למחוק.
  }
  // לא לטעון שוב נתוני הדגמה אוטומטית אחרי איפוס מכוון.
  await writeJSON(AUTO_SEED_FLAG, true);
  notify();
}

/**
 * בהפעלה הראשונה בלבד: אם אין עדיין מקומות עבודה ודיווחים — טוען נתוני
 * הדגמה, כדי שהאפליקציה תיראה כמו מערכת שכבר עובדים בה.
 */
export async function autoSeedIfFresh(): Promise<boolean> {
  if (await readJSON<boolean>(AUTO_SEED_FLAG, false)) return false;
  const [wps, reports] = await Promise.all([
    readJSON<Workplace[]>(WORKPLACES_KEY, []),
    loadReports(),
  ]);
  if (wps.length > 0 || reports.length > 0) {
    await writeJSON(AUTO_SEED_FLAG, true);
    return false;
  }
  await loadDemoData();
  return true;
}
