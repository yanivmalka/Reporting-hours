import { View } from 'react-native';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import { formatShekels } from '../../lib/travel';
import { ARRIVAL_MODE_LABELS } from '../../lib/workplaces';
import type { ReportWizard } from './useReportWizard';

/** שלב 2ב: בחירת מקום עבודה (דיווח שלא לפי קורס). */
export function WorkplaceStep({ w }: { w: ReportWizard }) {
  const { styles, colorOf, step, workplaceId, workplace, pickable, chooseWorkplace } = w;
  return (
    <>
    {/* ── 2ב. מקום עבודה ── */}
    {step === 'workplace' ? (
      <>
        <Text style={styles.stepTitle}>באיזה מקום עבודה?</Text>
        <View style={styles.choices}>
          {pickable.map((w) => {
            const selected = w.id === workplaceId;
            return (
              <Pressable
                key={w.id}
                onPress={() => chooseWorkplace(w.id)}
                style={[
                  styles.choice,
                  selected && styles.choiceSelected,
                  { borderStartWidth: 5, borderStartColor: colorOf(w) },
                ]}
                accessibilityRole="button"
              >
                <View style={styles.choiceBody}>
                  <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                    {w.name}
                  </Text>
                  <Text style={[styles.choiceSub, selected && styles.choiceSubSelected]}>
                    {w.paymentType === 'monthly'
                      ? `משכורת חודשית ${formatShekels(w.rate)}`
                      : `${formatShekels(w.rate)} לשעה`}
                    {' · '}
                    {ARRIVAL_MODE_LABELS[w.arrivalMode]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </>
    ) : null}

    </>
  );
}
