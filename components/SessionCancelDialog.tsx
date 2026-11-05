/**
 * דיאלוג ביטול מפגש של קורס ("השיעור לא התקיים"), עם סיבה אופציונלית ובחירה
 * אם להשאיר אותו בפוטנציאל (ברירת מחדל — יורד רק מהצפי) או להסיר גם ממנו —
 * או, למפגש שכבר בוטל, הצגת הסיבה והחזרתו ("המפגש התקיים").
 *
 * בנוסף: דיאלוג העברת מפגש לתאריך אחר (`useSessionMove`).
 *
 * שימוש:
 *   const sessionDialog = useSessionCancel();
 *   sessionDialog.open({ course, date, cancel, onDone: reload });
 *   …
 *   {sessionDialog.dialog}
 */
import { useCallback, useMemo, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { hebrewDate } from '../lib/hebrewDate';
import { longDayLabel } from '../lib/home';
import { moveSession, removeFromPlan, restoreSession, returnToPlan, setSessionMark, type Cancellation } from '../lib/sessions';
import { DateField } from './DatePicker';
import type { Course } from '../lib/courses';
import { radius, spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';
import { Button } from './Button';
import { Pressable } from './Pressable';
import { TextField } from './TextField';
import { useToast } from './Toast';
import { useCancelReasons } from '../lib/cancelReasons';


export type SessionCancelRequest = {
  course: Pick<Course, 'id' | 'name'>;
  date: string;
  /** כשהמפגש כבר מבוטל — הסיבה הנוכחית (ואז הדיאלוג מציע להחזיר אותו) */
  cancel?: Cancellation | null;
  /** אחרי שמירה (ביטול או החזרה) */
  onDone?: (canceled: boolean) => void;
  /**
   * "המפגש התקיים" — אחרי ביטול הסימון. כשמועבר, נקרא במקום onDone
   * (למשל כדי לפתוח דיווח ישיר על המפגש).
   */
  onHeld?: () => void;
};

export function useSessionCancel() {
  const [request, setRequest] = useState<SessionCancelRequest | null>(null);
  const open = useCallback((r: SessionCancelRequest) => setRequest(r), []);
  const dialog = useMemo(
    () => (request ? <SessionCancelDialog request={request} onClose={() => setRequest(null)} /> : null),
    [request],
  );
  return { open, dialog };
}

function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${longDayLabel(new Date(y, m - 1, d))} · ${hebrewDate(iso, false)}`;
}

function SessionCancelDialog({ request, onClose }: { request: SessionCancelRequest; onClose: () => void }) {
  const styles = useStyles(makeStyles);
  const { showToast } = useToast();
  const [reason, setReason] = useState('');
  // הסיבות מהרשימה הגלובלית (חגים וחופשות → סיבות ביטול)
  const reasons = useCancelReasons();
  const reasonId = reasons.find((r) => r.name.trim() === reason.trim())?.id;
  const [removeToo, setRemoveToo] = useState(false);
  const [busy, setBusy] = useState(false);
  const canceled = request.cancel ?? null;

  async function run(action: () => Promise<void>, message: string, nowCanceled: boolean) {
    setBusy(true);
    try {
      await action();
      showToast(message);
      request.onDone?.(nowCanceled);
    } finally {
      setBusy(false);
      onClose();
    }
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityRole="alert">
          <Text style={styles.title}>{canceled ? 'המפגש בוטל' : 'ביטול מפגש'}</Text>
          <Text style={styles.subject}>{request.course.name}</Text>
          <Text style={styles.message}>{dateLabel(request.date)}</Text>

          {canceled ? (
            <Text style={styles.reason}>
              {canceled.auto
                ? `בוטל אוטומטית: ${canceled.reason}. "המפגש התקיים" מחזיר רק את המפגש הזה; את סוגי הימים המבוטלים בוחרים בהגדרות.`
                : canceled.kind === 'moved'
                  ? `${canceled.reason}. "המפגש התקיים" מחזיר אותו לתאריך המקורי.`
                  : `${canceled.reason ? `סיבה: ${canceled.reason}` : 'לא צוינה סיבה.'} ${
                      canceled.kind === 'removed' ? 'נמחק מהתכנון.' : 'נשאר בפוטנציאל ויורד מהצפי.'
                    }`}
            </Text>
          ) : (
            <>
              <Text style={styles.message}>מפגש מבוטל לא יופיע כדיווח חסר ויורד מהצפי.</Text>
              <TextField value={reason} onChangeText={setReason} placeholder="סיבת הביטול (לא חובה)" />
              <View style={styles.chips}>
                {reasons.filter((r) => r.name.trim()).map((r) => (
                  <Pressable
                    key={r.id}
                    onPress={() => setReason(r.name.trim())}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.chip, reason === r.name.trim() && styles.chipOn, pressed && styles.pressed]}
                  >
                    <Text style={[styles.chipText, reason === r.name.trim() && styles.chipTextOn]}>{r.name.trim()}</Text>
                  </Pressable>
                ))}
              </View>
              {[
                { remove: false, title: 'השאר בפוטנציאל', sub: 'נשמר מה שציפית; יורד רק מהצפי' },
                { remove: true, title: 'מחיקת המפגש מהתכנון', sub: 'המפגש לא ייספר בפוטנציאל ובצפי' },
              ].map((o) => (
                <Pressable
                  key={o.title}
                  onPress={() => setRemoveToo(o.remove)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: removeToo === o.remove }}
                  style={[styles.option, removeToo === o.remove && styles.optionOn]}
                >
                  <View style={[styles.radio, removeToo === o.remove && styles.radioOn]} />
                  <View style={styles.optionTexts}>
                    <Text style={styles.optionTitle}>{o.title}</Text>
                    <Text style={styles.optionSub}>{o.sub}</Text>
                  </View>
                </Pressable>
              ))}
            </>
          )}

          {canceled ? (
            <View style={styles.stack}>
              <Button
                label="המפגש התקיים"
                loading={busy}
                onPress={async () => {
                  setBusy(true);
                  try {
                    await restoreSession(request.course.id, request.date);
                    if (request.onHeld) request.onHeld();
                    else {
                      showToast('המפגש הוחזר ללו״ז');
                      request.onDone?.(false);
                    }
                  } finally {
                    setBusy(false);
                    onClose();
                  }
                }}
              />
              {canceled.kind === 'canceled' ? (
                <Button
                  label="מחיקת המפגש מהתכנון"
                  variant="danger"
                  disabled={busy}
                  onPress={() =>
                    run(
                      () => removeFromPlan(request.course.id, request.date, canceled.reason, canceled.reasonId),
                      'המפגש נמחק מהתכנון',
                      true,
                    )
                  }
                />
              ) : canceled.kind === 'removed' ? (
                <Button
                  label="החזרה לתכנון"
                  variant="secondary"
                  disabled={busy}
                  onPress={() =>
                    run(
                      () => returnToPlan(request.course.id, request.date, canceled.reason, canceled.reasonId),
                      'המפגש הוחזר לתכנון',
                      true,
                    )
                  }
                />
              ) : null}
              <Button label="סגירה" variant="secondary" onPress={onClose} disabled={busy} />
            </View>
          ) : (
            <View style={styles.stack}>
              <Button
                label="סימון כבוטל"
                variant="danger"
                loading={busy}
                onPress={() =>
                  run(
                    () =>
                      setSessionMark(
                        request.course.id,
                        request.date,
                        removeToo ? 'removed' : 'canceled',
                        reason,
                        undefined,
                        reasonId,
                      ),
                    removeToo ? 'המפגש נמחק מהתכנון' : 'המפגש סומן כבוטל',
                    true,
                  )
                }
              />
              <Button label="חזרה" variant="secondary" onPress={onClose} disabled={busy} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

export type SessionMoveRequest = {
  course: Pick<Course, 'id' | 'name'>;
  date: string;
  /** אחרי העברה — התאריך החדש */
  onDone?: (to: string) => void;
};

/** דיאלוג העברת מפגש לתאריך אחר — נשמר "הועבר ל…" במקור ו"הועבר מ…" ביעד. */
export function useSessionMove() {
  const [request, setRequest] = useState<SessionMoveRequest | null>(null);
  const open = useCallback((r: SessionMoveRequest) => setRequest(r), []);
  const dialog = useMemo(
    () => (request ? <SessionMoveDialog request={request} onClose={() => setRequest(null)} /> : null),
    [request],
  );
  return { open, dialog };
}

function SessionMoveDialog({ request, onClose }: { request: SessionMoveRequest; onClose: () => void }) {
  const styles = useStyles(makeStyles);
  const { showToast } = useToast();
  const [to, setTo] = useState(request.date);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const same = to === request.date;

  async function submit() {
    setTried(true);
    if (same) return;
    setBusy(true);
    try {
      await moveSession(request.course.id, request.date, to);
      showToast('המפגש הועבר');
      request.onDone?.(to);
    } finally {
      setBusy(false);
      onClose();
    }
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityRole="alert">
          <Text style={styles.title}>העברת השיעור</Text>
          <Text style={styles.subject}>{request.course.name}</Text>
          <Text style={styles.message}>מ־{dateLabel(request.date)}, לתאריך:</Text>
          <DateField value={to} onChange={setTo} invalid={tried && same} />
          {tried && same ? <Text style={styles.error}>בחר תאריך אחר</Text> : null}
          <Text style={styles.message}>
            הפוטנציאל עובר עם המפגש. בתאריך המקורי יוצג "הועבר ל…", ובחדש "הועבר מ…".
          </Text>
          <View style={styles.actions}>
            <View style={styles.action}>
              <Button label="חזרה" variant="secondary" onPress={onClose} disabled={busy} />
            </View>
            <View style={styles.action}>
              <Button label="העברה" loading={busy} onPress={submit} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
    pressed: { opacity: 0.85 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    dialog: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    title: { fontSize: 18, fontWeight: '800', color: c.text, textAlign: layout.textStart },
    subject: { fontSize: 16, fontWeight: '700', color: c.text, textAlign: layout.textStart },
    message: { fontSize: 14, lineHeight: 21, color: c.textMuted, textAlign: layout.textStart },
    error: { fontSize: 13, color: c.danger, textAlign: layout.textStart },
    reason: { fontSize: 15, lineHeight: 22, color: c.text, textAlign: layout.textStart, paddingVertical: 4 },
    chips: { flexDirection: layout.rowStart, flexWrap: 'wrap', gap: 6 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      backgroundColor: c.background,
    },
    chipOn: { backgroundColor: c.brandLight, borderColor: c.brand },
    chipText: { fontSize: 13, color: c.textMuted },
    chipTextOn: { color: c.brand, fontWeight: '700' },
    // כפתורים זה מתחת לזה, ברוחב מלא; הפעולה הראשית (האחרונה בקוד) למעלה.
    actions: { flexDirection: 'column-reverse', gap: spacing.sm, marginTop: spacing.sm },
    option: {
      flexDirection: layout.rowStart,
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    optionOn: { borderColor: c.brand, backgroundColor: c.brandLight },
    radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: c.textMuted },
    radioOn: { borderColor: c.brand, backgroundColor: c.brand },
    optionTexts: { flex: 1 },
    optionTitle: { fontSize: 14, fontWeight: '700', color: c.text, textAlign: layout.textStart },
    optionSub: { fontSize: 12, color: c.textMuted, textAlign: layout.textStart },
    action: {},
    stack: { gap: spacing.sm, marginTop: spacing.sm },
  });
