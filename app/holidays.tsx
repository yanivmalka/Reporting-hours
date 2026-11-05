/**
 * חגים וחופשות: אילו ימים מיוחדים מבטלים מפגשים אוטומטית (ארבעה מתגים), ורשימת
 * סיבות הביטול הגלובלית (הוספה, שינוי שם, מחיקה, סדר). כלל התשלום לכל סיבה —
 * בדף עריכת מקום העבודה, בקבוצה "ביטולים". ולוח החופשות המרכזי (components/Vacations.tsx).
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Icon } from '../components/Icon';
import { Pressable } from '../components/Pressable';
import { VacationBoard } from '../components/Vacations';
import { Screen } from '../components/Screen';
import { useToast } from '../components/Toast';
import { REST_DAY_KIND_LABELS, type RestDayKind } from '../lib/holidays';
import { useHolidaySettings } from '../lib/sessions';
import { makeReasonId, saveCancelReasons, useCancelReasons } from '../lib/cancelReasons';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
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
  const reasons = useCancelReasons();
  const [newReason, setNewReason] = useState('');
  const save = (list: { id: string; name: string }[]) => void saveCancelReasons(list);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= reasons.length) return;
    const next = [...reasons];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };
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
        <Text style={styles.note}>
          מפגשים שחלים בחופשה מתבטלים: הם לא נכללים בפוטנציאל ובצפי ולא מופיעים כדיווח חסר.
          חופשה כללית חלה על כל המוסדות, וכל מקום עבודה או קורס יכול להתעלם ממנה בדף שלו.
        </Text>
        <VacationBoard />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>סיבות ביטול</Text>
        <Text style={styles.note}>
          מוצגות לבחירה מהירה בביטול מפגש. אם מוסד משלם על ביטול בגלל סיבה מסוימת — מגדירים זאת
          בעריכת מקום העבודה, בקבוצה "ביטולים". סיבה שנמחקה נשמרת בביטולים ישנים.
        </Text>
        <View style={styles.checkGroup}>
          {reasons.map((r, i) => (
            <View key={r.id} style={[styles.reasonRow, i > 0 && styles.checkRowDivider]}>
              <View style={{ flex: 1 }}>
                <TextField
                  value={r.name}
                  onChangeText={(t) => save(reasons.map((x) => (x.id === r.id ? { ...x, name: t } : x)))}
                />
              </View>
              <Pressable onPress={() => move(i, -1)} disabled={i === 0} hitSlop={6} accessibilityLabel="למעלה">
                <Icon name="arrow-up" size={20} color={i === 0 ? colors.border : colors.textMuted} />
              </Pressable>
              <Pressable
                onPress={() => move(i, 1)}
                disabled={i === reasons.length - 1}
                hitSlop={6}
                accessibilityLabel="למטה"
              >
                <Icon name="arrow-down" size={20} color={i === reasons.length - 1 ? colors.border : colors.textMuted} />
              </Pressable>
              <Pressable
                onPress={() => {
                  save(reasons.filter((x) => x.id !== r.id));
                  showToast(`הסיבה "${r.name}" נמחקה`);
                }}
                hitSlop={6}
                accessibilityLabel={`מחיקת ${r.name}`}
              >
                <Icon name="trash-can-outline" size={20} color={colors.dangerText} />
              </Pressable>
            </View>
          ))}
          <View style={[styles.reasonRow, reasons.length > 0 && styles.checkRowDivider]}>
            <View style={{ flex: 1 }}>
              <TextField value={newReason} onChangeText={setNewReason} placeholder="סיבה חדשה" />
            </View>
            <Button
              label="הוספה"
              variant="secondary"
              disabled={!newReason.trim() || reasons.some((r) => r.name === newReason.trim())}
              onPress={() => {
                save([...reasons, { id: makeReasonId(), name: newReason.trim() }]);
                setNewReason('');
              }}
            />
          </View>
        </View>
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
    reasonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
    sectionLabel: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    note: { fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: TEXT_RIGHT },
  });
