/**
 * עדכוני אפליקציה (אנדרואיד).
 *
 * - <UpdateProvider> — עוטף את האפליקציה; בפתיחה בודק בשקט אם פורסמה גרסה
 *   חדשה ב־GitHub Releases, ואם כן מציג חלון "עדכון זמין". ההורדה מתבצעת
 *   בתוך האפליקציה עם פס התקדמות, ובסיומה נפתח מתקין החבילות של אנדרואיד.
 * - <UpdateSection /> — אזור בתפריט הצד: הגרסה המותקנת + כפתור "בדיקת עדכונים".
 *
 * ב־web אין צורך — האתר נפרס מחדש אוטומטית — ולכן רק הגרסה מוצגת.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import {
  checkForUpdate,
  currentBuild,
  currentVersion,
  downloadApk,
  installApk,
  openReleasesPage,
  updatesSupported,
  type UpdateInfo,
} from '../lib/update';
import { radius, spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';
import { Button } from './Button';

type Phase =
  | { kind: 'idle' }
  | { kind: 'available'; info: UpdateInfo }
  | { kind: 'downloading'; info: UpdateInfo; progress: number }
  | { kind: 'ready'; info: UpdateInfo; fileUri: string }
  | { kind: 'error'; info: UpdateInfo };

type UpdateContextValue = {
  /** הצגת חלון העדכון עבור גרסה זמינה */
  offer: (info: UpdateInfo) => void;
};

const UpdateContext = createContext<UpdateContextValue>({ offer: () => {} });

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const offer = useCallback((info: UpdateInfo) => setPhase({ kind: 'available', info }), []);
  const value = useMemo(() => ({ offer }), [offer]);

  // בדיקה אוטומטית אחת בעליית האפליקציה. לא מציג דבר אם אין עדכון או אין רשת.
  useEffect(() => {
    if (!updatesSupported) return;
    let active = true;
    checkForUpdate()
      .then((info) => {
        if (active && info.available) offer(info);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [offer]);

  return (
    <UpdateContext.Provider value={value}>
      {children}
      <UpdateDialog phase={phase} setPhase={setPhase} />
    </UpdateContext.Provider>
  );
}

function UpdateDialog({
  phase,
  setPhase,
}: {
  phase: Phase;
  setPhase: (p: Phase) => void;
}) {
  const { t } = useI18n();
  const styles = useStyles(makeStyles);
  if (phase.kind === 'idle') return null;
  const { info } = phase;
  const close = () => setPhase({ kind: 'idle' });

  async function install(fileUri: string) {
    try {
      await installApk(fileUri);
    } catch {
      // ההרשאה טרם אושרה או שהמתקין נסגר — נשארים במצב "מוכן" לניסיון חוזר.
    }
  }

  async function start() {
    setPhase({ kind: 'downloading', info, progress: 0 });
    try {
      const fileUri = await downloadApk(info, (progress) =>
        setPhase({ kind: 'downloading', info, progress }),
      );
      setPhase({ kind: 'ready', info, fileUri });
      await install(fileUri);
    } catch {
      setPhase({ kind: 'error', info });
    }
  }

  const percent =
    phase.kind === 'downloading' ? Math.round(phase.progress * 100) : phase.kind === 'ready' ? 100 : 0;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{t('update.availableTitle')}</Text>

          {phase.kind === 'available' ? (
            <>
              <Text style={styles.body}>
                {t('update.availableBody', { version: info.latestVersion })}
              </Text>
              <Button label={t('update.install')} onPress={start} />
              <Button label={t('update.later')} variant="secondary" onPress={close} />
            </>
          ) : null}

          {phase.kind === 'downloading' || phase.kind === 'ready' ? (
            <>
              <Text style={styles.body}>
                {phase.kind === 'downloading'
                  ? t('update.downloading', { percent })
                  : t('update.installing')}
              </Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${percent}%` }]} />
              </View>
            </>
          ) : null}

          {phase.kind === 'ready' ? (
            <>
              <Text style={styles.hint}>{t('update.installHint')}</Text>
              <Button label={t('update.retryInstall')} onPress={() => install(phase.fileUri)} />
              <Button label={t('update.later')} variant="secondary" onPress={close} />
            </>
          ) : null}

          {phase.kind === 'error' ? (
            <>
              <Text style={styles.body}>{t('update.downloadFailed')}</Text>
              <Button label={t('update.retry')} onPress={start} />
              <Button
                label={t('update.openBrowser')}
                variant="secondary"
                onPress={() => {
                  void openReleasesPage();
                  close();
                }}
              />
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/** אזור "גרסה ועדכונים" לתפריט הצד. */
export function UpdateSection() {
  const { t } = useI18n();
  const styles = useStyles(makeStyles);
  const { offer } = useContext(UpdateContext);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleCheck() {
    setBusy(true);
    setStatus(null);
    try {
      const info = await checkForUpdate();
      if (info.available) offer(info);
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
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    dialog: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: spacing.lg,
      gap: spacing.md,
    },
    title: {
      fontSize: 18,
      fontWeight: '800',
      color: c.text,
      textAlign: layout.textStart,
    },
    body: {
      fontSize: 14,
      lineHeight: 21,
      color: c.text,
      textAlign: layout.textStart,
    },
    hint: {
      fontSize: 12,
      lineHeight: 18,
      color: c.textMuted,
      textAlign: layout.textStart,
    },
    track: {
      height: 10,
      borderRadius: 5,
      backgroundColor: c.brandLight,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      backgroundColor: c.brand,
    },
  });
