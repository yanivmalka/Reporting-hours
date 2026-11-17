/**
 * דיווח שהתקבל במייל (lib/mailReport.ts): הטקסט שנכתב בתשובה. אחרי `archiveDays` ימים
 * (הגדרה במסך "דיווח במייל") הוא עובר ל"ארכיון" — קבוצה מקופלת.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { FoldSection } from './FoldSection';
import { DEFAULT_MAIL_SETTINGS, loadMailSettings, mailTextArchived } from '../lib/mailReport';
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
  const body = <Text style={styles.text}>{via.text || '—'}</Text>;
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
  });
