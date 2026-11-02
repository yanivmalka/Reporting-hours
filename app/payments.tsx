import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/Pressable';
import { PaymentDialog } from '../components/PaymentDialog';
import { Screen } from '../components/Screen';
import { useToast } from '../components/Toast';
import { loadCourses, type Course } from '../lib/courses';
import { usePayBasis } from '../lib/payBasis';
import {
  buildPayrollReport,
  expectedPayment,
  grossAmount,
  loadPayrollStatus,
  netAmount,
  payrollItems,
  periodTitle,
  updatePayrollStatus,
  type PayrollItem,
  type PayrollReport,
} from '../lib/payroll';
import { loadReports, type WorkReport } from '../lib/reports';
import { formatDateWithHebrew, todayISO } from '../lib/time';
import { formatShekels } from '../lib/travel';
import { loadWorkplaces, paymentTermsLabel, taxPercentOf, workplaceAt } from '../lib/workplaces';
import { TEXT_RIGHT } from '../theme/align';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

type Row = { item: PayrollItem; report: PayrollReport; expected: string };

/**
 * מעקב תשלומים: לכל דוח שכר שנשלח — מתי צפוי התשלום (לפי "שוטף +"),
 * האם שולם, מתי ובאיזה סכום. דוחות שמועד התשלום שלהם עבר — מודגשים.
 */
export default function PaymentsScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { basis } = usePayBasis();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState({ overdue: true, waiting: true, paid: false });

  const load = useCallback(async () => {
    const [w, r, st, c] = await Promise.all([
      loadWorkplaces(),
      loadReports(),
      loadPayrollStatus(),
      loadCourses(),
    ]);
    const items = payrollItems(w, r, st).filter((i) => i.status.sentAt);
    setRows(
      items.map((item) => ({
        item,
        report: buildPayrollReport(
          item.workplace,
          item.period,
          r as WorkReport[],
          c as Course[],
          basis,
          item.status.redeemedMinutes ?? 0,
        ),
        expected: expectedPayment(item.workplace, item.period),
      })),
    );
  }, [basis]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!rows) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  const today = todayISO();
  const overdue = rows.filter((r) => !r.item.status.paidAt && r.expected < today);
  const waiting = rows.filter((r) => !r.item.status.paidAt && r.expected >= today);
  const paid = rows
    .filter((r) => r.item.status.paidAt)
    .sort((a, b) => (b.item.status.paidAt ?? '').localeCompare(a.item.status.paidAt ?? ''));
  const sum = (list: Row[], f: (r: Row) => number) => list.reduce((s, r) => s + f(r), 0);

  async function save(row: Row, date: string, amount: number) {
    await updatePayrollStatus(row.item.workplace.id, row.item.period.start, {
      paidAt: date,
      paidAmount: amount,
    });
    setEditing(null);
    showToast('התשלום עודכן');
    await load();
  }

  async function clear(row: Row) {
    await updatePayrollStatus(row.item.workplace.id, row.item.period.start, {
      paidAt: undefined,
      paidAmount: undefined,
    });
    setEditing(null);
    await load();
  }

  const RowView = ({ row, kind }: { row: Row; kind: 'overdue' | 'waiting' | 'paid' }) => {
    const { item, report, expected } = row;
    return (
      <Pressable
        onPress={() => setEditing(row)}
        style={({ pressed }) => [styles.row, kind === 'overdue' && styles.rowOverdue, pressed && styles.pressed]}
      >
        <View style={styles.rowHead}>
          <Text style={styles.rowName} numberOfLines={2}>
            {item.workplace.name}
          </Text>
          <Text style={styles.amount}>
            {kind === 'paid'
              ? formatShekels(item.status.paidAmount ?? 0)
              : formatShekels(netAmount(report))}
          </Text>
        </View>
        <Text style={styles.meta}>
          {periodTitle(item.period)} · {paymentTermsLabel(item.workplace)}
          {kind === 'paid'
            ? ` · שולם ${formatDateWithHebrew(item.status.paidAt as string, false)}`
            : ` · צפוי ${formatDateWithHebrew(expected, false)}`}
        </Text>
        <Text style={styles.meta}>
          ברוטו {formatShekels(grossAmount(report))}
          {taxPercentOf(workplaceAt(item.workplace, item.period.end)) > 0
            ? ` · מס ${taxPercentOf(workplaceAt(item.workplace, item.period.end))}%`
            : ''}
          {kind === 'overdue' ? ' · באיחור' : ''}
        </Text>
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/payroll-report',
              params: { wp: item.workplace.id, start: item.period.start },
            })
          }
          hitSlop={6}
        >
          <Text style={styles.link}>לדוח השכר ←</Text>
        </Pressable>
      </Pressable>
    );
  };

  const Section = ({
    k,
    title,
    list,
    kind,
  }: {
    k: keyof typeof open;
    title: string;
    list: Row[];
    kind: 'overdue' | 'waiting' | 'paid';
  }) => (
    <>
      <Pressable onPress={() => setOpen((o) => ({ ...o, [k]: !o[k] }))} style={styles.sectionHead}>
        <Text style={[styles.section, kind === 'overdue' && list.length > 0 && styles.sectionWarn]}>
          {title} ({list.length})
          {list.length > 0
            ? ` · ${formatShekels(
                sum(list, (r) => (kind === 'paid' ? r.item.status.paidAmount ?? 0 : netAmount(r.report))),
              )}`
            : ''}
        </Text>
        <Text style={styles.chevron}>{open[k] ? '▾' : '◂'}</Text>
      </Pressable>
      {open[k] ? (
        list.length === 0 ? (
          <Text style={styles.empty}>אין</Text>
        ) : (
          <View style={styles.list}>
            {list.map((r) => (
              <RowView key={`${r.item.workplace.id}|${r.item.period.start}`} row={r} kind={kind} />
            ))}
          </View>
        )
      ) : null}
    </>
  );

  return (
    <Screen>
      <View style={styles.intro}>
        <Text style={styles.title}>מעקב תשלומים</Text>
        <Text style={styles.subtitle}>
          לכל דוח שכר שנשלח: מתי צפוי התשלום לפי תנאי התשלום (שוטף +), והאם התקבל. הסכום מוצע
          בניכוי אחוז המס של מקום העבודה, וניתן לעריכה.
        </Text>
      </View>

      <Section k="overdue" title="באיחור — טרם סומנו כשולמו" list={overdue} kind="overdue" />
      <Section k="waiting" title="ממתינים לתשלום" list={waiting} kind="waiting" />
      <Section k="paid" title="שולמו" list={paid} kind="paid" />

      {editing ? (
        <PaymentDialog
          visible
          title={`${editing.item.workplace.name} — ${periodTitle(editing.item.period)}`}
          gross={grossAmount(editing.report)}
          net={netAmount(editing.report)}
          taxPercent={taxPercentOf(workplaceAt(editing.item.workplace, editing.item.period.end))}
          initialDate={editing.item.status.paidAt}
          initialAmount={editing.item.status.paidAmount}
          onSave={(d, a) => save(editing, d, a)}
          onClear={editing.item.status.paidAt ? () => clear(editing) : undefined}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    intro: { gap: spacing.sm },
    title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    subtitle: { fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: TEXT_RIGHT },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.xs,
      marginTop: spacing.sm,
    },
    section: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    sectionWarn: { color: colors.danger },
    chevron: { fontSize: 16, fontWeight: '800', color: colors.textMuted },
    empty: { fontSize: 13, color: colors.textMuted, textAlign: TEXT_RIGHT },
    list: { gap: spacing.sm },
    row: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: 3,
    },
    rowOverdue: { borderColor: colors.danger, borderWidth: 1.5 },
    pressed: { opacity: 0.7 },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    rowName: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    amount: { fontSize: 16, fontWeight: '800', color: colors.brandDark },
    meta: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
    link: { fontSize: 13, fontWeight: '700', color: colors.brand, textAlign: TEXT_RIGHT, marginTop: 2 },
  });
