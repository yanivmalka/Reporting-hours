/**
 * אייקון גליף אחיד לאפליקציה — Material Community Icons (גופן, בלי תמונות),
 * כך שהצבע והגודל נקבעים כמו בטקסט ועובדים זהה ב־web ובאנדרואיד.
 */
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 22, color }: { name: IconName | string; size?: number; color: string }) {
  return <MaterialCommunityIcons name={name as IconName} size={size} color={color} />;
}
