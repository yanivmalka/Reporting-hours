/**
 * עדכוני אפליקציה (אנדרואיד).
 *
 * - <UpdateProvider> — עוטף את האפליקציה (מעל SyncedTree, כדי שמשיכה מהענן לא תסגור אותו); בפתיחה
 *   בודק בשקט אם פורסמה גרסה חדשה ב־GitHub Releases, ואם כן מציג חלון "עדכון זמין". ההורדה מתבצעת
 *   בתוך האפליקציה עם פס התקדמות (lib/update.ts: יציאה מהאפליקציה משהה וחזרה ממשיכה מאותה נקודה),
 *   אפשר להמשיך אותה ברקע, ובסיומה נפתח מתקין החבילות של אנדרואיד.
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
import { Animated, Modal, StyleSheet, View } from 'react-native';
import { Text } from './Text';
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
import { useFade } from './useFlash';

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
  /** "להמשיך ברקע": החלון מוסתר בזמן ההורדה, וחוזר כשהיא מסתיימת (או נכשלת). */
  const [hidden, setHidden] = useState(false);
  const offer = useCallback((info: UpdateInfo) => {
    setHidden(false);
    // הורדה של אותה גרסה כבר רצה — החלון חוזר אליה (ההתקדמות תתעדכן בדיווח הבא).
    setPhase((p) => (p.kind === 'downloading' && p.info.latestBuild === info.latestBuild ? p : { kind: 'available', info }));
  }, []);
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
      <UpdateDialog phase={phase} setPhase={setPhase} hidden={hidden} setHidden={setHidden} />
    </UpdateContext.Provider>
  );
}

function UpdateDialog({
  phase,
  setPhase,
  hidden,
  setHidden,
}: {
  phase: Phase;
  setPhase: (p: Phase) => void;
  hidden: boolean;
  setHidden: (h: boolean) => void;
}) {
  const { t } = useI18n();
  const styles = useStyles(makeStyles);
  if (phase.kind === 'idle') return null;
  if (hidden && phase.kind === 'downloading') return null;
  const { info } = phase;
  const close = () => (phase.kind === 'downloading' ? setHidden(true) : setPhase({ kind: 'idle' }));

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
      setHidden(false);
      setPhase({ kind: 'ready', info, fileUri });
      await install(fileUri);
    } catch {
      setHidden(false);
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

          {phase.kind === 'downloading' ? (
            <>
              <Text style={styles.hint}>{t('update.pausedHint')}</Text>
              <Button label={t('update.background')} variant="secondary" onPress={() => setHidden(true)} />
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

/**
 * אזור "גרסה ועדכונים" לתפריט הצד: שורה קבועה "✓ יש לך את הגרסה העדכנית
 * ביותר". בבדיקה — סמל טעינה ו"בודק…" בכפתור; בסיום הסמל נעלם והשורה
 * מהבהבת לרגע, או מתחלפת ל"גרסה X זמינה" עם כפתור "עדכון".
 */
export function UpdateSection() {
  const { t } = useI18n();
  const styles = useStyles(makeStyles);
  const { offer } = useContext(UpdateContext);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<UpdateInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [checks, setChecks] = useState(0);
  const flash = useFade(checks, 500);

  async function handleCheck() {
    setBusy(true);
    setFailed(false);
    try {
      const info = await checkForUpdate();
      setAvailable(info.available ? info : null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setChecks((n) => n + 1);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.label}>{t('update.section')}</Text>
      <Text style={styles.text}>
        {t('update.current', { version: currentVersion(), build: currentBuild() })}
      </Text>
      {updatesSupported ? (
        <>
          <Animated.View style={[styles.statusRow, flash]}>
            {available ? (
              <>
                <Text style={[styles.text, styles.statusAvailable]}>גרסה {available.latestVersion} זמינה</Text>
                <View style={styles.statusAction}>
                  <Button label="עדכון" onPress={() => offer(available)} />
                </View>
              </>
            ) : failed ? (
              <Text style={styles.text}>{t('update.failed')}</Text>
            ) : (
              <Text style={[styles.text, styles.statusOk]}>✓ יש לך את הגרסה העדכנית ביותר</Text>
            )}
          </Animated.View>
          <Button
            label={t('update.check')}
            loadingLabel="בודק…"
            variant="secondary"
            onPress={handleCheck}
            loading={busy}
          />
        </>
      ) : (
        <Text style={styles.text}>{t('update.webNote')}</Text>
      )}
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
    statusRow: { flexDirection: layout.rowStart, alignItems: 'center', gap: spacing.sm, minHeight: 24 },
    statusOk: { color: c.success, fontWeight: '700' },
    statusAvailable: { flex: 1, color: c.brand, fontWeight: '700' },
    statusAction: { minWidth: 96 },
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
