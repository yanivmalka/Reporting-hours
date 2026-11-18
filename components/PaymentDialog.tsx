/**
 * עדכון תשלום לדוח שכר: תאריך קבלה וסכום שהתקבל.
 * הסכום מוצע מראש: הסכום לתשלום בניכוי אחוז המס של מקום העבודה — וניתן לעריכה.
 */
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from './Text';
import { todayISO } from '../lib/time';
import { formatShekels } from '../lib/travel';
import { TEXT_RIGHT } from '../theme/align';
import { useThemedStyles } from '../theme/useThemedStyles';
import type { AppColors } from '../theme/colors';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { DateField } from './DatePicker';
import { FormField } from './FormField';
import { TextField } from './TextField';

type Props = {
  visible: boolean;
  title: string;
  gross: number;
  net: number;
  taxPercent: number;
  initialDate?: string;
  initialAmount?: number;
  onSave: (date: string, amount: number) => void;
  onClear?: () => void;
  onClose: () => void;
};

export function PaymentDialog({
  visible,
  title,
  gross,
  net,
  taxPercent,
  initialDate,
  initialAmount,
  onSave,
  onClear,
  onClose,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const [date, setDate] = useState(initialDate ?? todayISO());
  const [amount, setAmount] = useState(String(initialAmount ?? net));

  useEffect(() => {
    if (visible) {
      setDate(initialDate ?? todayISO());
      setAmount(String(initialAmount ?? net));
    }
  }, [visible, initialDate, initialAmount, net]);

  const value = Number(amount.replace(',', '.'));
  const valid = Number.isFinite(value) && value >= 0;

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={title}
      maxWidth={420}
      head={
        <Text style={styles.sub}>
          לתשלום {formatShekels(gross)} ברוטו
          {taxPercent > 0 ? ` · בניכוי מס ${taxPercent}% ≈ ${formatShekels(net)}` : ''}
        </Text>
      }
      actions={[
        <Button key="save" label="שמירה — שולם" onPress={() => valid && onSave(date, value)} disabled={!valid} />,
        ...(onClear ? [<Button key="clear" label="ביטול סימון התשלום" variant="danger" onPress={onClear} />] : []),
        <Button key="close" label="סגירה" variant="secondary" onPress={onClose} />,
      ]}
    >
      <FormField label="תאריך קבלת התשלום">
        <DateField value={date} onChange={setDate} />
      </FormField>
      <FormField label="סכום שהתקבל (₪)" error={valid ? undefined : 'סכום לא תקין'}>
        <TextField value={amount} onChangeText={setAmount} numeric invalid={!valid} />
      </FormField>
    </Dialog>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    sub: { fontSize: 13, color: colors.textMuted, textAlign: TEXT_RIGHT },
  });
