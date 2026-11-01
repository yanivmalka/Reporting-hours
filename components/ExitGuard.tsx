/**
 * אישור לפני יציאה מהאפליקציה (אנדרואיד): כשלוחצים "חזרה" במסך הראשון —
 * במקום שהאפליקציה תתמזער מיד, נשאלים בדיאלוג.
 */
import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useConfirm } from './ConfirmDialog';

export function ExitGuard() {
  const router = useRouter();
  const confirm = useConfirm();
  const openRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // יש לאן לחזור בתוך האפליקציה — התנהגות רגילה.
      if (router.canGoBack()) return false;
      if (openRef.current) return true;
      openRef.current = true;
      confirm({
        title: 'לצאת מהאפליקציה?',
        confirmLabel: 'יציאה',
        cancelLabel: 'הישארות',
        destructive: false,
        onConfirm: () => {
          openRef.current = false;
          BackHandler.exitApp();
        },
      });
      // סגירת הדיאלוג בלי יציאה — מאפשרים לשאול שוב בפעם הבאה.
      setTimeout(() => {
        openRef.current = false;
      }, 400);
      return true;
    });
    return () => sub.remove();
  }, [router, confirm]);

  return confirm.dialog;
}
