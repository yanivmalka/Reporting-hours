import { RequireAccess } from '../components/Access';
import { Stack } from 'expo-router';
import { Animated, View } from 'react-native';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { reportWizardView, useReportWizard, type ReportWizard } from '../components/report/useReportWizard';
import { WizardStepper } from '../components/report/WizardStepper';
import { ReportContextCard } from '../components/report/ReportContextCard';
import { SessionDetailsCard } from '../components/report/SessionDetailsCard';
import { DateStep } from '../components/report/DateStep';
import { CourseStep } from '../components/report/CourseStep';
import { WorkplaceStep } from '../components/report/WorkplaceStep';
import { TimesStep } from '../components/report/TimesStep';
import { SummaryStep } from '../components/report/SummaryStep';
import { DoneStep } from '../components/report/DoneStep';
import { WizardNav } from '../components/report/WizardNav';
import { LeaveDialog } from '../components/report/LeaveDialog';
import { LoadingScreen } from '../components/LoadingScreen';

/**
 * אשף דיווח יום עבודה. הלוגיקה ב־components/report/useReportWizard.tsx, וכל שלב
 * ברכיב משלו ב־components/report/. כאן רק ההרכבה: מסכי טעינה / נעילה, מחוון
 * השלבים, השלב הנוכחי, הניווט והדיאלוגים.
 */
function ReportScreenInner() {
  const core = useReportWizard();
  const { workplaces, editing, editMissing, editId, lockedStart, styles, colors, router } = core;

  if (workplaces === null) {
    return <LoadingScreen />;
  }

  // עריכה: עד שהדיווח נטען — טעינה, לא אשף של דיווח חדש (שנפתח על תאריך אחר).
  if (editId && !editing) {
    if (!editMissing) return <LoadingScreen />;
    return (
      <Screen>
        <Stack.Screen options={{ title: 'עריכת דיווח' }} />
        <View style={styles.intro}>
          <Text style={styles.title}>הדיווח לא נמצא</Text>
          <Text style={styles.subtitle}>ייתכן שהוא נמחק או שעוד לא סונכרן למכשיר הזה.</Text>
        </View>
        <Button label="חזרה" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (editing && lockedStart) {
    return (
      <Screen>
        <View style={styles.intro}>
          <Text style={styles.title}>🔒 הדיווח נעול לעריכה</Text>
          <Text style={styles.subtitle}>
            הדוח לשכר של החודש הזה כבר נשלח או שולם. דוח שנשלח: כדי לערוך או למחוק, מבטלים קודם את
            השליחה (עם סיבה) ואז שולחים מחדש. דוח ששולם — נעול לצמיתות.
          </Text>
        </View>
        <Button
          label="לדוח השכר"
          onPress={() =>
            router.replace({
              pathname: '/payroll-report',
              params: { wp: editing.workplaceId, start: lockedStart },
            })
          }
        />
        <Button label="חזרה" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (workplaces.length === 0) {
    return (
      <Screen>
        <View style={styles.intro}>
          <Text style={styles.title}>דיווח יום עבודה</Text>
          <Text style={styles.subtitle}>
            כדי לדווח צריך קודם להגדיר לפחות מקום עבודה אחד.
          </Text>
        </View>
        <Button
          label="הוספת מקום עבודה"
          onPress={() => router.push('/workplace-form')}
        />
      </Screen>
    );
  }

  const w: ReportWizard = { ...core, ...reportWizardView({ ...core, workplaces }) };
  const { direct, step, pan, stepFade, confirm, sessionDialog, moveDialog } = w;

  return (
    <Screen keyboardFooter>
      {editId ? (
        <Stack.Screen options={{ title: 'עריכת דיווח' }} />
      ) : direct && step !== 'done' ? (
        <Stack.Screen options={{ title: 'דיווח מפגש' }} />
      ) : null}
      <WizardStepper w={w} />
      <ReportContextCard w={w} />
      <SessionDetailsCard w={w} />

      <Animated.View {...pan.panHandlers} style={[styles.swipeArea, stepFade]}>
        <DateStep w={w} />
        <CourseStep w={w} />
        <WorkplaceStep w={w} />
        <TimesStep w={w} />
        <SummaryStep w={w} />
        <DoneStep w={w} />
      </Animated.View>

      <WizardNav w={w} />
      <LeaveDialog w={w} />
      {confirm.dialog}
      {sessionDialog.dialog}
      {moveDialog.dialog}
    </Screen>
  );
}

/** מורשה בלי הרשאה מתאימה (docs/sharing-spec.md) רואה מסך "אין הרשאה". */
export default function ReportScreen() {
  return (
    <RequireAccess need="report">
      <ReportScreenInner />
    </RequireAccess>
  );
}
