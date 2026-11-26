import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export type DownloadStatus = 'pending' | 'running' | 'paused' | 'successful' | 'failed' | 'missing';

export type DownloadState = {
  status: DownloadStatus;
  downloaded: number;
  /** גודל הקובץ בבתים; ‎-1 כשעוד לא ידוע */
  total: number;
  reason: number;
};

type Native = {
  enqueue(url: string, fileName: string, title: string): number;
  query(id: number): DownloadState;
  remove(id: number): boolean;
  install(id: number): boolean;
};

/**
 * הורדת עדכון דרך DownloadManager של אנדרואיד (modules/apk-updater) — ממשיכה ברקע.
 * null ב־web או בגרסה שנבנתה לפני המודול; אז lib/update.ts חוזר להורדה בתוך האפליקציה.
 */
export const apkUpdater: Native | null =
  Platform.OS === 'android' ? requireOptionalNativeModule<Native>('ApkUpdater') : null;
