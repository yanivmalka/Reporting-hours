/** רישום המסך הנוכחי כמסך שמוצג בו מידע כספי (lib/financeScreens.ts). */
import { useContext, useEffect } from 'react';
import { NavigationRouteContext } from 'expo-router/react-navigation';
import { markFinanceScreen } from '../lib/financeScreens';

/** מסמן את המסך הנוכחי ככספי כל עוד `active` (מחוץ למסך — לא עושה כלום). */
export function useMarkFinanceScreen(active: boolean): void {
  const route = useContext(NavigationRouteContext);
  const key = route?.key;
  useEffect(() => {
    if (!active || !key) return;
    return markFinanceScreen(key);
  }, [active, key]);
}
