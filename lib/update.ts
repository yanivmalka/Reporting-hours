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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Linking, Platform } from 'react-native';
import { KEYS } from './keys';

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
 * הורדת ה־APK — אחת בכל פעם, ברמת המודול (לא ברכיב), כך שהיא ממשיכה גם כשהמסכים נטענים מחדש:
 *  - יציאה מהאפליקציה משהה את ההורדה ושומרת את נקודת ההמשך (`KEYS.updateDownload`); חזרה ממשיכה
 *    מאותה נקודה — גם אחרי שהאפליקציה נסגרה.
 *  - קריאה נוספת לאותה גרסה מצטרפת להורדה שכבר רצה, לא מתחילה מחדש.
 *  - ההתקדמות מדווחת בצעדים של אחוז (לא בכל חבילת נתונים), כדי לא להעמיס על הממשק.
 * קובץ שכבר הורד במלואו — לא יורד שוב.
 */
type Saved = { build: number; url: string; target: string; resumeData?: string };

let running: { build: number; promise: Promise<string> } | null = null;
let task: FileSystem.DownloadResumable | null = null;
let paused = false;
const progressListeners = new Set<(fraction: number) => void>();
let lastPercent = -1;

function report(fraction: number) {
  const pct = Math.floor(fraction * 100);
  if (pct === lastPercent) return;
  lastPercent = pct;
  progressListeners.forEach((l) => l(fraction));
}

async function saveResume(s: Saved | null) {
  try {
    if (s) await AsyncStorage.setItem(KEYS.updateDownload, JSON.stringify(s));
    else await AsyncStorage.removeItem(KEYS.updateDownload);
  } catch {
    // לא קריטי — במקרה הגרוע ההורדה תתחיל מההתחלה.
  }
}

async function loadResume(build: number): Promise<Saved | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.updateDownload);
    const s = raw ? (JSON.parse(raw) as Saved) : null;
    return s && s.build === build && s.resumeData ? s : null;
  } catch {
    return null;
  }
}

const resumeWaiters: (() => void)[] = [];

/** השהיה ביציאה מהאפליקציה, והמשך בחזרה אליה. */
if (updatesSupported) {
  AppState.addEventListener('change', (st) => {
    if (!task || !running) return;
    if (st === 'background' && !paused) {
      paused = true;
      const t = task;
      const build = running.build;
      void t
        .pauseAsync()
        .then(() => {
          const sv = t.savable();
          return saveResume({ build, url: sv.url, target: sv.fileUri, resumeData: sv.resumeData });
        })
        .catch(() => {});
    } else if (st === 'active' && paused) {
      paused = false;
      resumeWaiters.splice(0).forEach((r) => r());
    }
  });
}
const whenActive = () =>
  AppState.currentState === 'active' && !paused ? Promise.resolve() : new Promise<void>((r) => resumeWaiters.push(r));

async function runDownload(info: UpdateInfo): Promise<string> {
  const url = info.apkUrl as string;
  const target = `${FileSystem.cacheDirectory}reporting-hours-${info.latestBuild}.apk`;
  const done = `${target}.done`;
  if ((await FileSystem.getInfoAsync(done)).exists) {
    report(1);
    return target;
  }
  const saved = await loadResume(info.latestBuild);
  const canResume = !!saved && (await FileSystem.getInfoAsync(target)).exists;
  if (!canResume) await FileSystem.deleteAsync(target, { idempotent: true });

  task = FileSystem.createDownloadResumable(
    url,
    target,
    {},
    (p) => {
      if (p.totalBytesExpectedToWrite > 0) report(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    },
    canResume ? saved!.resumeData : undefined,
  );
  try {
    let result = canResume ? await task.resumeAsync() : await task.downloadAsync();
    // undefined — ההורדה הושהתה (יציאה מהאפליקציה): ממתינים לחזרה וממשיכים מאותה נקודה.
    while (!result) {
      await whenActive();
      result = await task.resumeAsync();
    }
    if (result.status !== 200 && result.status !== 206) throw new Error(`download ${result.status}`);
    await FileSystem.writeAsStringAsync(done, '1');
    await saveResume(null);
    report(1);
    return result.uri;
  } catch (e) {
    await FileSystem.deleteAsync(target, { idempotent: true });
    await saveResume(null);
    throw e;
  } finally {
    task = null;
    paused = false;
  }
}

export async function downloadApk(
  info: UpdateInfo,
  onProgress: (fraction: number) => void,
): Promise<string> {
  if (!info.apkUrl) throw new Error('no apk');
  progressListeners.add(onProgress);
  if (!running || running.build !== info.latestBuild) {
    lastPercent = -1;
    const promise = runDownload(info).finally(() => {
      if (running?.promise === promise) running = null;
    });
    running = { build: info.latestBuild, promise };
  }
  try {
    return await running.promise;
  } finally {
    progressListeners.delete(onProgress);
  }
}

/** הורדה שרצה עכשיו (לגרסה) — כדי שחלון העדכון יחזור אליה אחרי טעינה מחדש של המסכים. */
export function downloadInProgress(): number | null {
  return running?.build ?? null;
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
