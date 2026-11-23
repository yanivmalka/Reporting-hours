/**
 * יומן פעולות — היסטוריה של כל שינוי בדיווחים, לחקירה, לשחזור ולביטול (בעקבות תקלת 22–23.11.2026).
 *
 * כל רשומה: מה קרה (`action`), למי (`entityId`), מתי, מי ביצע ומאיזה מכשיר, והגרסאות לפני / אחרי.
 * הגרסאות שומרות את הדיווח המלא — כך אפשר לשחזר דיווח שנמחק או להחזיר עדכון (lib/activityUndo.ts).
 *
 * מקורות:
 *  - `saveReports` (lib/reports.ts) — כל כתיבה של דיווחים מהאפליקציה: נוצר / עודכן / נמחק (השוואה מול הקודם).
 *  - `MailSync` — דיווח שהשרת רשם מתשובה למייל (מזהה קבוע `mail:<id>`, כך שכמה מכשירים לא מכפילים).
 *  - הסנכרון (lib/sync.ts) — גרסה שנזרקה במיזוג (נמחק במכשיר אחד ושונה באחר): `sync-dropped`, עם הגרסה
 *    שנזרקה, כדי שאפשר יהיה להחזיר אותה.
 *
 * האחסון — מפתח מסונכרן (`KEYS.activityLog`), כך שהיומן משותף לכל המכשירים ולמורשים (מיזוג לפי `id`).
 * נשמרים 90 יום ועד 1,500 רשומות. גם מורשה ברמת "מדווח" כותב אותו (`REPORTER_KEYS` וחוקי האבטחה ב־apps-platform).
 */
import { Platform } from 'react-native';
import { readJSON, writeJSON } from './storage';
import { KEYS } from './keys';
import type { WorkReport } from './reports';

export type LogAction = 'create' | 'update' | 'delete' | 'restore' | 'undo' | 'mail' | 'sync-dropped';

export type LogEntry = {
  id: string;
  /** מתי (מילישניות) */
  at: number;
  action: LogAction;
  entity: 'report';
  entityId: string;
  /** מי ביצע (שם ומייל); חסר — לא ידוע (למשל השרת) */
  who?: { name: string; email: string };
  /** המכשיר: "android · a1b2c3" / "web · …" / "server" */
  device?: string;
  /** הגרסה לפני (חסר ביצירה) */
  before?: WorkReport;
  /** הגרסה אחרי (חסר במחיקה) */
  after?: WorkReport;
  /** שחזור / ביטול — הרשומה שהפעולה הזו מבטלת */
  undoOf?: string;
};

export const LOG_KEEP_DAYS = 90;
export const LOG_MAX = 1500;

export const ACTION_LABELS: Record<LogAction, string> = {
  create: 'דיווח נוצר',
  update: 'דיווח עודכן',
  delete: 'דיווח נמחק',
  restore: 'דיווח שוחזר',
  undo: 'עדכון בוטל',
  mail: 'דיווח התקבל מהמייל',
  'sync-dropped': 'גרסה נזרקה בסנכרון',
};

const rand = () => Math.random().toString(36).slice(2, 8);
export const makeLogId = (at: number) => `log_${at.toString(36)}_${rand()}`;

/** השוואת דיווחים בלי חותמת המדווח (`by`), שמשתנה לפי מי ששמר. */
export function sameReport(a: WorkReport | undefined, b: WorkReport | undefined): boolean {
  if (!a || !b) return a === b;
  const { by: _a, ...ra } = a;
  const { by: _b, ...rb } = b;
  return JSON.stringify(ra) === JSON.stringify(rb);
}

type Ctx = { at: number; who?: LogEntry['who']; device?: string; action?: 'restore' | 'undo'; undoOf?: string };

/**
 * ההבדל בין רשימת הדיווחים הקודמת לחדשה → רשומות יומן. דיווחי הדגמה לא נרשמים.
 * `ctx.action` — כשהכתיבה היא שחזור / ביטול מהיומן, הפעולה נרשמת כך (עם `undoOf`).
 */
export function reportLogEntries(prev: readonly WorkReport[], next: readonly WorkReport[], ctx: Ctx): LogEntry[] {
  const before = new Map(prev.map((r) => [r.id, r]));
  const after = new Map(next.map((r) => [r.id, r]));
  const out: LogEntry[] = [];
  const base = (entityId: string) => ({
    id: makeLogId(ctx.at),
    at: ctx.at,
    entity: 'report' as const,
    entityId,
    ...(ctx.who ? { who: ctx.who } : {}),
    ...(ctx.device ? { device: ctx.device } : {}),
    ...(ctx.undoOf ? { undoOf: ctx.undoOf } : {}),
  });
  for (const [id, a] of after) {
    if (a.demo) continue;
    const b = before.get(id);
    if (!b) out.push({ ...base(id), action: ctx.action ?? 'create', after: a });
    else if (!sameReport(a, b)) out.push({ ...base(id), action: ctx.action ?? 'update', before: b, after: a });
  }
  for (const [id, b] of before) {
    if (b.demo || after.has(id)) continue;
    out.push({ ...base(id), action: ctx.action ?? 'delete', before: b });
  }
  return out;
}

/** 90 יום אחרונים ועד 1,500 רשומות, מהחדש לישן. */
export function pruneLog(entries: readonly LogEntry[], now = Date.now()): LogEntry[] {
  const from = now - LOG_KEEP_DAYS * 86_400_000;
  return [...entries]
    .filter((e) => e.at >= from)
    .sort((a, b) => b.at - a.at)
    .slice(0, LOG_MAX);
}

/**
 * מיזוג בסנכרון: דיווחים שהיו בבסיס, שונו באחד הצדדים — ולא נשארו בתוצאה (מחיקה גוברת).
 * מחזיר את הגרסה שנזרקה, כדי לרשום אותה ביומן ולאפשר להחזיר אותה.
 */
export function droppedOnMerge(
  base: readonly WorkReport[],
  local: readonly WorkReport[],
  remote: readonly WorkReport[],
  merged: readonly WorkReport[],
): WorkReport[] {
  const b = new Map(base.map((r) => [r.id, r]));
  const kept = new Set(merged.map((r) => r.id));
  const out = new Map<string, WorkReport>();
  for (const side of [local, remote]) {
    for (const r of side) {
      if (kept.has(r.id) || r.demo) continue;
      const old = b.get(r.id);
      if (old && !sameReport(old, r)) out.set(r.id, r);
    }
  }
  return [...out.values()];
}

// ───────────────────────── אחסון ─────────────────────────

let deviceLabel: string | null = null;

/** תווית המכשיר: מערכת ומזהה קצר קבוע (נשמר במכשיר). */
export async function deviceName(): Promise<string> {
  if (deviceLabel) return deviceLabel;
  let id = await readJSON<string>(KEYS.deviceId, '');
  if (!id) {
    id = rand();
    await writeJSON(KEYS.deviceId, id);
  }
  deviceLabel = `${Platform.OS} · ${id}`;
  return deviceLabel;
}

export async function loadLog(): Promise<LogEntry[]> {
  const list = await readJSON<LogEntry[]>(KEYS.activityLog, []);
  return Array.isArray(list) ? pruneLog(list) : [];
}

/** הוספת רשומות (רשומה עם מזהה שכבר קיים — לא נוספת שוב). */
export async function appendLog(entries: readonly LogEntry[]): Promise<void> {
  if (!entries.length) return;
  const list = await readJSON<LogEntry[]>(KEYS.activityLog, []);
  const have = new Set((Array.isArray(list) ? list : []).map((e) => e.id));
  const fresh = entries.filter((e) => !have.has(e.id));
  if (!fresh.length) return;
  await writeJSON(KEYS.activityLog, pruneLog([...fresh, ...(Array.isArray(list) ? list : [])]));
}

/** דיווחים שהשרת רשם מתשובה למייל → רשומות יומן (מזהה קבוע `mail:<id>`, נרשם פעם אחת). */
export function mailLogEntries(reports: readonly WorkReport[]): LogEntry[] {
  return reports
    .filter((r) => r.viaEmail && !r.demo)
    .map((r) => ({
      id: `mail:${r.id}`,
      at: r.viaEmail!.receivedAt,
      action: 'mail' as const,
      entity: 'report' as const,
      entityId: r.id,
      device: 'server',
      after: r,
    }));
}
