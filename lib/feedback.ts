/**
 * משוב צליל ורטט עדין — לכפתורים, לתפריטים ולהודעות אזהרה (ובנעילת הכוונת בפתיחה).
 * הגדרה לכל מכשיר (`KEYS.feedback`): צליל · רטט, כל אחד בנפרד, בדף "הגדרות" (תצוגה).
 * אנדרואיד בלבד; בדפדפן — שקט. הצלילים קצרים ושקטים (assets/sounds), ומתנגנים במצב "ערבוב"
 * עם צלילים אחרים — לא עוצרים מוזיקה. מאגר קטן ברמת המודול, כמו lib/viewOnly.ts.
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { readJSON, writeJSON } from './storage';
import { KEYS } from './keys';

export type FeedbackSettings = { sound: boolean; haptics: boolean };
export type FeedbackKind = 'tap' | 'menu' | 'warn' | 'lock';

const DEFAULT: FeedbackSettings = { sound: true, haptics: true };
const NATIVE = Platform.OS === 'android' || Platform.OS === 'ios';

let value: FeedbackSettings = DEFAULT;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

void readJSON<Partial<FeedbackSettings>>(KEYS.feedback, {}).then((saved) => {
  value = { ...DEFAULT, ...(saved && typeof saved === 'object' ? saved : {}) };
  emit();
});

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useFeedbackSettings(): FeedbackSettings {
  return useSyncExternalStore(subscribe, () => value, () => value);
}

export async function setFeedbackSettings(next: FeedbackSettings): Promise<void> {
  value = next;
  emit();
  await writeJSON(KEYS.feedback, next);
}

const SOURCES: Record<FeedbackKind, number> = {
  tap: require('../assets/sounds/tap.wav'),
  menu: require('../assets/sounds/menu.wav'),
  warn: require('../assets/sounds/warn.wav'),
  lock: require('../assets/sounds/chime.wav'),
};
const VOLUME: Record<FeedbackKind, number> = { tap: 0.5, menu: 0.5, warn: 0.6, lock: 0.55 };

let players: Partial<Record<FeedbackKind, AudioPlayer>> | null = null;
function player(kind: FeedbackKind): AudioPlayer | null {
  try {
    if (!players) {
      players = {};
      void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(
        () => {},
      );
    }
    let p = players[kind];
    if (!p) {
      p = createAudioPlayer(SOURCES[kind]);
      p.volume = VOLUME[kind];
      players[kind] = p;
    }
    return p;
  } catch {
    return null;
  }
}

function vibrate(kind: FeedbackKind) {
  switch (kind) {
    case 'tap':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    case 'menu':
      return Haptics.selectionAsync();
    case 'warn':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    case 'lock':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }
}

/** משוב לפעולה — לפי ההגדרה. לא זורק לעולם. */
export function feedback(kind: FeedbackKind): void {
  if (!NATIVE) return;
  if (value.haptics) void vibrate(kind)?.catch(() => {});
  if (value.sound) {
    const p = player(kind);
    if (!p) return;
    try {
      void p.seekTo(0);
      p.play();
    } catch {
      /* צליל לא קריטי */
    }
  }
}

/** טעינה מוקדמת של הצלילים (בפתיחה), כדי שהלחיצה הראשונה לא תתעכב. */
export function preloadFeedback(): void {
  if (!NATIVE) return;
  (Object.keys(SOURCES) as FeedbackKind[]).forEach((k) => player(k));
}
