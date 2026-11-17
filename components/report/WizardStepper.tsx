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
            <View
              style={[
                styles.stepDot,
                (isDone || step === 'done') && styles.stepDotDone,
                isCurrent && styles.stepDotCurrent,
              ]}
            >
              <Text
                style={[
                  styles.stepNum,
                  (isDone || isCurrent || step === 'done') && styles.stepNumOn,
                ]}
              >
                {isDone || step === 'done' ? '✓' : i + 1}
              </Text>
            </View>
            <Text style={[styles.stepLabel, isCurrent && styles.stepLabelCurrent]}>
              {x.label}
            </Text>
          </View>
        );
      })}
    </View>
    )}
    </>
  );
}
