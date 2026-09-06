/**
 * בסיס חישוב השכר השעתי (סעיף 7א ב־WISHLIST, שלב 4).
 *
 * המשתמש בוחר על איזה מספר שעות מוכפל התעריף השעתי:
 *   - "שעות אקדמיות" — תעריף × (דקות נטו ÷ 45)
 *   - "שעות רגילות"  — תעריף × (דקות נטו ÷ 60)
 *
 * ההגדרה גלובלית למשתמש ונשמרת מקומית (אותו מנגנון אחסון של שאר
 * האפליקציה), כך שהיא נשמרת בין הפעלות באתר ובאנדרואיד. השינוי מיידי:
 * כל המסכים שמציגים שכר קוראים את הערך דרך usePayBasis() ומתעדכנים.
 * החישוב עצמו (lib/pay.ts) טהור ונגזר מהנתונים הגולמיים, כך שהחלפת
 * הבסיס משפיעה גם רטרואקטיבית על דיווחים קיימים.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { readJSON, writeJSON } from './storage';

export type PayBasis = 'academic' | 'regular';

/** תוויות עבריות לבסיסי החישוב, לשימוש בבוררים ובתצוגה. */
export const PAY_BASIS_LABELS: Record<PayBasis, string> = {
  academic: 'שעות אקדמיות',
  regular: 'שעות רגילות',
};

/** ברירת המחדל — שעות אקדמיות (סעיף 7א). */
export const DEFAULT_PAY_BASIS: PayBasis = 'academic';

const STORAGE_KEY = 'reporting-hours/pay-basis/v1';

function isPayBasis(value: unknown): value is PayBasis {
  return value === 'academic' || value === 'regular';
}

type PayBasisContextValue = {
  /** בסיס החישוב הפעיל */
  basis: PayBasis;
  setBasis: (basis: PayBasis) => void;
  /** האם הבחירה השמורה כבר נטענה מהאחסון */
  ready: boolean;
};

const PayBasisContext = createContext<PayBasisContextValue | null>(null);

export function PayBasisProvider({ children }: { children: ReactNode }) {
  const [basis, setBasisState] = useState<PayBasis>(DEFAULT_PAY_BASIS);
  const [ready, setReady] = useState(false);

  // טעינת הבחירה השמורה פעם אחת בעליית האפליקציה.
  useEffect(() => {
    let active = true;
    readJSON<unknown>(STORAGE_KEY, null).then((saved) => {
      if (!active) return;
      if (isPayBasis(saved)) setBasisState(saved);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const setBasis = useCallback((next: PayBasis) => {
    setBasisState(next);
    void writeJSON(STORAGE_KEY, next);
  }, []);

  const value = useMemo<PayBasisContextValue>(
    () => ({ basis, setBasis, ready }),
    [basis, setBasis, ready],
  );

  return (
    <PayBasisContext.Provider value={value}>{children}</PayBasisContext.Provider>
  );
}

export function usePayBasis(): PayBasisContextValue {
  const ctx = useContext(PayBasisContext);
  if (!ctx) {
    throw new Error('usePayBasis חייב לרוץ בתוך <PayBasisProvider>');
  }
  return ctx;
}
