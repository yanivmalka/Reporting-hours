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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { feedback } from '../lib/feedback';
import { StyleSheet } from 'react-native';
import { Text } from './Text';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';
import { Button } from './Button';
import { Dialog } from './Dialog';

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
  // הודעת אזהרה — צליל ורטט עדינים (lib/feedback.ts), לפי ההגדרה.
  useEffect(() => {
    feedback(request.destructive === false ? 'menu' : 'warn');
  }, [request]);
  // הפעולה הראשית למעלה, והביטול מתחתיה — בתחתית הקבועה של הדיאלוג.
  return (
    <Dialog
      title={request.title}
      onClose={onCancel}
      maxWidth={400}
      alert
      actions={[
        <Button
          key="ok"
          label={request.confirmLabel ?? 'מחיקה'}
          variant={request.destructive === false ? 'primary' : 'danger'}
          onPress={onConfirm}
          loading={busy}
        />,
        <Button key="cancel" label={request.cancelLabel ?? 'ביטול'} variant="secondary" onPress={onCancel} disabled={busy} />,
      ]}
    >
      {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
    </Dialog>
  );
}

const makeStyles = (c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
    message: {
      fontSize: 14,
      lineHeight: 21,
      color: c.textMuted,
      textAlign: layout.textStart,
    },
  });
