/**
 * טעינת נתוני מסך — דפוס אחד לכל המסכים (במקום useFocusEffect + Promise.all + דגל active
 * בכל מסך מחדש):
 *
 *   - טוען בכל כניסה למסך (פוקוס) ובכל שינוי של `deps`;
 *   - מתעלם מתוצאה ישנה: כשטעינה חדשה כבר התחילה, או כשיצאו מהמסך;
 *   - טוען מחדש כשהנתונים הוחלפו מבחוץ — טעינה / הסרה של נתוני הדגמה, איפוס (onDataChanged);
 *   - `reload()` — טעינה חוזרת לפי דרישה (למשל אחרי פעולה בדיאלוג);
 *   - שגיאת טעינה נרשמת ביומן, לא נבלעת בשקט.
 *
 * שתי צורות שימוש:
 *   const { data } = useScreenData(() => loadWorkplaces(), []);          // הנתונים מוחזרים
 *   useScreenData(load, [id], (d) => { setA(d.a); setB(d.b); });         // או מועברים ל־state קיים
 * בזמן טעינה חוזרת הנתונים הקודמים נשארים (בלי הבהוב של מסך טעינה).
 *
 * לא לטפסים שמחזיקים עריכה (עריכת קורס, נתוני מקום העבודה בטופס): שם הטעינה
 * נעשית פעם אחת ב־useEffect, כדי שחזרה למסך לא תדרוס שינויים שעוד לא נשמרו.
 */
import { useCallback, useRef, useState, type DependencyList } from 'react';
import { useFocusEffect } from 'expo-router';
import { onDataChanged } from '../lib/demo';

export function useScreenData<T>(
  load: () => Promise<T>,
  deps: DependencyList,
  onData?: (data: T) => void,
): { data: T | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  // הפונקציות האחרונות — כדי שהטעינה תשתמש בערכים העדכניים בלי לחייב אותן כ־deps.
  const loadRef = useRef(load);
  loadRef.current = load;
  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const run = () => {
        const mine = ++seq.current;
        loadRef
          .current()
          .then((result) => {
            if (!active || mine !== seq.current) return;
            setData(result);
            onDataRef.current?.(result);
          })
          .catch((e) => console.warn('[screen] load failed', e));
      };
      run();
      const off = onDataChanged(run);
      return () => {
        active = false;
        off();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, tick]),
  );

  return { data, reload };
}
