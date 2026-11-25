/**
 * Text ו־TextInput של האפליקציה — במקום אלה של react-native.
 * מחילים את גופן המערכת (theme/fonts.ts) ומנרמלים את משקל הגופן: כל טקסט
 * מודגש (600–900) מוצג כ־bold של אותו גופן רגיל. סגנון שמגדיר fontFamily
 * בעצמו (למשל אייקונים) גובר.
 *
 * כשהמידע הכספי נעול (lib/appLock.ts), כל סכום ב־₪ בטקסט מוצג כ־"••• ₪", ולחיצה עליו פותחת
 * (טביעת אצבע / קוד המכשיר). כך אין צורך לטפל בכל מסך בנפרד.
 */
import { Children, forwardRef, type ReactNode } from 'react';
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from 'react-native';
import { FONT_FAMILY, normalizeWeight } from '../theme/fonts';
import { hasMoney, maskMoney, unlockFinance, useFinanceLocked } from '../lib/appLock';
import { useIsRTL } from '../lib/i18n';
import { useMarkFinanceScreen } from './useMarkFinanceScreen';

const base: TextStyle = FONT_FAMILY ? { fontFamily: FONT_FAMILY } : {};

function withFont(style: StyleProp<TextStyle>): StyleProp<TextStyle> {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const weight = normalizeWeight(flat?.fontWeight);
  if (!weight || weight === flat?.fontWeight) return [base, style];
  return [base, style, { fontWeight: weight }];
}

/** האם יש סכום ב־₪ במחרוזות שבתוכן (רק ברמה הזו). */
function containsMoney(children: ReactNode): boolean {
  let any = false;
  Children.forEach(children, (c) => {
    if (!any && typeof c === 'string' && hasMoney(c)) any = true;
  });
  return any;
}

/** מחליף סכומים במחרוזות שבתוכן (רק ברמה הזו — Text מקונן מטפל בעצמו). */
function masked(children: ReactNode): { children: ReactNode; any: boolean } {
  let any = false;
  const out = Children.map(children, (c) => {
    if (typeof c === 'string' && hasMoney(c)) {
      any = true;
      return maskMoney(c);
    }
    return c;
  });
  return { children: any ? out : children, any };
}

export const Text = forwardRef<RNText, TextProps>(function Text({ style, children, ...props }, ref) {
  const locked = useFinanceLocked();
  // מסך שמוצג בו סכום — מנעול בשורת הכותרת (lib/financeScreens.ts)
  useMarkFinanceScreen(children != null && containsMoney(children));
  if (locked && children != null) {
    const m = masked(children);
    if (m.any) {
      return (
        <RNText
          ref={ref}
          {...props}
          onPress={props.onPress ?? (() => void unlockFinance())}
          style={withFont(style)}
        >
          {m.children}
        </RNText>
      );
    }
  }
  return (
    <RNText ref={ref} {...props} style={withFont(style)}>
      {children}
    </RNText>
  );
});

/**
 * יישור תיבות הטקסט: תמיד לתחילת השורה של השפה (בעברית — לימין), חוץ מ־center.
 * ב־TextInput של אנדרואיד textAlign אינו מתהפך ב־RTL (בניגוד ל־Text), ולכן
 * `TEXT_RIGHT` / `layout.textStart` (שהם 'left' באנדרואיד) הצמידו את הטקסט לשמאל.
 * כאן היישור נקבע במקום אחד לכל האפליקציה.
 */
function inputAlign(style: StyleProp<TextStyle>, rtl: boolean): TextStyle {
  const align = (StyleSheet.flatten(style) as TextStyle | undefined)?.textAlign;
  if (align === 'center' || align === 'justify') return {};
  return { textAlign: rtl ? 'right' : 'left' };
}

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...props }, ref) {
  const rtl = useIsRTL();
  return <RNTextInput ref={ref} {...props} style={[withFont(style), inputAlign(style, rtl)]} />;
});

export type { TextProps, TextInputProps };
