/**
 * דיאלוג אישור לפעולות הרסניות (מחיקה, איפוס).
 * עובד זהה ב־web ובאנדרואיד (Alert של react-native אינו פועל ב־web).
 *
 * שימוש:
 *   const confirm = useConfirm();
 *   confirm({ title: 'למחוק?', message: '…', confirmLabel: 'מחיקה', onConfirm: () => … });
 *   …
 *   {confirm.dialog}
 */
import { useCallback, useMemo, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { radius, spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';
import { Button } from './Button';

export type ConfirmRequest = {
  title: string;
  message?: string;
  /** תווית כפתור האישור (ברירת מחדל: "מחיקה") */
  confirmLabel?: string;
  /** תווית כפתור הביטול (ברירת מחדל: "ביטול") */
  cancelLabel?: string;
  /** פעולה הרסנית — כפתור אדום (ברירת מחדל: כן) */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const ask = useCallback((r: ConfirmRequest) => setRequest(r), []);

  const dialog = useMemo(
    () =>
      request ? (
        <ConfirmDialog
          request={request}
          busy={busy}
          onCancel={() => setRequest(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await request.onConfirm();
            } finally {
              setBusy(false);
              setRequest(null);
            }
          }}
        />
      ) : null,
    [request, busy],
  );

  return Object.assign(ask, { dialog });
}

function ConfirmDialog({
  request,
  busy,
  onCancel,
  onConfirm,
}: {
  request: ConfirmRequest;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const styles = useStyles(makeStyles);
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityRole="alert">
          <Text style={styles.title}>{request.title}</Text>
          {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
          <View style={styles.actions}>
            <View style={styles.action}>
              <Button
                label={request.cancelLabel ?? 'ביטול'}
                variant="secondary"
                onPress={onCancel}
                disabled={busy}
              />
            </View>
            <View style={styles.action}>
              <Button
                label={request.confirmLabel ?? 'מחיקה'}
                variant={request.destructive === false ? 'primary' : 'danger'}
                onPress={onConfirm}
                loading={busy}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
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
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: spacing.lg,
      gap: spacing.md,
    },
    title: {
      fontSize: 18,
      fontWeight: '800',
      color: c.text,
      textAlign: layout.textStart,
    },
    message: {
      fontSize: 14,
      lineHeight: 21,
      color: c.textMuted,
      textAlign: layout.textStart,
    },
    actions: {
      flexDirection: layout.rowStart,
      gap: spacing.sm,
    },
    action: {
      flex: 1,
    },
  });
