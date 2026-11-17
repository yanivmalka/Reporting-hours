import { View } from 'react-native';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import type { ReportWizard } from './useReportWizard';

/** אחרי שמירה: אישור וספירה לאחור לחזרה אוטומטית. */
export function DoneStep({ w }: { w: ReportWizard }) {
  const { styles, editId, step, lastSaved, countdown, setCountdown } = w;
  return (
    <>
    {/* ── נשמר ── */}
    {step === 'done' && lastSaved ? (
      <View style={styles.doneBox}>
        <Text style={styles.doneIcon}>✓</Text>
        <Text style={styles.doneTitle}>{editId ? 'הדיווח עודכן' : 'הדיווח נשמר'}</Text>
        <Text style={styles.doneText}>{lastSaved.text}</Text>
        {lastSaved.toast ? <Text style={styles.doneSub}>{lastSaved.toast}</Text> : null}
        {countdown != null ? (
          <View style={styles.countdown}>
            <Text style={styles.countdownText}>
              {editId ? 'חוזרים לתצוגת הדיווח' : 'חוזרים לדף הבית'} בעוד {countdown} שניות
            </Text>
            <Pressable onPress={() => setCountdown(null)} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.linkText}>להישאר כאן</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    ) : null}

    </>
  );
}
