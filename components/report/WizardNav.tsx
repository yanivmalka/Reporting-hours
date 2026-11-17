import { View } from 'react-native';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import { Button } from '../Button';
import { updateReport } from '../../lib/reports';
import type { ReportWizard } from './useReportWizard';

/** כפתורי הניווט בתחתית: הבא / חזרה / שמירה, וקישורי ביטול והעברת מפגש. */
export function WizardNav({ w }: { w: ReportWizard }) {
  const { router, styles, editId, direct, editing, setEditing, moveDialog, extraKind, step, setExitReason, date, setDate, saving, setCountdown, handleSave, selectedCourse, goNext, goBack, anotherReport, leave, cancelSession, cancelEditedSession } = w;
  return (
    <>
    {/* ── ניווט ── */}
    {step === 'done' ? (
      <View style={styles.nav}>
        {editId ? (
          <Button label="חזרה לדיווח" onPress={() => { setCountdown(null); router.back(); }} />
        ) : (
          <Button label="דיווח נוסף" onPress={anotherReport} />
        )}
        <Button
          label="ללוח הבקרה"
          variant="secondary"
          onPress={() => {
            setCountdown(null);
            router.replace('/dashboard');
          }}
        />
        <Pressable
          onPress={() => {
            setCountdown(null);
            router.replace({ pathname: '/reports', params: { tab: 'reports' } });
          }}
          style={styles.cancel}
        >
          <Text style={styles.cancelText}>ליומן</Text>
        </Pressable>
      </View>
    ) : (
      <View style={styles.nav}>
        {direct ? (
          <Button label="שמירה" onPress={handleSave} loading={saving} />
        ) : step === 'summary' ? (
          <Button label="שמירת הדיווח" onPress={handleSave} loading={saving} />
        ) : step === 'date' || step === 'times' ? (
          <Button label="המשך" onPress={goNext} />
        ) : null}
        {/* כפתור משני אחד: "ביטול" (כניסה ישירה, או שלב 1) או "חזרה" לשלב הקודם — אף פעם לא שניהם */}
        {direct || step === 'date' ? (
          <Button label="ביטול" variant="secondary" onPress={leave} />
        ) : (
          <Button label="חזרה" variant="secondary" onPress={goBack} />
        )}
        {(step === 'times' || step === 'summary') && selectedCourse && !extraKind && (!editId || editing) ? (
          <>
            <View style={styles.linkRow}>
              <Text style={styles.linkLead}>השיעור לא התקיים?</Text>
              <Pressable
                onPress={() =>
                  editing ? cancelEditedSession(editing, selectedCourse) : cancelSession(selectedCourse, true)
                }
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={styles.linkText}>סימון כבוטל</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() =>
                moveDialog.open({
                  course: selectedCourse,
                  date: editing ? editing.date : date,
                  // בעריכה: השיעור הועבר — הדיווח עובר איתו לתאריך החדש.
                  onDone: editing
                    ? async (to: string) => {
                        const moved = { ...editing, date: to };
                        await updateReport(editing.id, moved);
                        setEditing(moved);
                        setDate(to);
                      }
                    : () => setExitReason('cancelled'),
                })
              }
              accessibilityRole="button"
              style={styles.linkBtn}
            >
              <Text style={styles.linkText}>העברת השיעור לתאריך אחר</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    )}
    </>
  );
}
