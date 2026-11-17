import { Animated } from 'react-native';
import { FormField } from '../FormField';
import { TextField } from '../TextField';
import type { WorkplaceFormModel } from './useWorkplaceForm';

/** קבוצת "דוחות שכר": מייל מחלקת השכר והעתקים. */
export function PayrollSection({ w }: { w: WorkplaceFormModel }) {
  const { styles, form, errors, set, highlightBg } = w;
  return (
    <>
          <Animated.View style={[styles.highlight, { backgroundColor: highlightBg }]}>
          <FormField
            label="מייל לשכר"
            hint="לכתובת זו נשלח דוח השעות החודשי (מסך דוחות שכר)"
            error={errors.payrollEmail}
          >
            <TextField
              value={form.payrollEmail}
              onChangeText={(t) => set('payrollEmail', t)}
              placeholder="payroll@college.ac.il"
              email
              invalid={Boolean(errors.payrollEmail)}
            />
          </FormField>

          <FormField label="העתק (CC)" hint="אפשר כמה כתובות, מופרדות בפסיק" error={errors.ccEmails}>
            <TextField
              value={form.ccEmails}
              onChangeText={(t) => set('ccEmails', t)}
              placeholder="coordinator@college.ac.il, ..."
              email
              invalid={Boolean(errors.ccEmails)}
            />
          </FormField>
          </Animated.View>
    </>
  );
}
