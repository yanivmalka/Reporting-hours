/**
 * בדיקת עדכונים לגרסת האנדרואיד.
 *
 * כל push ל־main בונה APK ומפרסם אותו כ־GitHub Release עם תגית
 * v0.1.<מספר בנייה> (.github/workflows/build-apk.yml). כאן נשלפת הגרסה
 * האחרונה מה־API הציבורי של GitHub ומושווית למספר הבנייה המותקן.
 * העדכון עצמו: פתיחת קישור ה־APK בדפדפן — אנדרואיד מוריד ומציע להתקין.
 */
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

const REPO = 'yanivmalka/Reporting-hours';
const LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

export type UpdateInfo = {
  /** האם קיימת גרסה חדשה מזו המותקנת */
  available: boolean;
  latestVersion: string;
  latestBuild: number;
  /** קישור ישיר להורדת ה־APK */
  apkUrl: string | null;
  notes: string;
};

/** האם בדיקת עדכונים רלוונטית בפלטפורמה הנוכחית (אנדרואיד בלבד). */
export const updatesSupported = Platform.OS === 'android';

/** מספר הבנייה המותקן (1 בהרצה מקומית / Expo Go). */
export function currentBuild(): number {
  const n = Number(Constants.expoConfig?.extra?.buildNumber);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** שם הגרסה המותקנת להצגה. */
export function currentVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

/** מחלץ את מספר הבנייה מתגית כמו "v0.1.12" → 12. */
export function buildFromTag(tag: string): number {
  const m = /(\d+)\s*$/.exec(tag);
  return m ? Number(m[1]) : 0;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const res = await fetch(LATEST_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const data = (await res.json()) as {
    tag_name: string;
    body?: string;
    assets?: { name: string; browser_download_url: string }[];
  };
  const latestBuild = buildFromTag(data.tag_name);
  const apk = data.assets?.find((a) => a.name.endsWith('.apk'));
  return {
    available: latestBuild > currentBuild() && !!apk,
    latestVersion: data.tag_name.replace(/^v/, ''),
    latestBuild,
    apkUrl: apk?.browser_download_url ?? null,
    notes: data.body ?? '',
  };
}

/** פותח את הורדת ה־APK (או את דף הגרסאות אם אין קישור ישיר). */
export function openUpdate(info: UpdateInfo | null): Promise<void> {
  return Linking.openURL(info?.apkUrl ?? RELEASES_PAGE);
}
