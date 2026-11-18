import { View } from 'react-native';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import { Button } from '../Button';
import { currentPayPeriod, previousPayPeriod } from '../../lib/dashboard';
import { periodTitle } from '../../lib/payroll';
import { canDeleteWorkplace } from '../../lib/trash';
import { EnterChevron } from '../Chevrons';
import type { WorkplaceFormModel } from './useWorkplaceForm';

/** קבוצת "ניהול": ארכיון, אשפה ומה יימחק. */
export function ManageSection({ w }: { w: WorkplaceFormModel }) {
  const { router, styles, params, id, isEdit, saving, original, deletion, handleArchive, handleDelete } = w;
  return (
    <>
          <>
            {isEdit && original ? (
              // דוח השכר של מקום העבודה הזה — של התקופה האחרונה שהסתיימה.
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/payroll-report',
                    params: { wp: original.id, start: previousPayPeriod(original.payday).start },
                  })
                }
                accessibilityRole="link"
                style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.linkRowText}>
                  דוח השכר של מקום העבודה · {periodTitle(previousPayPeriod(original.payday))}
                </Text>
                <EnterChevron />
              </Pressable>
            ) : null}
        <View style={styles.actions}>
          {isEdit && deletion ? (
            canDeleteWorkplace(deletion) ? (
              <Button
                label={deletion.reports > 0 ? 'מחיקת מקום העבודה עם כל הדיווחים' : 'העברת מקום העבודה לאשפה'}
                variant="danger"
                onPress={handleDelete}
                disabled={saving}
              />
            ) : (
              <>
                <Button label="העברה לארכיון" variant="secondary" onPress={handleArchive} disabled={saving} />
                <Text style={styles.deleteNote}>
                  אי אפשר למחוק: {deletion.lockedPayrolls === 1 ? 'דוח שכר אחד נשלח' : `${deletion.lockedPayrolls} דוחות שכר נשלחו`} או שולמו.
                  {original?.demo ? '' : ' כדי למחוק, מבטלים בכל דוח את התשלום ואת השליחה.'}
                </Text>
                {original?.demo ? (
                  <Pressable
                    onPress={() => router.push('/data')}
                    accessibilityRole="link"
                    style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={styles.linkRowText}>זה מקום הדגמה — אפשר להסיר אותו ב"איפוס נתוני הדגמה"</Text>
                    <EnterChevron />
                  </Pressable>
                ) : null}
                {original
                  ? deletion.lockedPeriods.map((p) => {
                      const [y, m, d] = p.start.split('-').map(Number);
                      const period = currentPayPeriod(original.payday, new Date(y, m - 1, d));
                      return (
                        <Pressable
                          key={p.start}
                          onPress={() =>
                            router.push({ pathname: '/payroll-report', params: { wp: original.id, start: p.start } })
                          }
                          accessibilityRole="link"
                          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
                        >
                          <Text style={styles.linkRowText}>
                            דוח שכר {periodTitle(period)} · {p.paid ? 'שולם' : 'נשלח'}
                          </Text>
                          <EnterChevron />
                        </Pressable>
                      );
                    })
                  : null}
              </>
            )
          ) : null}
        </View>
          </>
    </>
  );
}
