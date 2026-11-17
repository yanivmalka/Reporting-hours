import { useState } from 'react';
import { useRouter } from 'expo-router';
import { EnterChevron } from '../components/Chevrons';
import { Linking, StyleSheet, View } from 'react-native';
import { DateText } from '../components/DateText';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { DateField } from '../components/DatePicker';
import { Pressable } from '../components/Pressable';
import { Screen } from '../components/Screen';
import { todayISO } from '../lib/time';
import { loadWorkplaces, setTaxCoordination, taxStatus, type Workplace } from '../lib/workplaces';
import { deleteTaxFile, markTaxSent, pickAndUploadTaxFile, TAX_FILE_ERROR, taxFileUrl, taxMailto } from '../lib/taxFiles';
import { authUser } from '../lib/sync';
import { Icon } from '../components/Icon';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useTheme } from '../theme/ThemeContext';
import { TEXT_RIGHT } from '../theme/align';
import { useI18n } from '../lib/i18n';
import { useThemedStyles } from '../theme/useThemedStyles';
import { cardShadow, radius, spacing, type AppColors } from '../theme/colors';
import { useScreenData } from '../components/useScreenData';

/**
 * תיאום מס לשנה לועזית: לכל מקום עבודה — טופס התיאום (טעינה, צפייה, החלפה,
 * מחיקה ושליחה במייל, lib/taxFiles.ts) והמצב: חסר → נטען → נשלח (ומתי).
 * מקום עבודה שלא נכלל — מסומן, ומופיעה תזכורת במסך הבית.
 */
export default function TaxScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { isRTL } = useI18n();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [list, setList] = useState<Workplace[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  /** מקום עבודה שפעולת קובץ שלו רצה (טעינה / צפייה / שליחה) */
  const [busy, setBusy] = useState<string | null>(null);
  const confirm = useConfirm();
  const { showToast } = useToast();
  const { colors } = useTheme();

  useScreenData(loadWorkplaces, [], setList);

  const done = list.filter((w) => w.taxCoordination?.[year]);
  const missing = list.filter((w) => !w.taxCoordination?.[year]);

  async function mark(id: string, d: string | null) {
    setList(await setTaxCoordination(id, year, d));
    setEditing(null);
  }

  async function upload(w: Workplace) {
    setBusy(w.id);
    try {
      const res = await pickAndUploadTaxFile(w, year);
      if (!res) return;
      if ('error' in res) showToast(TAX_FILE_ERROR[res.error]);
      else {
        setList(res.list);
        showToast('הטופס נטען');
      }
    } finally {
      setBusy(null);
    }
  }

  async function view(w: Workplace) {
    const file = w.taxFiles?.[year];
    if (!file) return;
    setBusy(w.id);
    try {
      const url = await taxFileUrl(file);
      if (url) await Linking.openURL(url);
      else showToast('לא ניתן לפתוח את הקובץ כרגע.');
    } finally {
      setBusy(null);
    }
  }

  async function send(w: Workplace) {
    const file = w.taxFiles?.[year];
    if (!file) return;
    if (!w.payrollEmail) {
      showToast('לא הוגדר מייל מחלקת שכר — בעריכת מקום העבודה, "דוחות שכר".');
      return;
    }
    setBusy(w.id);
    try {
      const url = await taxFileUrl(file);
      if (!url) {
        showToast('לא ניתן להכין קישור לקובץ כרגע.');
        return;
      }
      await Linking.openURL(taxMailto(w, year, url, authUser()?.name));
      setList(await markTaxSent(w, year));
      showToast('נפתחה טיוטת מייל · סומן "נשלח"');
    } finally {
      setBusy(null);
    }
  }

  function remove(w: Workplace) {
    confirm({
      title: 'מחיקת טופס תיאום המס',
      message: `הקובץ של ${year} יימחק. סימון "נשלח" (אם יש) נשאר.`,
      onConfirm: async () => {
        setList(await deleteTaxFile(w, year));
        showToast('הטופס נמחק');
      },
    });
  }

  const Row = ({ w }: { w: Workplace }) => {
    const sent = w.taxCoordination?.[year];
    const file = w.taxFiles?.[year];
    const status = taxStatus(w, year);
    const working = busy === w.id;
    return (
      <View style={[styles.row, !sent && styles.rowMissing]}>
        <Pressable
          onPress={() => router.push({ pathname: '/workplace', params: { id: w.id } })}
          accessibilityRole="button"
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 4 }, pressed && { opacity: 0.7 }]}
        >
          <Text style={[styles.name, { flex: 1 }]}>{w.name}</Text>
          <EnterChevron />
        </Pressable>
        <Text style={[styles.meta, status === 'sent' ? styles.ok : styles.warn]}>
          {sent ? (
            <>✓ נכלל בתיאום — נשלח <DateText iso={sent} /></>
          ) : status === 'loaded' ? (
            'הטופס נטען — טרם נשלח'
          ) : (
            `לא נכלל בתיאום ${year}`
          )}
        </Text>
        {file ? (
          <View style={styles.fileRow}>
            <Icon name={file.contentType === 'application/pdf' ? 'file-pdf-box' : 'file-image-outline'} size={20} color={colors.textMuted} />
            <Text style={styles.fileName} numberOfLines={1}>
              {file.name}
            </Text>
          </View>
        ) : null}
        {file ? (
          <View style={styles.fileActions}>
            <Button label="צפייה" variant="secondary" onPress={() => view(w)} disabled={working} />
            <Button label={sent ? 'שליחה שוב במייל' : 'שליחה במייל'} onPress={() => send(w)} loading={working} />
            <View style={styles.linksRow}>
              <Pressable onPress={() => upload(w)} accessibilityRole="link" hitSlop={8} disabled={working}>
                <Text style={styles.link}>החלפת הקובץ</Text>
              </Pressable>
              <Pressable onPress={() => remove(w)} accessibilityRole="link" hitSlop={8} disabled={working}>
                <Text style={styles.deleteLink}>מחיקת הקובץ</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Button label="טעינת טופס (PDF או תמונה)" variant="secondary" onPress={() => upload(w)} loading={working} />
        )}
        {editing === w.id ? (
          <View style={styles.edit}>
            <DateField value={date} onChange={setDate} />
            <Button label="שמירה" onPress={() => mark(w.id, date)} />
            {sent ? <Button label="ביטול הסימון" variant="danger" onPress={() => mark(w.id, null)} /> : null}
            <Button label="סגירה" variant="secondary" onPress={() => setEditing(null)} />
          </View>
        ) : (
          <Pressable
            onPress={() => {
              setDate(sent ?? todayISO());
              setEditing(w.id);
            }}
            accessibilityRole="link"
            hitSlop={8}
          >
            <Text style={styles.link}>{sent ? 'עריכת תאריך השליחה' : 'סימון ידני — נשלח תיאום'}</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <Screen>
      <View style={styles.intro}>
        <Text style={styles.title}>תיאום מס</Text>
        <Text style={styles.subtitle}>
          לכל מקום עבודה ושנה: טוענים את טופס התיאום, צופים בו ושולחים במייל למחלקת השכר. מקום עבודה
          שלא נכלל בתיאום השנה — תזכורת במסך הבית.
        </Text>
      </View>

      <View style={styles.yearRow}>
        <Pressable onPress={() => setYear(String(Number(year) - 1))} style={styles.nav}>
          <Text style={styles.navText}>{isRTL ? '→' : '←'}</Text>
        </Pressable>
        <Text style={styles.year}>{year}</Text>
        <Pressable onPress={() => setYear(String(Number(year) + 1))} style={styles.nav}>
          <Text style={styles.navText}>{isRTL ? '←' : '→'}</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>
        טרם נכללו ({missing.length})
      </Text>
      {missing.length === 0 ? <Text style={styles.meta}>כל מקומות העבודה נכללו 🎉</Text> : null}
      {missing.map((w) => (
        <Row key={w.id} w={w} />
      ))}

      {done.length > 0 ? <Text style={styles.section}>נכללו ({done.length})</Text> : null}
      {done.map((w) => (
        <Row key={w.id} w={w} />
      ))}
      {confirm.dialog}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    intro: { gap: spacing.sm },
    title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    subtitle: { fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: TEXT_RIGHT },
    yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
    nav: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
    navText: { fontSize: 22, fontWeight: '700', color: colors.brand },
    year: { fontSize: 22, fontWeight: '800', color: colors.text },
    section: { fontSize: 15, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT, marginTop: spacing.sm },
    row: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
      ...cardShadow,
    },
    rowMissing: { borderColor: colors.warning },
    name: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    meta: { fontSize: 13, color: colors.textMuted, textAlign: TEXT_RIGHT },
    ok: { color: colors.success, fontWeight: '700' },
    warn: { color: colors.warning, fontWeight: '700' },
    edit: { gap: spacing.sm },
    fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    fileName: { flex: 1, fontSize: 14, color: colors.text, textAlign: TEXT_RIGHT },
    fileActions: { gap: spacing.sm },
    linksRow: { flexDirection: 'row', gap: spacing.lg },
    link: { fontSize: 14, fontWeight: '700', color: colors.brandDark, textDecorationLine: 'underline', textAlign: TEXT_RIGHT },
    deleteLink: { fontSize: 14, fontWeight: '700', color: colors.dangerText, textAlign: TEXT_RIGHT },
  });
