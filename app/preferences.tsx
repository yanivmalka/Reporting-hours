/**
 * "הגדרות" — דף נפרד (במקום הקבוצה המתקפלת "הגדרות ותצוגה" בתפריט ☰), בחלוקה מקובלת:
 * חשבון · כללי · תצוגה · פרטיות ואבטחה · דיווח ושכר · נתונים · אודות ועדכונים.
 * מסכי ההגדרה הייעודיים (דקות מצטברות, פרטים אישיים, שיתוף, דיווח במייל, ניהול נתונים)
 * נפתחים מכאן; ההגדרות הקצרות (ערכת צבעים, תאריך עברי, נעילה, תחילת עבודה, שפה) — כאן.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, type Href } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { LoadingScreen } from '../components/LoadingScreen';
import { Text } from '../components/Text';
import { Pressable } from '../components/Pressable';
import { Icon } from '../components/Icon';
import { EnterChevron } from '../components/Chevrons';
import { Screen } from '../components/Screen';
import { Checkbox } from '../components/Checkbox';
import { DateField } from '../components/DatePicker';
import { SegmentedControl } from '../components/SegmentedControl';
import { AppLockSetting } from '../components/AppLock';
import { PushSetting } from '../components/PushSetting';
import { pushPlatform } from '../lib/push';
import { UpdateSection } from '../components/UpdateChecker';
import { AccountSection } from '../components/CloudSync';
import { useAccess } from '../components/Access';
import { setViewOnly, useViewOnly } from '../lib/viewOnly';
import { useI18n } from '../lib/i18n';
import type { Lang } from '../lib/strings';
import { setShowHebrewDates, useShowHebrewDates } from '../lib/hebrewDatePref';
import { setTrackingStart, useTrackingStart } from '../lib/trackingStart';
import { todayISO } from '../lib/time';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { cardShadow, radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

export default function PreferencesScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { colors, palettes, paletteId, setPaletteId } = useTheme();
  const { t, lang, setLang, langLabels } = useI18n();
  const { isOwner } = useAccess();
  const viewOnly = useViewOnly();
  const showHeb = useShowHebrewDates();
  const trackingStart = useTrackingStart();
  const [langNotice, setLangNotice] = useState(false);
  // ב־web הדף מרונדר מראש; החשבון, העדכונים וההגדרות המקומיות שונים בדפדפן —
  // הרינדור הראשון זהה לשרת (טעינה), ורק אחריו התוכן (כמו app/workplace-form.tsx).
  const [ready, setReady] = useState(Platform.OS !== 'web');
  useEffect(() => setReady(true), []);

  const link = (href: Href, icon: string, label: string, sub?: string) => (
    <Pressable
      key={String(href)}
      onPress={() => router.push(href)}
      accessibilityRole="link"
      style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
    >
      <Icon name={icon} size={22} color={colors.textMuted} />
      <View style={styles.linkTexts}>
        <Text style={styles.linkText}>{label}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      <EnterChevron />
    </Pressable>
  );

  if (!ready) return <LoadingScreen />;

  return (
    <Screen>
      <Group title="חשבון" icon="account-outline">
        <AccountSection />
        {link('/profile', 'account-circle-outline', t('nav.profile'), 'שם, כתובת ופרטים לדוחות השכר')}
        {link('/sharing', 'account-multiple-outline', t('nav.sharing'))}
      </Group>

      <Group title="כללי" icon="tune-variant">
        <Checkbox
          checked={viewOnly}
          onChange={(on) => void setViewOnly(on)}
          label="מצב צפייה בלבד"
          hint="מציג את המערכת לקריאה בלבד: בלי דיווח ובלי עריכה, עד שחוזרים למצב עריכה (גם מהפס שבראש המסך או מהתפריט). לכל מכשיר."
        />
        <Text style={styles.label}>תחילת עבודה עם המערכת</Text>
        {trackingStart ? (
          <>
            <DateField value={trackingStart} onChange={(d) => void setTrackingStart(d)} />
            <Text style={styles.sub}>
              המערכת מתחילה בתאריך הזה: מפגשים לפניו אינם בתכנון, בצפי, בתחזית ובדוחות השכר, ומפגש
              שלא דווח לפניו אינו "חסר". דיווח שנעשה בכל זאת נכלל כרגיל.
            </Text>
            <Pressable onPress={() => void setTrackingStart(null)} hitSlop={6}>
              <Text style={styles.action}>ביטול התאריך</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.sub}>לא נקבע — כל המפגשים שעברו נבדקים לדיווח.</Text>
            <Pressable onPress={() => void setTrackingStart(todayISO())} hitSlop={6}>
              <Text style={styles.action}>קביעת תאריך</Text>
            </Pressable>
          </>
        )}
        <Text style={styles.label}>{t('drawer.language')}</Text>
        <SegmentedControl<Lang>
          options={[
            { value: 'he', label: langLabels.he },
            { value: 'en', label: langLabels.en },
          ]}
          value={lang}
          onChange={(next) => setLangNotice(!setLang(next))}
        />
        {langNotice ? <Text style={styles.sub}>תמיכה באנגלית תתווסף בהמשך</Text> : null}
      </Group>

      <Group title="תצוגה" icon="palette-outline">
        <Text style={styles.label}>{t('drawer.palette')}</Text>
        <View style={styles.swatchRow}>
          {palettes.map((palette) => {
            const selected = palette.id === paletteId;
            const label = lang === 'he' ? palette.labelHe : palette.labelEn;
            return (
              <Pressable
                key={palette.id}
                onPress={() => setPaletteId(palette.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={label}
                style={[styles.swatch, selected && styles.swatchSelected]}
              >
                <View style={styles.swatchDisc}>
                  <View style={[styles.swatchHalf, { backgroundColor: palette.colors.brand }]} />
                  <View style={[styles.swatchHalf, { backgroundColor: palette.swatchTint }]} />
                </View>
              </Pressable>
            );
          })}
        </View>
        <Checkbox
          checked={showHeb}
          onChange={(on) => void setShowHebrewDates(on)}
          label="הצגת תאריך עברי"
          hint="בתאריכונים ובבחירת תאריך"
        />
      </Group>

      {pushPlatform ? (
        <Group title="התראות" icon="bell-outline">
          <PushSetting />
        </Group>
      ) : null}

      <Group title="פרטיות ואבטחה" icon="shield-lock-outline">
        <AppLockSetting />
        <Text style={styles.sub}>
          אפשר גם לנעול ולהציג סכומים מדף הבית (סימן המנעול שמתחת לתאריך), כשהנעילה מופעלת.
        </Text>
      </Group>

      <Group title="דיווח ושכר" icon="timer-cog-outline">
        {link('/settings', 'timer-cog-outline', t('nav.settings'), 'מונה הדקות, פדיון ודקות עודפות')}
        {isOwner ? link('/mail-report', 'email-fast-outline', t('nav.mailReport')) : null}
        {link('/holidays', 'calendar-check-outline', t('nav.holidays'))}
        {link('/export', 'file-export-outline', t('nav.export'), 'CSV לאקסל או PDF להדפסה')}
      </Group>

      {isOwner ? (
        <Group title="נתונים" icon="database-cog-outline">
          {link('/data', 'database-cog-outline', t('nav.data'), 'גיבוי, שחזור ונתוני הדגמה')}
          {link('/archive', 'archive-outline', t('nav.archive'))}
        </Group>
      ) : null}

      <Group title="אודות ועדכונים" icon="information-outline">
        <UpdateSection />
      </Group>
    </Screen>
  );
}

function Group({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Icon name={icon} size={18} color={colors.brand} />
        <Text style={styles.groupTitle}>{title}</Text>
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    group: { gap: spacing.xs },
    groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
    groupTitle: { fontSize: 14, fontWeight: '800', color: colors.brandDark, textAlign: TEXT_RIGHT },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
      ...cardShadow,
    },
    label: { fontSize: 14, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    sub: { fontSize: 12, lineHeight: 18, color: colors.textMuted, textAlign: TEXT_RIGHT },
    action: { fontSize: 14, fontWeight: '700', color: colors.brand, textAlign: TEXT_RIGHT },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
    linkTexts: { flex: 1, minWidth: 0, gap: 1 },
    linkText: { fontSize: 15, fontWeight: '600', color: colors.text, textAlign: TEXT_RIGHT },
    pressed: { opacity: 0.7 },
    swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    swatch: { padding: 3, borderRadius: 24, borderWidth: 2, borderColor: 'transparent' },
    swatchSelected: { borderColor: colors.brand },
    swatchDisc: {
      width: 36,
      height: 36,
      borderRadius: 18,
      overflow: 'hidden',
      flexDirection: 'row',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    swatchHalf: { flex: 1 },
  });
