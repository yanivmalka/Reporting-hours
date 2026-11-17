/**
 * דיווח במייל (lib/mailReport.ts, docs/fixes-spec-2026-11-17.md סעיף 8): הפעלה, שעת השליחה
 * וכמה ימים טקסט המייל מוצג בדיווח לפני שעובר לארכיון. רק לבעלים המחוברים.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Checkbox } from '../components/Checkbox';
import { FormField } from '../components/FormField';
import { TextField } from '../components/TextField';
import { TimeInput } from '../components/TimeInput';
import { Screen } from '../components/Screen';
import { RequireAccess } from '../components/Access';
import { useCloudSync } from '../components/CloudSync';
import { useToast } from '../components/Toast';
import { LoadingScreen } from '../components/LoadingScreen';
import { MAILBOX, loadMailSettings, pushMailPlan, saveMailSettings, type MailReportSettings } from '../lib/mailReport';
import { useThemedStyles } from '../theme/useThemedStyles';
import { cardShadow, radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

function MailReportScreen() {
  const styles = useThemedStyles(makeStyles);
  const { user } = useCloudSync();
  const { showToast } = useToast();
  const [s, setS] = useState<MailReportSettings | null>(null);
  const [days, setDays] = useState('30');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadMailSettings().then((x) => {
      setS(x);
      setDays(String(x.archiveDays));
    });
  }, []);

  if (!s) return <LoadingScreen />;

  async function save(next: MailReportSettings) {
    setBusy(true);
    try {
      await saveMailSettings(next);
      setS(next);
      await pushMailPlan().catch(() => {});
      showToast('ההגדרות נשמרו');
    } finally {
      setBusy(false);
    }
  }

  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(s.sendTime);
  const archiveDays = Math.max(1, Math.min(365, Number(days) || 30));

  return (
    <Screen>
      <View style={styles.card}>
        <Text style={styles.title}>דיווח במייל</Text>
        <Text style={styles.body}>
          ביום שבו מפגש התקיים ולא דווח, נשלח מייל עם פרטי המפגש. עונים במייל, והדיווח נרשם באפליקציה
          בפתיחה הבאה. מקבלים מייל אישור.
        </Text>
        <Text style={styles.body}>
          המייל נשלח מ־{MAILBOX} אל {user?.email ?? 'כתובת חשבון Google שלך'}. מענה מתקבל רק מהכתובת הזו, עם
          הקוד של ההודעה (פעם אחת, עד 7 ימים).
        </Text>
      </View>

      {!user ? (
        <Text style={styles.warn}>כדי להפעיל צריך להתחבר עם חשבון Google (תפריט ☰).</Text>
      ) : null}

      <Checkbox
        checked={s.enabled}
        disabled={!user || busy}
        onChange={(enabled) => void save({ ...s, enabled })}
        label="שליחת מייל על מפגש שלא דווח"
        hint="מייל אחד לכל מפגש, באותו יום"
      />

      <FormField label="שעת השליחה">
        <TimeInput value={s.sendTime} onChange={(sendTime) => setS({ ...s, sendTime })} label="שעת השליחה" invalid={!validTime} />
      </FormField>

      <FormField label="אחרי כמה ימים טקסט המייל עובר לארכיון בדיווח">
        <TextField value={days} onChangeText={setDays} numeric />
      </FormField>

      <Button
        label="שמירה"
        loading={busy}
        disabled={!validTime}
        onPress={() => save({ ...s, archiveDays })}
      />

      <View style={styles.card}>
        <Text style={styles.subtitle}>איך עונים</Text>
        <Text style={styles.body}>בשורה הראשונה של התשובה:</Text>
        <Text style={styles.example}>כן — התקיים לפי התכנון</Text>
        <Text style={styles.example}>8:30-11:45 הפסקה 15 — שעות בפועל</Text>
        <Text style={styles.example}>בוטל מחלה — לא התקיים, עם סיבה</Text>
      </View>
    </Screen>
  );
}

export default function MailReportRoute() {
  return (
    <RequireAccess need="owner">
      <MailReportScreen />
    </RequireAccess>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs, ...cardShadow },
    title: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    subtitle: { fontSize: 15, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    body: { fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: TEXT_RIGHT },
    example: { fontSize: 14, color: colors.text, textAlign: TEXT_RIGHT },
    warn: { fontSize: 14, color: colors.warning, fontWeight: '700', textAlign: TEXT_RIGHT },
  });
