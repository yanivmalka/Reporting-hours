import { Platform } from 'react-native';

/**
 * יישור טקסט לימין / לשמאל — מותאם לאנדרואיד.
 *
 * האפליקציה כופה RTL (lib/rtl.ts). באנדרואיד, ב־RTL, רכיבי <Text> מחליפים
 * בין textAlign 'left' ו־'right' — כך ש־'right' מוצג בפועל משמאל. לכן
 * באנדרואיד מעבירים 'left' כדי לקבל יישור לימין. ב־web אין החלפה.
 * (רכיבי <TextInput> אינם מחליפים — בהם משתמשים ב־'right' כרגיל.)
 */
export const TEXT_RIGHT: 'left' | 'right' = Platform.OS === 'android' ? 'left' : 'right';
export const TEXT_LEFT: 'left' | 'right' = Platform.OS === 'android' ? 'right' : 'left';
