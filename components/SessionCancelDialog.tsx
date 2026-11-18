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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { hebrewDate } from '../lib/hebrewDate';
import { longDayLabel } from '../lib/home';
import {
  moveSession,
  nextFreeSlot,
  pushSession,
  removeFromPlan,
  restoreSession,
  returnToPlan,
  setSessionMark,
  type Cancellation,
} from '../lib/sessions';
import { DateField } from './DatePicker';
import type { Course } from '../lib/courses';
import { radius, spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';
import { Button } from './Button';
import { Dialog } from './Dialog';
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
  // מה קורה למפגש: נשאר בפוטנציאל · נמחק מהתכנון · השיעורים נדחים והקורס מתארך.
  const [mode, setMode] = useState<'keep' | 'remove' | 'push'>('keep');
  const [busy, setBusy] = useState(false);
  const canceled = request.cancel ?? null;
  // המועד שאליו יתארך הקורס ב"דחיית השיעורים" — הפנוי הבא אחרי סופו, ביחס לחגים ולחופשות.
  const [pushTo, setPushTo] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void nextFreeSlot(request.course.id).then((d) => active && setPushTo(d));
    return () => {
      active = false;
    };
  }, [request.course.id]);
  const shortDay = (iso: string) => {
    const [, m, d] = iso.split('-').map(Number);
    return `${d}/${m}`;
  };

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

  /** מפגש שכבר בוטל: "המפגש התקיים", מחיקה מהתכנון / החזרה אליו, סגירה */
  const heldActions = [
    <Button
      key="held"
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
    />,
    ...(canceled?.kind === 'canceled'
      ? [
          <Button
            key="remove"
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
          />,
        ]
      : canceled?.kind === 'removed'
        ? [
            <Button
              key="return"
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
            />,
          ]
        : []),
    <Button key="close" label="סגירה" variant="secondary" onPress={onClose} disabled={busy} />,
  ];

  /** ביטול: סימון כבוטל (או דחיית השיעורים), חזרה */
  const cancelActions = [
    <Button
      key="cancel"
      label={mode === 'push' ? 'ביטול ודחיית השיעורים' : 'סימון כבוטל'}
      variant="danger"
      loading={busy}
      onPress={() =>
        mode === 'push'
          ? run(
              async () => {
                await pushSession(request.course.id, request.date, reason, reasonId);
              },
              pushTo ? `השיעורים נדחו · הקורס מתארך עד ${shortDay(pushTo)}` : 'המפגש סומן כבוטל',
              true,
            )
          : run(
              () =>
                setSessionMark(
                  request.course.id,
                  request.date,
                  mode === 'remove' ? 'removed' : 'canceled',
                  reason,
                  undefined,
                  reasonId,
                ),
              mode === 'remove' ? 'המפגש נמחק מהתכנון' : 'המפגש סומן כבוטל',
              true,
            )
      }
    />,
    <Button key="back" label="חזרה" variant="secondary" onPress={onClose} disabled={busy} />,
  ];

  return (
    <Dialog
      title={canceled ? 'המפגש בוטל' : 'ביטול מפגש'}
      compactTitle={`${canceled ? 'המפגש בוטל' : 'ביטול מפגש'} · ${request.course.name}`}
      onClose={onClose}
      alert
      head={
        <>
          <Text style={styles.subject}>{request.course.name}</Text>
          <Text style={styles.message}>{dateLabel(request.date)}</Text>
        </>
      }
      actions={canceled ? heldActions : cancelActions}
    >
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
                { mode: 'keep' as const, title: 'השאר בפוטנציאל', sub: 'נשמר מה שציפית; יורד רק מהצפי' },
                { mode: 'remove' as const, title: 'מחיקת המפגש מהתכנון', sub: 'המפגש לא ייספר בפוטנציאל ובצפי' },
                ...(pushTo
                  ? [
                      {
                        mode: 'push' as const,
                        title: 'דחיית כל השיעורים',
                        sub: `השיעורים הבאים נדחים בשבוע, והקורס מתארך עד ${shortDay(pushTo)} — בדילוג על חגים וחופשות`,
                      },
                    ]
                  : []),
              ].map((o) => (
                <Pressable
                  key={o.title}
                  onPress={() => setMode(o.mode)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: mode === o.mode }}
                  style={[styles.option, mode === o.mode && styles.optionOn]}
                >
                  <View style={[styles.radio, mode === o.mode && styles.radioOn]} />
                  <View style={styles.optionTexts}>
                    <Text style={styles.optionTitle}>{o.title}</Text>
                    <Text style={styles.optionSub}>{o.sub}</Text>
                  </View>
                </Pressable>
              ))}
            </>
          )}
    </Dialog>
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
    <Dialog
      title="העברת השיעור"
      onClose={onClose}
      alert
      head={<Text style={styles.subject}>{request.course.name}</Text>}
      actionsRow
      actions={[
        <Button key="back" label="חזרה" variant="secondary" onPress={onClose} disabled={busy} />,
        <Button key="move" label="העברה" loading={busy} onPress={submit} />,
      ]}
    >
      <Text style={styles.message}>מ־{dateLabel(request.date)}, לתאריך:</Text>
      <DateField value={to} onChange={setTo} invalid={tried && same} />
      {tried && same ? <Text style={styles.error}>בחר תאריך אחר</Text> : null}
      <Text style={styles.message}>
        הפוטנציאל עובר עם המפגש. בתאריך המקורי יוצג "הועבר ל…", ובחדש "הועבר מ…".
      </Text>
    </Dialog>
  );
}

const makeStyles = (c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
    pressed: { opacity: 0.85 },
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
  });
