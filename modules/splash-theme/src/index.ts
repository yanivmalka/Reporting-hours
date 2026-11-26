import { AppState, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

const native = Platform.OS === 'android' ? requireOptionalNativeModule<{
      setTheme(id: string): boolean;
      setLauncherIcon?(id: string, ids: string[]): boolean;
    }>('SplashTheme') : null;

/**
 * מסך הפתיחה בפתיחה הבאה — בצבע הערכה (אנדרואיד 13+). בלי המודול (web, גרסה ישנה) — לא עושה כלום.
 */
export function setSplashTheme(id: string): void {
  try {
    native?.setTheme(id);
  } catch {
    // לא קריטי — מסך הפתיחה נשאר בצבע ברירת המחדל
  }
}

/**
 * אייקון האפליקציה בצבעי הערכה (activity-alias לכל ערכה — plugins/withThemedIcons.js).
 *
 * כיבוי ה־alias שדרכו נפתחה האפליקציה סוגר אותה באנדרואיד (גם עם DONT_KILL_APP) — ולכן בחירת ערכה
 * סגרה את האפליקציה. ההחלפה נדחית ליציאה מהאפליקציה (רקע), וגם אז רק אם האייקון באמת צריך להשתנות.
 * בלי המודול / בגרסה ישנה — לא עושה כלום.
 */
let pendingIcon: { id: string; ids: string[] } | null = null;

function applyPendingIcon() {
  if (!pendingIcon) return;
  const { id, ids } = pendingIcon;
  pendingIcon = null;
  try {
    native?.setLauncherIcon?.(id, ids);
  } catch {
    // לא קריטי — האייקון נשאר כפי שהוא
  }
}

if (native?.setLauncherIcon) {
  AppState.addEventListener('change', (st) => {
    if (st === 'background') applyPendingIcon();
  });
}

export function setLauncherIcon(id: string, ids: readonly string[]): void {
  if (!native?.setLauncherIcon) return;
  pendingIcon = { id, ids: [...ids] };
  if (AppState.currentState === 'background') applyPendingIcon();
}
