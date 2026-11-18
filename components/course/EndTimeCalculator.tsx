/**
 * מחשבון שעת סיום (ליד שעת הסיום בטופס הקורס): משעת ההתחלה, מספר שעות (אקדמיות — 45 דק׳,
 * או רגילות) והפסקה — מחשב את שעת הסיום, ו"החלה" מעדכנת את הטופס.
 */
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '../Text';
import { Button } from '../Button';
import { Dialog } from '../Dialog';
import { Pressable } from '../Pressable';
import { Icon } from '../Icon';
import { SegmentedControl } from '../SegmentedControl';
import { WheelNumber } from '../WheelNumber';
import { computeEnd } from '../../lib/academic';
import { parseTime } from '../../lib/time';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { spacing, type AppColors } from '../../theme/colors';
import { TEXT_RIGHT } from '../../theme/align';

export function EndTimeCalculatorButton({
  start,
  breakMinutes,
  onApply,
}: {
  start: string;
  breakMinutes: number;
  onApply: (end: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState('4');
  const [unit, setUnit] = useState<'academic' | 'regular'>('academic');
  const end = computeEnd(start, Number(hours) || 0, unit, breakMinutes);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="מחשבון שעת סיום"
        hitSlop={8}
        style={styles.trigger}
      >
        <Icon name="calculator-variant-outline" size={18} color={colors.brand} />
        <Text style={styles.triggerText}>מחשבון</Text>
      </Pressable>
      {open ? (
        <Dialog
          title="חישוב שעת סיום"
          onClose={() => setOpen(false)}
          maxWidth={420}
          head={
            <Text style={styles.muted}>
              {parseTime(start) == null ? 'יש להזין קודם שעת התחלה.' : `התחלה ${start} · הפסקה ${breakMinutes} דק׳`}
            </Text>
          }
          actions={[
            <Button
              key="apply"
              label="החלה"
              disabled={!end}
              onPress={() => {
                if (end) onApply(end);
                setOpen(false);
              }}
            />,
            <Button key="close" label="סגירה" variant="secondary" onPress={() => setOpen(false)} />,
          ]}
        >
          <SegmentedControl<'academic' | 'regular'>
            options={[
              { value: 'academic', label: 'שעות אקדמיות (45 דק׳)' },
              { value: 'regular', label: 'שעות רגילות' },
            ]}
            value={unit}
            onChange={setUnit}
          />
          <Text style={styles.label}>מספר שעות</Text>
          <WheelNumber value={hours} onChange={setHours} label="מספר שעות" unit="שע׳" min={1} max={12} />
          <Text style={styles.result}>{end ? `שעת סיום: ${end}` : '—'}</Text>
        </Dialog>
      ) : null}
    </>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    trigger: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingTop: 4 },
    triggerText: { fontSize: 13, fontWeight: '700', color: colors.brand },
    muted: { fontSize: 13, color: colors.textMuted, textAlign: TEXT_RIGHT },
    label: { fontSize: 14, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    result: { fontSize: 20, fontWeight: '800', color: colors.brandDark, textAlign: 'center', paddingVertical: spacing.xs },
  });
