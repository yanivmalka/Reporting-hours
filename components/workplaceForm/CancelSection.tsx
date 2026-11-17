import { SelectField } from '../SelectField';
import { CANCEL_PAY_LABELS, type CancelPayKind } from '../../lib/cancelReasons';
import { Text } from '../Text';
import { FormField } from '../FormField';
import { TextField } from '../TextField';
import type { WorkplaceFormModel } from './useWorkplaceForm';
import { CancelPayRow } from './shared';

/** קבוצת "ביטולים": תשלום על מפגש מבוטל לפי סיבה. */
export function CancelSection({ w }: { w: WorkplaceFormModel }) {
  const { styles, form, reasons, set, title } = w;
  return (
    <>
          <>
            <Text style={styles.courseMeta}>
              כמה המוסד משלם על מפגש שבוטל, לפי סיבת הביטול. את רשימת הסיבות עורכים ב"חגים וחופשות".
            </Text>
            {reasons
              .filter((r) => r.name.trim())
              .map((r) => {
                const row = form.cancelPay[r.id] ?? { kind: 'none' as CancelPayKind, value: '' };
                const setRow = (patch: Partial<CancelPayRow>) =>
                  set('cancelPay', { ...form.cancelPay, [r.id]: { ...row, ...patch } });
                return (
                  <FormField key={r.id} label={r.name.trim()}>
                    <SelectField<CancelPayKind>
                      title={`תשלום על ביטול — ${r.name.trim()}`}
                      value={row.kind}
                      options={(Object.keys(CANCEL_PAY_LABELS) as CancelPayKind[]).map((k) => ({
                        value: k,
                        label: CANCEL_PAY_LABELS[k],
                      }))}
                      onChange={(kind) => setRow({ kind })}
                    />
                    {row.kind === 'percent' || row.kind === 'fixed' ? (
                      <TextField
                        value={row.value}
                        onChangeText={(t) => setRow({ value: t.replace(/[^\d.]/g, '') })}
                        placeholder={row.kind === 'percent' ? 'אחוז מהשכר המתוכנן (למשל 50)' : 'סכום למפגש ב־₪'}
                        numeric
                      />
                    ) : null}
                  </FormField>
                );
              })}
          </>
    </>
  );
}
