import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { FormField } from '../components/FormField';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { useToast } from '../components/Toast';
import { EMPTY_PROFILE, loadProfile, saveProfile, signatureLines, type Profile } from '../lib/profile';
import { TEXT_RIGHT } from '../theme/align';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

/** פרטים אישיים — לחתימה ולזיהוי בדוחות ובמיילים לשכר. */
export default function ProfileScreen() {
  const styles = useThemedStyles(makeStyles);
  const { showToast } = useToast();
  const [p, setP] = useState<Profile>(EMPTY_PROFILE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadProfile().then(setP);
  }, []);

  const set = (k: keyof Profile) => (v: string) => setP((prev) => ({ ...prev, [k]: v }));

  async function save() {
    setSaving(true);
    await saveProfile({
      fullName: p.fullName.trim(),
      idNumber: p.idNumber.replace(/\D/g, ''),
      phone: p.phone.trim(),
      email: p.email.trim(),
      address: p.address.trim(),
    });
    setSaving(false);
    showToast('הפרטים נשמרו');
  }

  const signature = signatureLines(p, '1234');

  return (
    <Screen keyboardFooter>
      <View style={styles.intro}>
        <Text style={styles.title}>פרטים אישיים</Text>
        <Text style={styles.subtitle}>
          מופיעים בחתימת המיילים ובדוחות לשכר. נשמרים במכשיר בלבד.
        </Text>
      </View>

      <FormField label="שם מלא">
        <TextField value={p.fullName} onChangeText={set('fullName')} placeholder="ישראל ישראלי" />
      </FormField>
      <FormField label="תעודת זהות">
        <TextField value={p.idNumber} onChangeText={set('idNumber')} numeric />
      </FormField>
      <FormField label="טלפון">
        <TextField value={p.phone} onChangeText={set('phone')} numeric />
      </FormField>
      <FormField label="מייל">
        <TextField value={p.email} onChangeText={set('email')} email />
      </FormField>
      <FormField label="כתובת">
        <TextField value={p.address} onChangeText={set('address')} />
      </FormField>

      {signature.length ? (
        <View style={styles.preview}>
          <Text style={styles.previewLabel}>כך תיראה החתימה במייל (עם מספר העובד של המקום):</Text>
          {['בברכה,', ...signature].map((l) => (
            <Text key={l} style={styles.previewLine}>
              {l}
            </Text>
          ))}
        </View>
      ) : null}

      <Button label="שמירה" onPress={save} loading={saving} />
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    intro: { gap: spacing.sm },
    title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    subtitle: { fontSize: 14, color: colors.textMuted, textAlign: TEXT_RIGHT },
    preview: {
      backgroundColor: colors.brandLight,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: 2,
    },
    previewLabel: { fontSize: 12, color: colors.brandDark, textAlign: TEXT_RIGHT, marginBottom: 4 },
    previewLine: { fontSize: 14, color: colors.brandDark, textAlign: TEXT_RIGHT },
  });
