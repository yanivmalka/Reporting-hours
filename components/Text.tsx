/**
 * Text ו־TextInput עם גופן האפליקציה (theme/fonts.ts) — במקום אלה של
 * react-native. סגנון שמגדיר fontFamily בעצמו (למשל אייקונים) גובר.
 */
import { forwardRef } from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
} from 'react-native';
import { FONT_FAMILY } from '../theme/fonts';

const base = { fontFamily: FONT_FAMILY };

export const Text = forwardRef<RNText, TextProps>(function Text({ style, ...props }, ref) {
  return <RNText ref={ref} {...props} style={[base, style]} />;
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...props }, ref) {
  return <RNTextInput ref={ref} {...props} style={[base, style]} />;
});

export type { TextProps, TextInputProps };
