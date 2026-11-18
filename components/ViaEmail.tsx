/**
 * דיווח שהתקבל במייל (lib/mailReport.ts): רק הטקסט שהמשתמש כתב בתשובה (`splitMailReply`);
 * שאר ההתכתבות (המייל המצוטט) מקופלת, ונפתחת בלחיצה. אחרי `archiveDays` ימים
 * (הגדרה במסך "דיווח במייל") הכול עובר ל"ארכיון" — קבוצה מקופלת.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { FoldSection } from './FoldSection';
import { FoldChevron } from './Chevrons';
import { Pressable } from './Pressable';
import { DEFAULT_MAIL_SETTINGS, loadMailSettings, mailTextArchived, splitMailReply } from '../lib/mailReport';
import { isoDate } from '../lib/dates';
import { formatISODate } from '../lib/time';
import { useThemedStyles } from '../theme/useThemedStyles';
import { cardShadow, radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

export function ViaEmail({ via }: { via: { text: string; receivedAt: number } }) {
  const styles = useThemedStyles(makeStyles);
  const [days, setDays] = useState(DEFAULT_MAIL_SETTINGS.archiveDays);
  useEffect(() => {
    void loadMailSettings().then((s) => setDays(s.archiveDays));
  }, []);
  const when = formatISODate(isoDate(new Date(via.receivedAt)));
  const [threadOpen, setThreadOpen] = useState(false);
  const { reply, quoted } = splitMailReply(via.text ?? '');
  const body = (
    <>
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
    </>
  );
  if (mailTextArchived(via.receivedAt, days)) {
    return (
      <FoldSection title={`המייל שהתקבל ב־${when} (ארכיון)`}>
        {body}
      </FoldSection>
    );
  }
  return (
    <View style={styles.card}>
      <Text style={styles.title}>✉ התקבל במייל · {when}</Text>
      {body}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs, ...cardShadow },
    title: { fontSize: 14, fontWeight: '800', color: colors.brandDark, textAlign: TEXT_RIGHT },
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
