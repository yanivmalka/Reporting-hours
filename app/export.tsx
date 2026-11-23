/**
 * ייצוא דיווחים (lib/exportReports.ts) — תקופה, מקום עבודה, עם / בלי סכומים, ו־CSV או PDF.
 * באנדרואיד הקובץ נפתח בחלון השיתוף; בדפדפן — הורדה / הדפסה (components/exportFile.ts).
 * פתוח לכל רמת הרשאה (קריאה בלבד). סכומים כשהמידע הכספי נעול — רק אחרי פתיחה.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Screen } from '../components/Screen';
import { LoadingScreen } from '../components/LoadingScreen';
import { Button } from '../components/Button';
import { Checkbox } from '../components/Checkbox';
import { DateField } from '../components/DatePicker';
import { SelectField, type SelectOption } from '../components/SelectField';
import { SegmentedControl } from '../components/SegmentedControl';
import { useScreenData } from '../components/useScreenData';
import { useToast } from '../components/Toast';
import { shareCsv, sharePdf } from '../components/exportFile';
import { buildExport, displayDate, exportFileName, hoursText, toCsv, toHtml, type EmployeeInfo } from '../lib/exportReports';
import { loadProfile, senderName, type Profile } from '../lib/profile';
import { loadReports, type WorkReport } from '../lib/reports';
import { loadWorkplaces, type Workplace } from '../lib/workplaces';
import { loadCourses, type Course } from '../lib/courses';
import { usePayBasis } from '../lib/payBasis';
import { useGroupLevel } from '../lib/courseGrouping';
import { GroupLevelPicker } from '../components/GroupLevelPicker';
import { unlockFinance, useFinanceLocked } from '../lib/appLock';
import { isoDate } from '../lib/dates';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useWorkplaceColor } from '../theme/workplaceColors';
import { cardShadow, radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

type Range = 'month' | 'prev' | 'year' | 'custom';

const RANGES: { value: Range; label: string }[] = [
  { value: 'month', label: 'החודש' },
  { value: 'prev', label: 'הקודם' },
  { value: 'year', label: 'השנה' },
  { value: 'custom', label: 'טווח' },
];

function rangeOf(kind: Range, now: Date): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (kind === 'prev') return { from: isoDate(new Date(y, m - 1, 1)), to: isoDate(new Date(y, m, 0)) };
  if (kind === 'year') return { from: isoDate(new Date(y, 0, 1)), to: isoDate(new Date(y, 11, 31)) };
  return { from: isoDate(new Date(y, m, 1)), to: isoDate(new Date(y, m + 1, 0)) };
}

type Data = { reports: WorkReport[]; workplaces: Workplace[]; courses: Course[]; profile: Profile };

export default function ExportScreen() {
  const styles = useThemedStyles(makeStyles);
  const colorOf = useWorkplaceColor();
  const { basis } = usePayBasis();
  const level = useGroupLevel();
  const locked = useFinanceLocked();
  const { showToast } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [range, setRange] = useState<Range>('month');
  const [custom, setCustom] = useState(() => rangeOf('month', new Date()));
  const [workplaceId, setWorkplaceId] = useState<string | null>(null);
  const [withPay, setWithPay] = useState(true);
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null);

  useScreenData(
    () => Promise.all([loadReports(), loadWorkplaces(), loadCourses(), loadProfile()]),
    [],
    ([reports, workplaces, courses, profile]) => setData({ reports, workplaces, courses, profile }),
  );

  if (!data) return <LoadingScreen />;

  const { from, to } = range === 'custom' ? custom : rangeOf(range, new Date());
  const badRange = from > to;
  // מקומות שיש להם דיווחים — כולל מקום בארכיון.
  const withReports = new Set(data.reports.map((r) => r.workplaceId));
  const wpOptions: SelectOption<string | null>[] = [
    { value: null, label: 'כל מקומות העבודה' },
    ...data.workplaces
      .filter((w) => withReports.has(w.id))
      .map((w) => ({ value: w.id, label: w.name, color: colorOf(w), sub: w.archivedAt ? 'בארכיון' : undefined })),
  ];
  const wpName = data.workplaces.find((w) => w.id === workplaceId)?.name ?? null;
  const preview = buildExport(data.reports, data.workplaces, data.courses, basis, { from, to, workplaceId, withPay: false, level });

  async function run(kind: 'csv' | 'pdf') {
    if (!data || badRange) return;
    // סכומים כשהמידע הכספי נעול — רק אחרי זיהוי.
    if (withPay && locked && !(await unlockFinance())) return;
    setBusy(kind);
    try {
      const out = buildExport(data.reports, data.workplaces, data.courses, basis, { from, to, workplaceId, withPay, level });
      const name = exportFileName({ from, to }, kind);
      const p = data.profile;
      const employee: EmployeeInfo = {
        ...p,
        fullName: senderName(p),
        employeeNumber: data.workplaces.find((w) => w.id === workplaceId)?.employeeNumber,
      };
      if (kind === 'csv') await shareCsv(toCsv(out, withPay, employee), name);
      else
        await sharePdf(
          toHtml(
            out,
            withPay,
            'דיווח שעות',
            `${wpName ?? 'כל מקומות העבודה'} · ${displayDate(from)} עד ${displayDate(to)}`,
            employee,
          ),
          name,
        );
    } catch (e) {
      console.warn('[export] failed', e);
      showToast('הייצוא נכשל. אפשר לנסות שוב.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <View style={styles.card}>
        <Text style={styles.label}>תקופה</Text>
        <SegmentedControl options={RANGES} value={range} onChange={setRange} />
        {range === 'custom' ? (
          <View style={styles.dates}>
            <View style={styles.dateCol}>
              <Text style={styles.sub}>מתאריך</Text>
              <DateField value={custom.from} onChange={(v) => setCustom((c) => ({ ...c, from: v }))} invalid={badRange} />
            </View>
            <View style={styles.dateCol}>
              <Text style={styles.sub}>עד תאריך</Text>
              <DateField value={custom.to} onChange={(v) => setCustom((c) => ({ ...c, to: v }))} invalid={badRange} />
            </View>
          </View>
        ) : (
          <Text style={styles.sub}>
            {displayDate(from)}–{displayDate(to)}
          </Text>
        )}
        {badRange ? <Text style={styles.error}>תאריך הסיום לפני תאריך ההתחלה</Text> : null}

        <Text style={styles.label}>מקום עבודה</Text>
        <SelectField value={workplaceId} options={wpOptions} onChange={setWorkplaceId} title="מקום עבודה" />

        <Text style={styles.label}>קיבוץ</Text>
        <GroupLevelPicker />

        <Checkbox
          checked={withPay}
          onChange={setWithPay}
          label="כולל סכומים"
          hint={locked ? 'המידע הכספי נעול — יידרש זיהוי לפני הייצוא' : 'עמודת שכר לכל דיווח וסיכום'}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>
          {preview.totals.reports === 0
            ? 'אין דיווחים בתקופה'
            : `${preview.totals.reports === 1 ? 'דיווח אחד' : `${preview.totals.reports} דיווחים`} · ${hoursText(preview.totals.netMinutes)} שעות נטו`}
        </Text>
        {preview.groups?.map((g) => (
          <View key={g.label} style={styles.groupRow}>
            <Text style={styles.groupLabel}>{g.label}</Text>
            <Text style={styles.groupMeta}>
              {g.totals.reports} דיווחים · {hoursText(g.totals.netMinutes)} שע׳
            </Text>
          </View>
        ))}
        <Text style={styles.sub}>קובץ CSV נפתח באקסל וב־Google Sheets.</Text>
        <Text style={styles.sub}>קובץ PDF — טבלה מסודרת להדפסה או לשליחה.</Text>
        <Button
          label="ייצוא CSV"
          icon="file-delimited-outline"
          onPress={() => void run('csv')}
          loading={busy === 'csv'}
          disabled={busy != null || badRange || preview.totals.reports === 0}
        />
        <Button
          label="ייצוא PDF"
          icon="file-pdf-box"
          variant="secondary"
          onPress={() => void run('pdf')}
          loading={busy === 'pdf'}
          disabled={busy != null || badRange || preview.totals.reports === 0}
        />
      </View>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
      ...cardShadow,
    },
    label: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    sub: { fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: TEXT_RIGHT },
    error: { fontSize: 13, color: colors.danger, textAlign: TEXT_RIGHT },
    dates: { flexDirection: 'row', gap: spacing.sm },
    dateCol: { flex: 1, gap: 4 },
    groupRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
    groupLabel: { flex: 1, fontSize: 13, color: colors.text, textAlign: TEXT_RIGHT },
    groupMeta: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  });
