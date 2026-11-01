/**
 * בהפעלה הראשונה של האפליקציה (אין עדיין מקומות עבודה ודיווחים) — טוען
 * נתוני הדגמה ומודיע על כך. ניתן למחוק אותם ממסך "ניהול נתונים".
 */
import { useEffect } from 'react';
import { autoSeedIfFresh, ensureDemoCourses } from '../lib/demo';
import { useToast } from './Toast';

export function DemoSeeder() {
  const { showToast } = useToast();
  useEffect(() => {
    autoSeedIfFresh()
      .then((seeded) => {
        if (seeded) showToast('נטענו נתוני הדגמה · למחיקה: תפריט ← ניהול נתונים');
        else void ensureDemoCourses();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
