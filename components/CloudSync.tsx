/**
 * חשבון גוגל וסנכרון ענן — צד ה־React.
 *
 * SyncProvider מאזין להתחברות, מפעיל משיכה מהענן בהתחברות ובכל חזרה ללשונית,
 * וכשהמשיכה שינתה נתונים במכשיר מגדיל את `revision` — RootLayout נותן אותו
 * כ־key לעץ המסכים, כך שכל המסכים נטענים מחדש עם הנתונים המעודכנים.
 *
 * AccountSection — הקטע בתפריט הצד: התחברות / פרטי החשבון / מצב הסנכרון / התנתקות.
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
import { AppState, Platform, Text, View } from 'react-native';
import { Button } from './Button';
import { useI18n } from '../lib/i18n';
import { cloudSupported, signInWithGoogle, signOutCloud, watchUser, type CloudUser } from '../lib/firebase';
import { cloudHasData, flush, getSyncStatus, onRemoteChange, onSyncStatus, pull, setSyncUser, type SyncStatus } from '../lib/sync';
import { isDemoLoaded, onDataChanged, removeDemoData } from '../lib/demo';
import { spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

type SyncContextValue = {
  user: CloudUser | null;
  ready: boolean;
  status: SyncStatus;
  revision: number;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue>({
  user: null,
  ready: false,
  status: 'off',
  revision: 0,
  signIn: async () => {},
  signOut: async () => {},
});

export function useCloudSync(): SyncContextValue {
  return useContext(SyncContext);
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [ready, setReady] = useState(!cloudSupported);
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  const [revision, setRevision] = useState(0);

  useEffect(() => onSyncStatus(setStatus), []);
  useEffect(() => onRemoteChange(() => setRevision((r) => r + 1)), []);

  useEffect(
    () =>
      watchUser((u) => {
        setUser(u);
        setReady(true);
        void (async () => {
          // מכשיר חדש שטען אוטומטית נתוני הדגמה, וחשבון שכבר יש לו נתונים בענן:
          // מסירים את ההדגמה כדי שהנתונים האמיתיים ייטענו (הסרה מפעילה משיכה).
          await setSyncUser(u);
          if (u && (await isDemoLoaded()) && (await cloudHasData())) await removeDemoData();
        })();
      }),
    [],
  );

  // חזרה ללשונית (אתר) או לאפליקציה (אנדרואיד) — בודקים אם יש שינויים ממכשיר אחר.
  useEffect(() => {
    if (!cloudSupported || !user) return;
    if (Platform.OS === 'web') {
      const onVisible = () => {
        if (document.visibilityState === 'visible') void pull();
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => document.removeEventListener('visibilitychange', onVisible);
    }
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void pull();
      else void flush(); // יוצאים מהאפליקציה — דוחפים מיד את מה שממתין
    });
    return () => sub.remove();
  }, [user]);

  // הסרת נתוני הדגמה / איפוס — מחדשים את הסנכרון.
  useEffect(() => onDataChanged(() => void pull()), []);

  const signIn = useCallback(async () => {
    await signInWithGoogle();
  }, []);
  const signOut = useCallback(async () => {
    await signOutCloud();
  }, []);

  const value = useMemo(
    () => ({ user, ready, status, revision, signIn, signOut }),
    [user, ready, status, revision, signIn, signOut],
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

const TEXT = {
  he: {
    section: 'חשבון וסנכרון',
    intro: 'התחברות עם חשבון גוגל שומרת את הנתונים בשרת ומסנכרנת אותם בין המחשב לטלפון.',
    signIn: 'התחברות עם Google',
    signOut: 'התנתקות',
    signedInAs: 'מחובר בתור',
    nativeNote: 'סנכרון ענן אינו זמין במכשיר זה. הנתונים נשמרים במכשיר בלבד.',
    failed: 'ההתחברות נכשלה. נסו שוב.',
    status: {
      off: '',
      syncing: 'מסנכרן…',
      synced: 'הנתונים מסונכרנים',
      'paused-demo': 'נתוני הדגמה טעונים — הסנכרון מושהה עד להסרתם (מסך "נתונים").',
      error: 'שגיאת סנכרון. הנתונים שמורים במכשיר וינוסה שוב.',
    } as Record<SyncStatus, string>,
  },
  en: {
    section: 'Account & sync',
    intro: 'Sign in with Google to keep your data on the server and sync it between computer and phone.',
    signIn: 'Sign in with Google',
    signOut: 'Sign out',
    signedInAs: 'Signed in as',
    nativeNote: 'Cloud sync is not available on this device. Data stays on this device only.',
    failed: 'Sign-in failed. Please try again.',
    status: {
      off: '',
      syncing: 'Syncing…',
      synced: 'Data is synced',
      'paused-demo': 'Demo data is loaded — sync is paused until it is removed ("Data" screen).',
      error: 'Sync error. Your data is saved on this device and will be retried.',
    } as Record<SyncStatus, string>,
  },
};

export function AccountSection() {
  const { lang } = useI18n();
  const tx = lang === 'he' ? TEXT.he : TEXT.en;
  const styles = useStyles(makeStyles);
  const { user, ready, status, signIn, signOut } = useCloudSync();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code ?? '';
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') setError(tx.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.label}>{tx.section}</Text>
      {!cloudSupported ? (
        <Text style={styles.text}>{tx.nativeNote}</Text>
      ) : !ready ? null : user ? (
        <>
          <Text style={styles.text}>
            {tx.signedInAs} {user.name || user.email}
            {user.name && user.email ? `\n${user.email}` : ''}
          </Text>
          {tx.status[status] ? (
            <Text style={[styles.text, status === 'error' && styles.error]}>{tx.status[status]}</Text>
          ) : null}
          <Button label={tx.signOut} variant="secondary" loading={busy} onPress={() => void run(signOut)} />
        </>
      ) : (
        <>
          <Text style={styles.text}>{tx.intro}</Text>
          <Button label={tx.signIn} loading={busy} onPress={() => void run(signIn)} />
        </>
      )}
      {error ? <Text style={[styles.text, styles.error]}>{error}</Text> : null}
    </View>
  );
}

function makeStyles(c: ColorScheme, layout: StyleLayout) {
  return {
    section: { gap: spacing.sm },
    label: {
      fontSize: 13,
      fontWeight: '700' as const,
      color: c.textMuted,
      textAlign: layout.textStart,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    text: { fontSize: 14, color: c.text, textAlign: layout.textStart, lineHeight: 20 },
    error: { color: c.danger },
  };
}
