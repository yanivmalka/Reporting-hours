/**
 * חגים וחופשות: אילו ימים מיוחדים מבטלים מפגשים אוטומטית (ארבעה מתגים).
 * בהמשך — גם לוח החופשות המרכזי.
 */
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Icon } from '../components/Icon';
import { Pressable } from '../components/Pressable';
import { Screen } from '../components/Screen';
import { useToast } from '../components/Toast';
import { REST_DAY_KIND_LABELS, type RestDayKind } from '../lib/holidays';
import { useHolidaySettings } from '../lib/sessions';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

/** סוגי הימים המיוחדים בהגדרות, עם פירוט. */
const HOLIDAY_OPTIONS: { kind: RestDayKind; detail: string }[] = [
  {
    kind: 'yomTov',
    detail: 'ראש השנה, יום הכיפורים, סוכות, שמחת תורה, פסח, שביעי של פסח, שבועות, יום העצמאות.',
  },
  {
    kind: 'eve',
    detail: 'ערב ראש השנה, ערב יום הכיפורים, ערב סוכות, הושענא רבה, ערב פסח, ערב שביעי של פסח, ערב שבועות.',
  },
  { kind: 'cholHamoed', detail: 'חול המועד סוכות וחול המועד פסח.' },
  { kind: 'tishaBav', detail: 'ט׳ באב (נדחה ליום ראשון כשחל בשבת).' },
];

export default function HolidaysScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { showToast } = useToast();
  const [holidays, setHoliday] = useHolidaySettings();
  return (
    <Screen>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>לו״ז — ביטול אוטומטי של מפגשים</Text>
        <Text style={styles.note}>
          מפגשי קורסים שחלים בימים המסומנים כאן מסומנים בלו״ז כ"בוטל אוטומטית": הם לא נכללים
          בפוטנציאל ולא מופיעים כדיווח חסר. חל גם על קורסים קיימים, ומפגש בודד אפשר להחזיר מהלו״ז.
        </Text>
        <View style={styles.checkGroup}>
          {HOLIDAY_OPTIONS.map(({ kind, detail }, i) => {
            const on = holidays[kind];
            return (
              <Pressable
                key={kind}
                onPress={() => {
                  setHoliday(kind, !on);
                  showToast(on ? `${REST_DAY_KIND_LABELS[kind]} — ללא ביטול אוטומטי` : `מפגשים ב${REST_DAY_KIND_LABELS[kind]} סומנו כבוטלו`);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={({ pressed }) => [styles.checkRow, i > 0 && styles.checkRowDivider, pressed && { opacity: 0.85 }]}
              >
                <Icon
                  name={on ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={26}
                  color={on ? colors.brand : colors.textMuted}
                />
                <View style={styles.checkTexts}>
                  <Text style={styles.checkTitle}>{REST_DAY_KIND_LABELS[kind]}</Text>
                  <Text style={styles.note}>{detail}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>לוח חופשות</Text>
        <Text style={styles.note}>בקרוב: לוח החופשות המרכזי של המוסדות.</Text>
      </View>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    checkGroup: {
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.md,
    },
    checkRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    checkTexts: { flex: 1, gap: 4 },
    checkTitle: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    section: { gap: spacing.sm },
    sectionLabel: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    note: { fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: TEXT_RIGHT },
  });
