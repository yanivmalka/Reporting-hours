/**
 * דיווח שהתקבל במייל (lib/mailReport.ts) — שורה מקופלת אחת "✉ התקבל במייל · מועד" בכרטיס
 * הקישורים של תצוגת הדיווח. בפתיחה: הטקסט שהמשתמש כתב (`splitMailReply`), ושאר ההתכתבות
 * מקופלת בנפרד. אחרי `archiveDays` ימים (הגדרה במסך "דיווח במייל") — עם "(ארכיון)".
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { FoldChevron } from './Chevrons';
import { Pressable } from './Pressable';
import { DEFAULT_MAIL_SETTINGS, loadMailSettings, mailReceivedLabel, mailTextArchived, splitMailReply } from '../lib/mailReport';
import { useThemedStyles } from '../theme/useThemedStyles';
import { spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

export function ViaEmail({ via }: { via: { text: string; receivedAt: number } }) {
  const styles = useThemedStyles(makeStyles);
  const [days, setDays] = useState(DEFAULT_MAIL_SETTINGS.archiveDays);
  useEffect(() => {
    void loadMailSettings().then((s) => setDays(s.archiveDays));
  }, []);
  const when = mailReceivedLabel(via.receivedAt);
  const [open, setOpen] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  const { reply, quoted } = splitMailReply(via.text ?? '');
  const archived = mailTextArchived(via.receivedAt, days);
  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <Text style={styles.title}>
          ✉ התקבל במייל · {when}
          {archived ? ' (ארכיון)' : ''}
        </Text>
        <FoldChevron open={open} size={18} />
      </Pressable>
      {open ? (
        <View style={styles.body}>
          <Text style={styles.text}>{reply || '—'}</Text>
          {quoted ? (
            <>
              <Pressable
                onPress={() => setThreadOpen((o) => !o)}
                accessibilityRole="button"
                accessibilityState={{ expanded: threadOpen }}
                hitSlop={8}
                style={styles.threadToggle}
              >
                <Text style={styles.threadToggleText}>{threadOpen ? 'הסתרת ההתכתבות' : 'הצגת ההתכתבות המלאה'}</Text>
                <FoldChevron open={threadOpen} size={18} />
              </Pressable>
              {threadOpen ? <Text style={styles.quoted}>{quoted}</Text> : null}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 44 },
    pressed: { opacity: 0.6 },
    body: { gap: spacing.xs, paddingBottom: spacing.sm },
    title: { flex: 1, fontSize: 14, color: colors.textMuted, textAlign: TEXT_RIGHT },
    text: { fontSize: 14, lineHeight: 21, color: colors.text, textAlign: TEXT_RIGHT },
    threadToggle: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingTop: spacing.xs },
    threadToggleText: { fontSize: 13, fontWeight: '700', color: colors.brandDark },
    quoted: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textMuted,
      textAlign: TEXT_RIGHT,
      borderStartWidth: 2,
      borderStartColor: colors.border,
      paddingStart: spacing.sm,
    },
  });
