/** סגנונות היומן — משותפים למסך ולכל חלקיו (components/journal). */
import { StyleSheet } from 'react-native';
import { cardShadow, radius, spacing, type AppColors } from '../../theme/colors';
import { TEXT_RIGHT } from '../../theme/align';

export const makeJournalStyles = (colors: AppColors) =>
  StyleSheet.create({
  monthLinkRow: { alignItems: 'center', paddingVertical: spacing.sm },
  monthLink: { fontSize: 14, fontWeight: '700', color: colors.brandDark, textDecorationLine: 'underline' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intro: {
    gap: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: TEXT_RIGHT,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: TEXT_RIGHT,
  },
  list: {
    gap: spacing.md,
  },
  calActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  calHint: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: TEXT_RIGHT,
  },
  calHidden: {
    opacity: 0,
  },
  pinnedCal: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  pinnedStrip: {
    backgroundColor: colors.background,
  },
  /** קו תחתון כשאין פס שבוע (שיש לו מסגרת משלו) — רק שורת הבקרה או התאריכון הנעוץ */
  pinnedEdge: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pinnedControls: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  todayLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  todayText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.brandDark,
    textDecorationLine: 'underline',
  },
  pinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pinBtnOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  pinText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  pinTextOn: {
    color: colors.textOnBrand,
  },
  dueCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    ...cardShadow,
  },
  daySummary: {
    backgroundColor: colors.brandLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  todayFrame: { borderWidth: 2, borderColor: colors.brand, borderRadius: radius.md },
  todayHead: { flexDirection: 'row' },
  todayChip: { backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2 },
  todayChipText: { fontSize: 12, fontWeight: '700', color: colors.textOnBrand },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  checkText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  calLink: {
    alignSelf: 'flex-start',
  },
  filters: {
    gap: spacing.sm,
  },
  chip: {
    height: 36,
    maxWidth: 260,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  chipTextOn: {
    color: colors.textOnBrand,
  },
  summary: {
    backgroundColor: colors.brandLight,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.brandDark,
    textAlign: TEXT_RIGHT,
  },
  summaryLine: {
    fontSize: 13,
    color: colors.brandDark,
    textAlign: TEXT_RIGHT,
  },
  clear: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.brandDark,
    textDecorationLine: 'underline',
    textAlign: TEXT_RIGHT,
    marginTop: spacing.xs,
  },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
  },
  action: {
    marginTop: spacing.sm,
  },
});
