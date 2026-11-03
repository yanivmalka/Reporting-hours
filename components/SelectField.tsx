/**
 * שדה בחירה מתוך רשימה (dropdown): מציג את הערך הנבחר עם חץ ▾, ולחיצה
 * פותחת חלון עם כל האפשרויות. בלי תלות חיצונית — זהה ב־web ובאנדרואיד.
 */
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { useState } from 'react';
import { radius, spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

export type SelectOption<T extends string | null> = {
  value: T;
  label: string;
  /** שורת משנה אופציונלית ברשימה */
  sub?: string;
};

type SelectFieldProps<T extends string | null> = {
  /** תווית קצרה שמוצגת בתוך השדה, לפני הערך ("מקום עבודה:") */
  label?: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** כותרת חלון הבחירה */
  title?: string;
  /** הדגשה כשנבחר ערך שאינו ברירת המחדל (למשל סינון פעיל) */
  active?: boolean;
};

export function SelectField<T extends string | null>({
  label,
  value,
  options,
  onChange,
  title,
  active,
}: SelectFieldProps<T>) {
  const styles = useStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.field, active && styles.fieldActive]}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? ''} ${current?.label ?? ''}`}
      >
        <Text style={[styles.text, active && styles.textActive]} numberOfLines={1}>
          {label ? <Text style={styles.label}>{label} </Text> : null}
          {current?.label ?? '—'}
        </Text>
        <Text style={[styles.chevron, active && styles.textActive]}>▾</Text>
      </Pressable>

      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            <ScrollView style={styles.list}>
              {options.map((o) => {
                const selected = o.value === value;
                return (
                  <Pressable
                    key={String(o.value)}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {o.label}
                    </Text>
                    {o.sub ? (
                      <Text style={[styles.optionSub, selected && styles.optionTextSelected]}>
                        {o.sub}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
    field: {
      minHeight: 48,
      flexDirection: layout.rowStart,
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
    },
    fieldActive: {
      borderColor: c.brand,
      backgroundColor: c.brandLight,
    },
    text: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
      textAlign: layout.textStart,
    },
    textActive: {
      color: c.brandDark,
    },
    label: {
      fontWeight: '400',
      color: c.textMuted,
    },
    chevron: {
      fontSize: 16,
      fontWeight: '800',
      color: c.textMuted,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    sheet: {
      width: '100%',
      maxWidth: 420,
      maxHeight: '80%',
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
    },
    title: {
      fontSize: 16,
      fontWeight: '800',
      color: c.text,
      textAlign: layout.textStart,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    list: {
      flexGrow: 0,
    },
    option: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      gap: 2,
    },
    optionSelected: {
      backgroundColor: c.brand,
    },
    optionText: {
      fontSize: 15,
      color: c.text,
      textAlign: layout.textStart,
    },
    optionSub: {
      fontSize: 12,
      color: c.textMuted,
      textAlign: layout.textStart,
    },
    optionTextSelected: {
      color: c.textOnBrand,
    },
  });
