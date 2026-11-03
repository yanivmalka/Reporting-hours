/**
 * Text ו־TextInput של האפליקציה — במקום אלה של react-native.
 * מחילים את גופן המערכת (theme/fonts.ts) ומנרמלים את משקל הגופן: כל טקסט
 * מודגש (600–900) מוצג כ־bold של אותו גופן רגיל. סגנון שמגדיר fontFamily
 * בעצמו (למשל אייקונים) גובר.
 */
import { forwardRef } from 'react';
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

const base: TextStyle = FONT_FAMILY ? { fontFamily: FONT_FAMILY } : {};

function withFont(style: StyleProp<TextStyle>): StyleProp<TextStyle> {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const weight = normalizeWeight(flat?.fontWeight);
  if (!weight || weight === flat?.fontWeight) return [base, style];
  return [base, style, { fontWeight: weight }];
}

export const Text = forwardRef<RNText, TextProps>(function Text({ style, ...props }, ref) {
  return <RNText ref={ref} {...props} style={withFont(style)} />;
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...props }, ref) {
  return <RNTextInput ref={ref} {...props} style={withFont(style)} />;
});

export type { TextProps, TextInputProps };
