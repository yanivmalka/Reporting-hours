/**
 * דיאלוג ביטול מפגש של קורס ("השיעור לא התקיים"), עם סיבה אופציונלית —
 * או, למפגש שכבר בוטל, הצגת הסיבה והחזרתו ("המפגש התקיים").
 *
 * שימוש:
 *   const sessionDialog = useSessionCancel();
 *   sessionDialog.open({ course, date, cancel, onDone: reload });
 *   …
 *   {sessionDialog.dialog}
 */
import { useCallback, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { hebrewDate } from '../lib/hebrewDate';
import { longDayLabel } from '../lib/home';
import { restoreSession, setSessionMark, type Cancellation } from '../lib/sessions';
import type { Course } from '../lib/courses';
import { radius, spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';
import { Button } from './Button';
import { Pressable } from './Pressable';
import { TextField } from './TextField';
import { useToast } from './Toast';

/** סיבות נפוצות — לבחירה מהירה. */
const QUICK_REASONS = ['מחלה', 'ביטול מצד המוסד', 'שביתה', 'מבחנים', 'אירוע מיוחד'];

export type SessionCancelRequest = {
  course: Pick<Course, 'id' | 'name'>;
  date: string;
  /** כשהמפגש כבר מבוטל — הסיבה הנוכחית (ואז הדיאלוג מציע להחזיר אותו) */
  cancel?: Cancellation | null;
  /** אחרי שמירה (ביטול או החזרה) */
  onDone?: (canceled: boolean) => void;
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
                ? `בוטל אוטומטית: ${canceled.reason}. אפשר לכבות את הביטול האוטומטי בחגים בהגדרות.`
                : canceled.reason
                  ? `סיבה: ${canceled.reason}`
                  : 'לא צוינה סיבה.'}
            </Text>
          ) : (
            <>
              <Text style={styles.message}>
                מפגש מבוטל לא נספר בשעות המתוכננות ולא יופיע כדיווח חסר.
              </Text>
              <TextField value={reason} onChangeText={setReason} placeholder="סיבת הביטול (לא חובה)" />
              <View style={styles.chips}>
                {QUICK_REASONS.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setReason(r)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.chip, reason === r && styles.chipOn, pressed && styles.pressed]}
                  >
                    <Text style={[styles.chipText, reason === r && styles.chipTextOn]}>{r}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <View style={styles.actions}>
            <View style={styles.action}>
              <Button label={canceled ? 'סגירה' : 'חזרה'} variant="secondary" onPress={onClose} disabled={busy} />
            </View>
            <View style={styles.action}>
              {canceled ? (
                <Button
                  label="המפגש התקיים"
                  loading={busy}
                  onPress={() =>
                    run(() => restoreSession(request.course.id, request.date), 'המפגש הוחזר ללו״ז', false)
                  }
                />
              ) : (
                <Button
                  label="סימון כבוטל"
                  variant="danger"
                  loading={busy}
                  onPress={() =>
                    run(
                      () => setSessionMark(request.course.id, request.date, 'canceled', reason),
                      'המפגש סומן כבוטל',
                      true,
                    )
                  }
                />
              )}
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
    actions: { flexDirection: layout.rowStart, gap: spacing.sm, marginTop: spacing.sm },
    action: { flex: 1 },
  });
