import { View } from 'react-native';
import { Text } from '../Text';
import type { ReportWizard } from './useReportWizard';

/** מחוון השלבים: תאריך · קורס · שעות · סיכום (לא בכניסה ישירה). */
export function WizardStepper({ w }: { w: ReportWizard }) {
  const { styles, direct, step, STEPS, stepIndex } = w;
  return (
    <>
    {direct ? null : (
    <View style={styles.stepper}>
      {STEPS.map((x, i) => {
        const isDone = i < stepIndex && step !== 'done';
        const isCurrent = i === stepIndex;
        return (
          <View key={x.label} style={styles.stepItem}>
            {/* פס התקדמות לכל שלב — מלא בשלב שהושלם ובשלב הנוכחי */}
            <View style={[styles.stepBar, (isDone || isCurrent || step === 'done') && styles.stepBarOn]} />
            <Text style={[styles.stepLabel, isCurrent && styles.stepLabelCurrent]} numberOfLines={1}>
              {i + 1} · {x.label}
            </Text>
          </View>
        );
      })}
    </View>
    )}
    </>
  );
}
