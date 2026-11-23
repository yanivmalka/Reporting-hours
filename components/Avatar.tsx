/**
 * תמונת המשתמש מחשבון Google (עיגול), ובלי תמונה — האות הראשונה של השם על צבע המערכת.
 */
import { useState } from 'react';
import { Image, View } from 'react-native';
import { Text } from './Text';
import { useTheme } from '../theme/ThemeContext';

export function Avatar({ photo, name, size = 30 }: { photo?: string | null; name?: string | null; size?: number }) {
  const { colors } = useTheme();
  const [broken, setBroken] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: colors.brand,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {photo && !broken ? (
        <Image source={{ uri: photo }} style={{ width: size, height: size }} onError={() => setBroken(true)} />
      ) : (
        <Text style={{ color: colors.textOnBrand, fontWeight: '700', fontSize: size * 0.45 }}>{initial}</Text>
      )}
    </View>
  );
}
