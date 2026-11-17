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

const base: TextStyle = FONT_FAMILY ? { fontFamily: FONT_FAMILY } : {};

function withFont(style: StyleProp<TextStyle>): StyleProp<TextStyle> {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const weight = normalizeWeight(flat?.fontWeight);
  if (!weight || weight === flat?.fontWeight) return [base, style];
  return [base, style, { fontWeight: weight }];
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

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...props }, ref) {
  return <RNTextInput ref={ref} {...props} style={withFont(style)} />;
});

export type { TextProps, TextInputProps };
