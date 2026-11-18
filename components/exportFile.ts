/**
 * שמירה ושיתוף של קובץ ייצוא (lib/exportReports.ts).
 *  - אנדרואיד: הקובץ נכתב לתיקיית המטמון ונפתח חלון השיתוף של המערכת (שמירה ב־Drive, מייל, וואטסאפ…).
 *    PDF נוצר מ־HTML (expo-print).
 *  - דפדפן: CSV יורד כקובץ; PDF — חלון הדפסה של הדפדפן ("שמירה כ־PDF").
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export async function shareCsv(content: string, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: fileName });
}

export async function sharePdf(html: string, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    const w = window.open('', '_blank');
    if (!w) throw new Error('popup blocked');
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 });
  const named = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.deleteAsync(named, { idempotent: true });
  await FileSystem.moveAsync({ from: uri, to: named });
  await Sharing.shareAsync(named, { mimeType: 'application/pdf', dialogTitle: fileName, UTI: 'com.adobe.pdf' });
}
