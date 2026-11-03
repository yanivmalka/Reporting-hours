/**
 * בדיקת עדכונים לגרסת האנדרואיד.
 *
 * APK נבנה לפי צורך (שינוי נייטיבי, [apk] בהודעת commit, או ידנית) ומתפרסם כ־GitHub Release עם תגית
 * v0.1.<מספר בנייה> (.github/workflows/build-apk.yml). כאן נשלפת הגרסה
 * האחרונה מה־API הציבורי של GitHub ומושווית למספר הבנייה המותקן.
 * העדכון עצמו: ה־APK יורד לתוך האפליקציה (עם התקדמות), ואז נפתח ישירות
 * מתקין החבילות של אנדרואיד — בלי דפדפן חיצוני.
 */
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
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

/** גיבוי: פתיחת דף הגרסאות בדפדפן (אם ההורדה הפנימית נכשלה). */
export function openReleasesPage(): Promise<void> {
  return Linking.openURL(RELEASES_PAGE);
}

/** FLAG_GRANT_READ_URI_PERMISSION — מאפשר למתקין לקרוא את הקובץ שלנו. */
const FLAG_GRANT_READ_URI_PERMISSION = 1;

/**
 * מוריד את ה־APK לתיקיית המטמון של האפליקציה, תוך דיווח התקדמות (0–1).
 * מחזיר את נתיב הקובץ המקומי. קובץ שכבר הורד במלואו — לא יורד שוב.
 */
export async function downloadApk(
  info: UpdateInfo,
  onProgress: (fraction: number) => void,
): Promise<string> {
  if (!info.apkUrl) throw new Error('no apk');
  const target = `${FileSystem.cacheDirectory}reporting-hours-${info.latestBuild}.apk`;
  const done = `${target}.done`;
  if ((await FileSystem.getInfoAsync(done)).exists) {
    onProgress(1);
    return target;
  }
  await FileSystem.deleteAsync(target, { idempotent: true });

  const task = FileSystem.createDownloadResumable(info.apkUrl, target, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) {
      onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    }
  });
  const result = await task.downloadAsync();
  if (!result || result.status !== 200) {
    await FileSystem.deleteAsync(target, { idempotent: true });
    throw new Error(`download ${result?.status ?? 'cancelled'}`);
  }
  await FileSystem.writeAsStringAsync(done, '1');
  onProgress(1);
  return result.uri;
}

/**
 * פותח את מתקין החבילות של אנדרואיד עבור ה־APK שהורד. בפעם הראשונה
 * אנדרואיד מבקש לאשר "התקנת אפליקציות לא מוכרות" עבור האפליקציה.
 */
export async function installApk(fileUri: string): Promise<void> {
  const contentUri = await FileSystem.getContentUriAsync(fileUri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
    type: 'application/vnd.android.package-archive',
  });
}
