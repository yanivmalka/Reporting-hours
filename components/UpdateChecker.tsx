/**
 * עדכוני אפליקציה (אנדרואיד).
 *
 * - <UpdateChecker /> — נטען פעם אחת בשורש האפליקציה; בפתיחה בודק בשקט אם
 *   פורסמה גרסה חדשה ב־GitHub Releases, ואם כן מציג חלון "עדכון זמין".
 * - <UpdateSection /> — אזור בתפריט הצד: הגרסה המותקנת + כפתור "בדיקת עדכונים".
 *
 * ב־web אין צורך — האתר נפרס מחדש אוטומטית — ולכן רק הגרסה מוצגת.
 */
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import {
  checkForUpdate,
  currentBuild,
  currentVersion,
  openUpdate,
  updatesSupported,
  type UpdateInfo,
} from '../lib/update';
import { spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';
import { Button } from './Button';

function useUpdatePrompt() {
  const { t } = useI18n();
  return (info: UpdateInfo) =>
    Alert.alert(
      t('update.availableTitle'),
      t('update.availableBody', { version: info.latestVersion }),
      [
        { text: t('update.later'), style: 'cancel' },
        { text: t('update.install'), onPress: () => void openUpdate(info) },
      ],
    );
}

/** בדיקה אוטומטית אחת בעליית האפליקציה. לא מציג דבר אם אין עדכון או אין רשת. */
export function UpdateChecker() {
  const prompt = useUpdatePrompt();
  useEffect(() => {
    if (!updatesSupported) return;
    let active = true;
    checkForUpdate()
      .then((info) => {
        if (active && info.available) prompt(info);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** אזור "גרסה ועדכונים" לתפריט הצד. */
export function UpdateSection() {
  const { t } = useI18n();
  const styles = useStyles(makeStyles);
  const prompt = useUpdatePrompt();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleCheck() {
    setBusy(true);
    setStatus(null);
    try {
      const info = await checkForUpdate();
      if (info.available) prompt(info);
      else setStatus(t('update.upToDate'));
    } catch {
      setStatus(t('update.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.label}>{t('update.section')}</Text>
      <Text style={styles.text}>
        {t('update.current', { version: currentVersion(), build: currentBuild() })}
      </Text>
      {updatesSupported ? (
        <Button
          label={busy ? t('update.checking') : t('update.check')}
          variant="secondary"
          onPress={handleCheck}
          loading={busy}
        />
      ) : (
        <Text style={styles.text}>{t('update.webNote')}</Text>
      )}
      {status ? <Text style={styles.text}>{status}</Text> : null}
    </View>
  );
}

const makeStyles = (c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
    section: {
      gap: spacing.sm,
    },
    label: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      textAlign: layout.textStart,
      letterSpacing: 0.5,
    },
    text: {
      fontSize: 13,
      color: c.text,
      textAlign: layout.textStart,
    },
  });
