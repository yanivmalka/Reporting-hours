/**
 * שיתוף והרשאות (docs/sharing-spec.md): הבעלים מוסיפים כתובת Gmail ורמה
 * (צפייה / מדווח / מלאה), משנים רמה או מסירים. ההרשאה פעילה מיד; "שליחת
 * הודעה" פותח את תפריט השיתוף עם הסבר איך להיכנס.
 */
import { useCallback, useEffect, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { FormField } from '../components/FormField';
import { TextField } from '../components/TextField';
import { SegmentedControl } from '../components/SegmentedControl';
import { Screen } from '../components/Screen';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { RequireAccess } from '../components/Access';
import { useCloudSync } from '../components/CloudSync';
import {
  ROLE_HINTS,
  ROLE_LABELS,
  inviteMessage,
  isValidEmail,
  listGrants,
  removeGrant,
  saveGrant,
  type Grant,
  type ShareRole,
} from '../lib/sharing';
import { formatISODate } from '../lib/time';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

const ROLE_OPTIONS: { value: ShareRole; label: string }[] = [
  { value: 'view', label: ROLE_LABELS.view },
  { value: 'report', label: ROLE_LABELS.report },
  { value: 'full', label: ROLE_LABELS.full },
];

const isoOf = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function SharingScreenInner() {
  const styles = useThemedStyles(makeStyles);
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { user, ready } = useCloudSync();
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareRole>('view');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setGrants(await listGrants());
      setError(null);
    } catch {
      setError('לא ניתן לטעון את ההרשאות. בדקו את החיבור לרשת.');
    }
  }, []);

  useEffect(() => {
    if (user) void refresh();
  }, [user, refresh]);

  async function sendInvite(to: string, r: ShareRole) {
    try {
      await Share.share({ title: 'דיווח שעות — שיתוף', message: inviteMessage(to, r) });
    } catch {
      // המשתמש סגר את תפריט השיתוף
    }
  }

  async function add() {
    const e = email.trim().toLowerCase();
    if (!isValidEmail(e)) {
      setEmailError('כתובת מייל לא תקינה');
      return;
    }
    if (user?.email && user.email.toLowerCase() === e) {
      setEmailError('זו הכתובת שלך');
      return;
    }
    if (grants?.some((g) => g.email === e)) {
      setEmailError('כבר יש הרשאה לכתובת הזו — אפשר לשנות את הרמה ברשימה');
      return;
    }
    setEmailError(undefined);
    setBusy(true);
    try {
      await saveGrant(e, role);
      setEmail('');
      await refresh();
      showToast('ההרשאה נוספה');
      void sendInvite(e, role);
    } catch {
      showToast('ההוספה נכשלה. נסו שוב.');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(g: Grant, r: ShareRole) {
    if (r === g.role) return;
    try {
      await saveGrant(g.email, r, g.created);
      await refresh();
    } catch {
      showToast('השינוי נכשל. נסו שוב.');
    }
  }

  if (!ready) return <Screen>{null}</Screen>;
  if (!user) {
    return (
      <Screen>
        <Text style={styles.body}>
          כדי לשתף את הנתונים צריך להתחבר עם חשבון Google (תפריט ☰ ← "הגדרות ותצוגה" ← "חשבון וסנכרון").
        </Text>
      </Screen>
    );
  }

  return (
    <Screen keyboardFooter>
      <Text style={styles.body}>
        אפשר לתת לבן משפחה גישה לנתונים שלך עם חשבון Google שלו. ההרשאה חלה על כל החשבון ונכנסת לתוקף מיד.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>הוספת מורשה</Text>
        <FormField label="כתובת Gmail" error={emailError}>
          <TextField value={email} onChangeText={setEmail} email placeholder="name@gmail.com" invalid={!!emailError} />
        </FormField>
        <FormField label="רמת הרשאה" hint={ROLE_HINTS[role]}>
          <SegmentedControl options={ROLE_OPTIONS} value={role} onChange={setRole} />
        </FormField>
        <Button label="הוספה ושליחת הודעה" loading={busy} onPress={() => void add()} />
      </View>

      <Text style={styles.section}>מורשים</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {grants == null && !error ? <Text style={styles.muted}>טוען…</Text> : null}
      {grants?.length === 0 ? <Text style={styles.muted}>עדיין לא שיתפת עם אף אחד.</Text> : null}
      {grants?.map((g) => (
        <View key={g.email} style={styles.card}>
          <Text style={styles.cardTitle}>{g.granteeName || g.email}</Text>
          {g.granteeName ? <Text style={styles.muted}>{g.email}</Text> : null}
          <Text style={styles.muted}>
            {g.seen ? `נכנס/ה לאחרונה ${formatISODate(isoOf(g.seen))}` : 'עדיין לא נכנס/ה'}
          </Text>
          <SegmentedControl options={ROLE_OPTIONS} value={g.role} onChange={(r) => void changeRole(g, r)} />
          <Text style={styles.muted}>{ROLE_HINTS[g.role]}</Text>
          <Button label="שליחת הודעה" variant="secondary" onPress={() => void sendInvite(g.email, g.role)} />
          <Button
            label="הסרת ההרשאה"
            variant="dangerLink"
            icon="account-remove-outline"
            onPress={() =>
              confirm({
                title: 'להסיר את ההרשאה?',
                message: `${g.granteeName || g.email} לא יוכל/תוכל עוד לראות את הנתונים שלך. אפשר להוסיף שוב בכל עת.`,
                confirmLabel: 'הסרת ההרשאה',
                onConfirm: async () => {
                  await removeGrant(g.email);
                  await refresh();
                },
              })
            }
          />
        </View>
      ))}
      {confirm.dialog}
    </Screen>
  );
}

/** רק הבעלים, כשהם בנתונים של עצמם. */
export default function SharingScreen() {
  return (
    <RequireAccess need="owner">
      <SharingScreenInner />
    </RequireAccess>
  );
}

const makeStyles = (c: AppColors) =>
  StyleSheet.create({
    body: { fontSize: 15, lineHeight: 22, color: c.text, textAlign: TEXT_RIGHT },
    section: { fontSize: 16, fontWeight: '700', color: c.text, textAlign: TEXT_RIGHT, marginTop: spacing.sm },
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: c.text, textAlign: TEXT_RIGHT },
    muted: { fontSize: 13, color: c.textMuted, textAlign: TEXT_RIGHT, lineHeight: 19 },
    error: { fontSize: 14, color: c.danger, textAlign: TEXT_RIGHT },
  });
