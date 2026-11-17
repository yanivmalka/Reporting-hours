import { EnterChevron } from '../Chevrons';
import { View } from 'react-native';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import { longDate } from '../DatePicker';
import { basisFor } from '../../lib/payBasis';
import { timeRange } from '../../lib/courses';
import { formatShekels, hasTravelCost } from '../../lib/travel';
import { ARRIVAL_MODE_LABELS, paymentTermsLabel, taxPercentOf } from '../../lib/workplaces';
import type { ReportWizard } from './useReportWizard';

/** שורת הקשר בשלבי השעות והסיכום: מקום העבודה, הקורס, התאריך והתנאים. לחיצה — לדף מקום העבודה. */
export function ReportContextCard({ w }: { w: ReportWizard }) {
  const { router, styles, colorOf, basis, step, date, workplace, selectedCourse, wAt } = w;
  const context =
    (step === 'times' || step === 'summary') && wAt ? (
      <Pressable
        onPress={() => workplace && router.push({ pathname: '/workplace', params: { id: workplace.id } })}
        accessibilityRole="button"
        accessibilityLabel={`מעבר לדף ${wAt.name}`}
        style={({ pressed }) => [
          styles.context,
          styles.contextRow,
          { borderStartWidth: 5, borderStartColor: colorOf(workplace) },
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={styles.contextTexts}>
        <Text style={styles.contextMain}>{wAt.name}</Text>
        {selectedCourse ? (
          <Text style={styles.contextCourse}>
            {selectedCourse.name} · {timeRange(selectedCourse.start, selectedCourse.end)}
          </Text>
        ) : null}
        <Text style={styles.contextSub}>{longDate(date)}</Text>
        <Text style={styles.contextSub}>
          {wAt.paymentType === 'monthly'
            ? `משכורת חודשית ${formatShekels(wAt.rate)}`
            : `${formatShekels(wAt.rate)} לשעה ${basisFor(workplace, basis) === 'academic' ? 'אקדמית' : ''}`}
          {' · '}
          {hasTravelCost(wAt)
            ? `נסיעות: תחבורה ציבורית ${formatShekels(wAt.travelCostPerDirection)} × ${wAt.tripsPerDay} ליום`
            : `נסיעות: ${ARRIVAL_MODE_LABELS[wAt.arrivalMode]} — ללא החזר`}
        </Text>
        <Text style={styles.contextSub}>
          {paymentTermsLabel(wAt)}
          {taxPercentOf(wAt) > 0 ? ` · מס ${taxPercentOf(wAt)}%` : ''}
          {wAt.employeeNumber ? ` · מספר עובד ${wAt.employeeNumber}` : ''}
        </Text>
        </View>
        <EnterChevron />
      </Pressable>
    ) : null;
  return context;
}
