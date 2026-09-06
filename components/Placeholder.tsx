import { StyleSheet, Text, View } from 'react-native';
import { Screen } from './Screen';
import { useThemedStyles } from '../theme/useThemedStyles';
import { spacing, type AppColors } from '../theme/colors';

type PlaceholderProps = {
  heading: string;
  description: string;
  stage: string;
};

/** מסך זמני עד למימוש בשלב המתאים בתוכנית העבודה. */
export function Placeholder({ heading, description, stage }: PlaceholderProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Screen>
      <View style={styles.wrap}>
        <Text style={styles.heading}>{heading}</Text>
        <Text style={styles.description}>{description}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{stage}</Text>
        </View>
      </View>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
    },
    heading: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    description: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textMuted,
      textAlign: 'center',
    },
    badge: {
      backgroundColor: colors.brandLight,
      borderRadius: 999,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    badgeText: {
      color: colors.brandDark,
      fontWeight: '600',
      fontSize: 13,
    },
  });
