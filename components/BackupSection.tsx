/**
 * גיבוי ושחזור — במסך ניהול הנתונים (lib/backup.ts): סטטוס ותאריך הגיבוי
 * האחרון בשרת, "גיבוי עכשיו", ו"שחזור מגיבוי" — רשימת התאריכים נטענת רק
 * בלחיצה, ותוכן הגיבוי רק כשבוחרים תאריך.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import {
  BACKUP_RETENTION_DAYS,
  createBackup,
  lastBackup,
  listBackups,
  onBackupChange,
  restoreBackup,
  type BackupMeta,
} from '../lib/backup';
import { hebrewDate } from '../lib/hebrewDate';
import { useHydrated } from '../lib/useHydrated';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';
import { Button } from './Button';
import { useCloudSync } from './CloudSync';
import { useConfirm } from './ConfirmDialog';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { useToast } from './Toast';

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "יום ג׳ 3.11 · 14:05" */
function when(ms: number): string {
  const d = new Date(ms);
  return `יום ${WEEKDAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1} · ⁦${pad(d.getHours())}:${pad(d.getMinutes())}⁩`;
}

/** "היום" / "אתמול" / "לפני 5 ימים" */
function ago(ms: number): string {
  const a = new Date(ms);
  const b = new Date();
  const days = Math.round(
    (new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() -
      new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) /
      86_400_000,
  );
  return days <= 0 ? 'היום' : days === 1 ? 'אתמול' : `לפני ${days} ימים`;
}

const KIND_LABEL: Record<BackupMeta['kind'], string> = {
  auto: 'אוטומטי',
  manual: 'ידני',
  'before-restore': 'לפני שחזור — לביטול השחזור',
};

type Last = { state: 'loading' } | { state: 'ok'; meta: BackupMeta | null } | { state: 'error' };

export function BackupSection() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { user, ready, signIn } = useCloudSync();
  // מצב ההתחברות לא ידוע ברינדור מראש — עד ה־hydration מציגים טעינה, כמו בשרת.
  const hydrated = useHydrated();
  const confirm = useConfirm();
  const [last, setLast] = useState<Last>({ state: 'loading' });
  const [list, setList] = useState<BackupMeta[] | null>(null);
  const [listState, setListState] = useState<'closed' | 'loading' | 'open' | 'error'>('closed');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLast({ state: 'loading' });
    try {
      setLast({ state: 'ok', meta: await lastBackup() });
    } catch {
      setLast({ state: 'error' });
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  useEffect(
    () =>
      onBackupChange(() => {
        void refresh();
        setListState('closed');
        setList(null);
      }),
    [refresh],
  );

  async function backupNow() {
    setBusy(true);
    try {
      const r = await createBackup('manual');
      showToast(
        r.ok
          ? 'הגיבוי נשמר בשרת'
          : r.reason === 'empty'
            ? 'אין עדיין נתונים שלך לגיבוי (נתוני הדגמה לא מגובים)'
            : r.reason === 'signed-out'
              ? 'כדי לגבות צריך להתחבר לחשבון גוגל'
              : 'הגיבוי נכשל — בדקו את החיבור לרשת',
      );
    } finally {
      setBusy(false);
    }
  }

  async function openList() {
    if (listState === 'open') {
      setListState('closed');
      return;
    }
    setListState('loading');
    try {
      setList(await listBackups());
      setListState('open');
    } catch {
      setListState('error');
    }
  }

  function askRestore(b: BackupMeta) {
    const label = b.kind === 'before-restore' ? `המצב שלפני השחזור (${when(b.createdAt)})` : `הגיבוי מ${when(b.createdAt)}`;
    confirm({
      title: 'לשחזר מגיבוי?',
      message:
        `כל הנתונים שלך — דיווחים, מקומות עבודה, קורסים, דוחות שכר ומונים — יוחלפו ב${label}: ` +
        `${b.summary.reports} דיווחים · ${b.summary.workplaces} מקומות עבודה. ` +
        'ההחלפה נעשית בשרת ומגיעה לכל המכשירים. לפני השחזור יישמר גיבוי של המצב הנוכחי, ' +
        'כך שאפשר להתחרט ולשחזר אותו.',
      confirmLabel: 'שחזור',
      onConfirm: async () => {
        try {
          await restoreBackup(b);
          showToast('הנתונים שוחזרו. כדי לבטל — שחזרו את "לפני שחזור"');
        } catch {
          showToast('השחזור נכשל — בדקו את החיבור לרשת. הנתונים לא שונו.');
        }
      },
    });
  }

  if (!hydrated || !ready) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>גיבוי ושחזור</Text>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>גיבוי ושחזור</Text>
        <View style={styles.statusRow}>
          <Icon name="cloud-off-outline" size={28} color={colors.warning} />
          <View style={styles.statusTexts}>
            <Text style={styles.statusTitle}>הגיבוי כבוי — לא מחוברים לחשבון</Text>
            <Text style={styles.text}>
              הגיבויים נשמרים בשרת, בחשבון הגוגל שלך: גיבוי אוטומטי פעם ביום, ושחזור עד {BACKUP_RETENTION_DAYS}{' '}
              יום אחורה.
            </Text>
          </View>
        </View>
        <Button label="התחברות עם גוגל" onPress={() => void signIn().catch(() => {})} />
      </View>
    );
  }

  const meta = last.state === 'ok' ? last.meta : null;
  const fresh = meta != null && ago(meta.createdAt) === 'היום';

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>גיבוי ושחזור</Text>

      <View style={styles.statusRow}>
        {last.state === 'loading' ? (
          <ActivityIndicator color={colors.brand} />
        ) : (
          <Icon
            name={last.state === 'error' ? 'cloud-alert' : fresh ? 'cloud-check' : 'cloud-clock-outline'}
            size={28}
            color={last.state === 'error' ? colors.danger : fresh ? colors.success : colors.warning}
          />
        )}
        <View style={styles.statusTexts}>
          <Text style={styles.statusTitle}>
            {last.state === 'loading'
              ? 'בודק את הגיבוי האחרון…'
              : last.state === 'error'
                ? 'לא ניתן לבדוק את הגיבויים כרגע'
                : meta
                  ? `גיבוי אחרון: ${when(meta.createdAt)} (${ago(meta.createdAt)})`
                  : 'עדיין לא בוצע גיבוי'}
          </Text>
          {meta ? (
            <Text style={styles.text}>
              {meta.summary.reports} דיווחים · {meta.summary.workplaces} מקומות עבודה · {meta.summary.courses} קורסים
            </Text>
          ) : null}
        </View>
      </View>

      <Text style={styles.text}>
        גיבוי אוטומטי פעם ביום לשרת, בחשבון {user.email ?? 'הגוגל שלך'}. נשמרים {BACKUP_RETENTION_DAYS} יום. רק
        הנתונים שלך — בלי נתוני הדגמה.
      </Text>

      <Button label="גיבוי עכשיו" onPress={() => void backupNow()} loading={busy} />
      <Button
        label={listState === 'open' ? 'סגירת רשימת הגיבויים' : 'שחזור מגיבוי…'}
        variant="secondary"
        onPress={() => void openList()}
        loading={listState === 'loading'}
      />

      {listState === 'error' ? <Text style={styles.text}>לא ניתן לטעון את רשימת הגיבויים כרגע.</Text> : null}
      {listState === 'open' && list ? (
        list.length === 0 ? (
          <Text style={styles.text}>אין גיבויים מ־{BACKUP_RETENTION_DAYS} הימים האחרונים.</Text>
        ) : (
          <View>
            <Text style={styles.text}>בחרו תאריך לשחזור:</Text>
            {list.map((b) => {
              const day = isoOf(new Date(b.createdAt));
              return (
                <Pressable
                  key={b.id}
                  onPress={() => askRestore(b)}
                  accessibilityRole="button"
                  accessibilityLabel={`שחזור מ${when(b.createdAt)}`}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={styles.rowTexts}>
                    <Text style={styles.rowTitle}>
                      {when(b.createdAt)} · {hebrewDate(day, false)}
                    </Text>
                    <Text style={[styles.text, b.kind === 'before-restore' && { color: colors.warning }]}>
                      {KIND_LABEL[b.kind]} · {b.summary.reports} דיווחים · {b.summary.workplaces} מקומות עבודה
                    </Text>
                  </View>
                  <Icon name="restore" size={22} color={colors.brand} />
                </Pressable>
              );
            })}
          </View>
        )
      ) : null}
      {confirm.dialog}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    pressed: { opacity: 0.85 },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    text: { fontSize: 13, lineHeight: 20, color: colors.textMuted, textAlign: TEXT_RIGHT },
    statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    statusTexts: { flex: 1, gap: 2 },
    statusTitle: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 52,
      paddingVertical: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rowTexts: { flex: 1, gap: 2 },
    rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
  });
