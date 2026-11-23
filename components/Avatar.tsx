/**
 * תמונת המשתמש מחשבון Google (עיגול), ובלי תמונה — האות הראשונה של השם על צבע המערכת.
 * `hat` — כשצופים בחשבון של משתמש אחר: מעל התמונה שלו כובע, כמו "חובשים את הכובע שלו".
 */
import { useState } from 'react';
import { Image, View } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import { useTheme } from '../theme/ThemeContext';

export function Avatar({
  photo,
  name,
  size = 30,
  hat = false,
}: {
  photo?: string | null;
  name?: string | null;
  size?: number;
  hat?: boolean;
}) {
  const { colors } = useTheme();
  const [broken, setBroken] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const hatSize = Math.round(size * 0.82);
  return (
    <View style={{ width: size, height: size + (hat ? hatSize * 0.42 : 0), justifyContent: 'flex-end' }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          backgroundColor: colors.brand,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: hat ? 2 : 0,
          borderColor: colors.brand,
        }}
      >
        {photo && !broken ? (
          <Image source={{ uri: photo }} style={{ width: size, height: size }} onError={() => setBroken(true)} />
        ) : (
          <Text style={{ color: colors.textOnBrand, fontWeight: '700', fontSize: size * 0.45 }}>{initial}</Text>
        )}
      </View>
      {hat ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: (size - hatSize) / 2 + size * 0.06,
            transform: [{ rotate: '-14deg' }],
          }}
        >
          {/* מתאר בהיר מאחור, כדי שהכובע ייראה גם על תמונה כהה */}
          <View style={{ position: 'absolute', top: -1.5, left: -1.5 }}>
            <Icon name="hat-fedora" size={hatSize + 3} color={colors.background} />
          </View>
          <Icon name="hat-fedora" size={hatSize} color={colors.brandDark} />
        </View>
      ) : null}
    </View>
  );
}
