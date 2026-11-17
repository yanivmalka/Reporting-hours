import { Modal, View } from 'react-native';
import { Text } from '../Text';
import { Button } from '../Button';
import type { ReportWizard } from './useReportWizard';

/** "לצאת בלי לשמור?" — כשיוצאים מהאשף עם נתונים שלא נשמרו. */
export function LeaveDialog({ w }: { w: ReportWizard }) {
  const { styles, navigation, pendingLeave, setPendingLeave } = w;
  return (
    <>
    <Modal
      transparent
      animationType="fade"
      visible={pendingLeave != null}
      onRequestClose={() => setPendingLeave(null)}
    >
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>לצאת בלי לשמור?</Text>
          <Text style={styles.dialogBody}>הנתונים שהוזנו בדיווח הזה יאבדו.</Text>
          <Button label="המשך עריכה" onPress={() => setPendingLeave(null)} />
          <Button
            label="יציאה בלי שמירה"
            variant="danger"
            onPress={() => {
              const action = pendingLeave;
              setPendingLeave(null);
              if (action) navigation.dispatch(action);
            }}
          />
        </View>
      </View>
    </Modal>
    </>
  );
}
