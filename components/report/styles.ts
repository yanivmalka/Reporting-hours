/** סגנונות אשף הדיווח — משותפים למסך ולכל השלבים (components/report). */
import { StyleSheet } from 'react-native';
import { radius, spacing, type AppColors } from '../../theme/colors';
import { TEXT_RIGHT } from '../../theme/align';

export const makeReportStyles = (colors: AppColors) =>
  StyleSheet.create({
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
  choices: {
    gap: spacing.sm,
  },
  choice: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  choiceSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  choiceText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    textAlign: TEXT_RIGHT,
  },
  choiceTextSelected: {
    color: colors.textOnBrand,
  },
  stepper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stepDotDone: {
    backgroundColor: colors.brandDark,
    borderColor: colors.brandDark,
  },
  stepDotCurrent: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  stepNum: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
  },
  stepNumOn: {
    color: colors.textOnBrand,
  },
  stepLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  stepLabelCurrent: {
    color: colors.text,
    fontWeight: '800',
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    textAlign: TEXT_RIGHT,
  },
  contextRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  contextTexts: { flex: 1, gap: 2 },
  context: {
    backgroundColor: colors.brandLight,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  contextMain: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.brandDark,
    textAlign: TEXT_RIGHT,
  },
  swipeArea: {
    gap: spacing.md,
  },
  contextCourse: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.brandDark,
    textAlign: TEXT_RIGHT,
  },
  dayCourses: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  dayCoursesTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: TEXT_RIGHT,
  },
  dayCoursesList: {
    maxHeight: 220,
  },
  dayCourseRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  dayCourseMark: {
    width: 16,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  markDone: {
    color: colors.success,
  },
  markTodo: {
    color: colors.warning,
  },
  dayCourseTexts: {
    flex: 1,
    gap: 1,
  },
  dayCourseName: {
    fontSize: 14,
    color: colors.text,
    textAlign: TEXT_RIGHT,
  },
  dayCourseSub: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: TEXT_RIGHT,
  },
  contextSub: {
    fontSize: 12,
    color: colors.brandDark,
    textAlign: TEXT_RIGHT,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: TEXT_RIGHT,
  },
  error: {
    fontSize: 13,
    color: colors.danger,
    textAlign: TEXT_RIGHT,
  },
  pressed: {
    opacity: 0.7,
  },
  courseCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  courseTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  courseTime: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.brand,
    textAlign: TEXT_RIGHT,
  },
  reported: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.success,
  },
  linkBtn: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
  linkRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  linkLead: { fontSize: 14, color: colors.textMuted },
  allDone: {
    gap: 6,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandLight,
  },
  allDoneText: { fontSize: 16, fontWeight: '800', color: colors.success, textAlign: TEXT_RIGHT },
  allDoneLinks: { flexDirection: 'row', gap: spacing.lg },
  cardCancel: {
    alignSelf: 'flex-start',
    paddingTop: spacing.xs,
  },
  cardCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.danger,
    textDecorationLine: 'underline',
  },
  countdown: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 2,
    paddingTop: spacing.sm,
  },
  countdownText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  linkText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.brand,
    textDecorationLine: 'underline',
  },
  nav: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  doneBox: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
  },
  doneIcon: {
    fontSize: 44,
    fontWeight: '800',
    color: colors.success,
  },
  doneTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  doneText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  doneSub: {
    fontSize: 13,
    color: colors.brandDark,
    textAlign: 'center',
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  editBtnSelected: {
    borderColor: colors.textOnBrand,
  },
  editIcon: {
    fontSize: 16,
    color: colors.textMuted,
  },
  courseChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.brandLight,
    borderWidth: 1,
    borderColor: colors.brandLight,
    borderRadius: radius.md,
    gap: 2,
  },
  choiceBody: {
    flex: 1,
    gap: 2,
  },
  choiceSub: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: TEXT_RIGHT,
  },
  choiceSubSelected: {
    color: colors.textOnBrand,
    opacity: 0.85,
  },
  chevron: {
    fontSize: 18,
    fontWeight: '800',
  },
  wheelHint: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: TEXT_RIGHT,
    marginTop: -spacing.sm,
  },
  leftoverRow: {
    gap: 2,
  },
  leftoverText: {
    fontSize: 14,
    color: colors.text,
    textAlign: TEXT_RIGHT,
  },
  leftoverLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
  },
  timesRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timeCol: {
    flex: 1,
    minWidth: 0,
  },
  breaks: {
    gap: spacing.sm,
  },
  breakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  breakInput: {
    flex: 1,
  },
  breakRemove: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  breakRemoveText: {
    fontSize: 16,
    color: colors.danger,
    fontWeight: '700',
  },
  summary: {
    backgroundColor: colors.brandLight,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  summaryLine: {
    flex: 1,
    fontSize: 13,
    color: colors.brandDark,
    textAlign: TEXT_RIGHT,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.brandDark,
  },
  summaryTotalLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: colors.brandDark,
    textAlign: TEXT_RIGHT,
  },
  summaryTotal: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.brandDark,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.brandDark,
    opacity: 0.3,
    marginVertical: spacing.xs,
  },
  cancel: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    textAlign: TEXT_RIGHT,
  },
  dialogBody: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: TEXT_RIGHT,
  },
  summaryNet: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.brandDark,
    textAlign: TEXT_RIGHT,
  },
  summaryHint: {
    fontSize: 12,
    color: colors.brandDark,
    textAlign: TEXT_RIGHT,
  },
});
