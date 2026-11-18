import { Text } from '../Text';
import { Button } from '../Button';
import { Dialog } from '../Dialog';
import type { ReportWizard } from './useReportWizard';

/** "לצאת בלי לשמור?" — כשיוצאים מהאשף עם נתונים שלא נשמרו. */
export function LeaveDialog({ w }: { w: ReportWizard }) {
  const { styles, navigation, pendingLeave, setPendingLeave } = w;
  return (
    <Dialog
      visible={pendingLeave != null}
      onClose={() => setPendingLeave(null)}
      title="לצאת בלי לשמור?"
      actions={[
        <Button key="stay" label="המשך עריכה" onPress={() => setPendingLeave(null)} />,
        <Button
          key="leave"
          label="יציאה בלי שמירה"
          variant="danger"
          onPress={() => {
            const action = pendingLeave;
            setPendingLeave(null);
            if (action) navigation.dispatch(action);
          }}
        />,
      ]}
    >
      <Text style={styles.dialogBody}>הנתונים שהוזנו בדיווח הזה יאבדו.</Text>
    </Dialog>
  );
}
