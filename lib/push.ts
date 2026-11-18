/**
 * התראות לטלפון — ההגדרה (לכל מכשיר, `KEYS.push`) והתזמון במכשיר (expo-notifications).
 * מה לתזמן מחושב ב־lib/pushPlan.ts; מתי לתזמן מחדש — ב־components/PushScheduler.tsx.
 *
 * התראות מקומיות: מתוזמנות במכשיר מראש, ומוצגות גם כשהאפליקציה סגורה (ואחרי הפעלה מחדש
 * של הטלפון). אין שרת. אנדרואיד בלבד; ב־web אין התראות.
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { readJSON, writeJSON } from './storage';
import { KEYS } from './keys';
import { PUSH_KINDS, type PushItem, type PushKind } from './pushPlan';

export const pushPlatform = Platform.OS === 'android';

const CHANNEL_ID = 'reminders';

export type PushPrefs = {
  enabled: boolean;
  /** סוגים שכובו (ברירת מחדל — כולם פעילים) */
  off: PushKind[];
};

const DEFAULT_PREFS: PushPrefs = { enabled: false, off: [] };

let prefs: PushPrefs = DEFAULT_PREFS;
let loaded = !pushPlatform;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
function setPrefs(next: PushPrefs) {
  prefs = next;
  listeners.forEach((l) => l());
}

const ready: Promise<void> = pushPlatform
  ? readJSON<Partial<PushPrefs>>(KEYS.push, {}).then((v) => {
      loaded = true;
      setPrefs({ enabled: v?.enabled === true, off: Array.isArray(v?.off) ? v.off.filter((k) => PUSH_KINDS.includes(k)) : [] });
    })
  : Promise.resolve();

if (pushPlatform) {
  // גם כשהאפליקציה פתוחה — ההתראה מוצגת.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function loadPushPrefs(): Promise<PushPrefs> {
  await ready;
  return prefs;
}

export function usePushPrefs(): PushPrefs & { loaded: boolean } {
  const p = useSyncExternalStore(subscribe, () => prefs, () => prefs);
  return { ...p, loaded };
}

/** הסוגים הפעילים לפי ההגדרה. */
export const activeKinds = (p: PushPrefs): PushKind[] => PUSH_KINDS.filter((k) => !p.off.includes(k));

async function savePrefs(next: PushPrefs): Promise<void> {
  setPrefs(next);
  await writeJSON(KEYS.push, next);
}

/**
 * הפעלה / כיבוי. הפעלה מבקשת הרשאה להתראות (אנדרואיד 13 ומעלה); בלי הרשאה — לא מופעל.
 * מחזיר אם ההתראות פעילות אחרי הפעולה.
 */
export async function setPushEnabled(on: boolean): Promise<boolean> {
  if (!pushPlatform) return false;
  if (on) {
    const granted = await ensurePermission();
    if (!granted) return false;
  }
  await savePrefs({ ...prefs, enabled: on });
  if (!on) await clearScheduled();
  return on;
}

export async function setPushKind(kind: PushKind, on: boolean): Promise<void> {
  const off = on ? prefs.off.filter((k) => k !== kind) : [...new Set([...prefs.off, kind])];
  await savePrefs({ ...prefs, off });
}

async function ensurePermission(): Promise<boolean> {
  await ensureChannel();
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** האם יש הרשאה להתראות (בלי לבקש). */
export async function pushPermitted(): Promise<boolean> {
  if (!pushPlatform) return false;
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

let channelReady = false;
async function ensureChannel(): Promise<void> {
  if (channelReady) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'תזכורות',
    description: 'מונית, תזכורות מפגש, דיווח חסר ויום אחרון לדיווח שכר',
    importance: Notifications.AndroidImportance.HIGH,
  });
  channelReady = true;
}

/** חתימת ההתראה — כדי לא לתזמן מחדש התראה שלא השתנתה. */
const sig = (p: PushItem) => `${p.at.getTime()}|${p.title}|${p.body}|${p.href}`;

/**
 * מסנכרן את ההתראות המתוזמנות במכשיר לרשימה: מבטל מה שכבר לא ברשימה או שהשתנה, ומתזמן את החדשות.
 * ההתראות של האפליקציה מזוהות לפי `data.sig`.
 */
export async function syncScheduled(items: readonly PushItem[]): Promise<void> {
  if (!pushPlatform) return;
  await ensureChannel();
  const want = new Map(items.map((p) => [p.id, p]));
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  const kept = new Set<string>();
  for (const req of existing) {
    const p = want.get(req.identifier);
    if (p && req.content.data?.sig === sig(p)) kept.add(p.id);
    else await Notifications.cancelScheduledNotificationAsync(req.identifier);
  }
  for (const p of items) {
    if (kept.has(p.id)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: p.id,
      content: { title: p.title, body: p.body, data: { href: p.href, sig: sig(p) } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNEL_ID },
    });
  }
}

export async function clearScheduled(): Promise<void> {
  if (!pushPlatform) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}
