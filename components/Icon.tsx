/**
 * אייקון גליף אחיד לאפליקציה — Material Community Icons (גופן, בלי תמונות),
 * כך שהצבע והגודל נקבעים כמו בטקסט ועובדים זהה ב־web ובאנדרואיד.
 */
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import { useHydrated } from '../lib/useHydrated';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 22, color }: { name: IconName | string; size?: number; color: string }) {
  // ברינדור מראש הגופן לא טעון והאייקון יוצא ריק; בדפדפן הוא כבר טעון.
  // עד סיום ה־hydration מציירים את אותו מציין מקום ריק כמו בשרת.
  const hydrated = useHydrated();
  if (!hydrated) return <Text />;
  return <MaterialCommunityIcons name={name as IconName} size={size} color={color} />;
}
