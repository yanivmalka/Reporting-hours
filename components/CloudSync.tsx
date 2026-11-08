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
import { AppState, Platform, View } from 'react-native';
import { Text } from './Text';
import { Button } from './Button';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { ROLE_LABELS, leaveShare, listSharedWithMe } from '../lib/sharing';
import { useI18n } from '../lib/i18n';
import { cloudSupported, signInWithGoogle, signOutCloud, watchUser, type CloudUser } from '../lib/firebase';
import {
  cloudHasData,
  flush,
  getAccess,
  getSyncStatus,
  onAccessChange,
  onRemoteChange,
  onSyncStatus,
  pull,
  setSyncUser,
  switchAccount as switchSyncAccount,
  type SharedAccess,
  type SyncStatus,
} from '../lib/sync';
import { isDemoLoaded, onDataChanged, removeDemoData } from '../lib/demo';
import { loadProfile } from '../lib/profile';
import { spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

type SyncContextValue = {
  user: CloudUser | null;
  ready: boolean;
  status: SyncStatus;
  revision: number;
  /** חשבון של בעלים אחר שהמשתמש צופה בו (docs/sharing-spec.md). null — הנתונים שלו. */
  access: SharedAccess | null;
  /** ההרשאה לחשבון ששותף בוטלה, והאפליקציה חזרה לנתונים שלך (שם הבעלים, להודעה) */
  accessLost: string | null;
  dismissAccessLost: () => void;
  switchAccount: (a: SharedAccess | null) => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue>({
  user: null,
  ready: false,
  status: 'off',
  revision: 0,
  access: null,
  accessLost: null,
  dismissAccessLost: () => {},
  switchAccount: async () => {},
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
  const [access, setAccess] = useState<SharedAccess | null>(getAccess());
  const [accessLost, setAccessLost] = useState<string | null>(null);

  useEffect(() => onSyncStatus(setStatus), []);
  useEffect(
    () =>
      onAccessChange((a, lost) => {
        setAccess((prev) => {
          if (lost && prev) setAccessLost(prev.ownerName || prev.ownerEmail);
          return a;
        });
      }),
    [],
  );
  useEffect(
    () =>
      onRemoteChange(() => {
        void loadProfile(); // נתונים ממכשיר עם גרסה ישנה עלולים להחזיר את שדה הת״ז
        setRevision((r) => r + 1);
      }),
    [],
  );

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
          await loadProfile(); // מנקה שדות שהוסרו (ת״ז) גם מהעותק שהגיע מהענן
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
  const switchAccount = useCallback(async (a: SharedAccess | null) => {
    setAccessLost(null);
    await switchSyncAccount(a);
    // גם כשלא השתנו נתונים (חשבון ריק) — המסכים נטענים מחדש בהקשר החדש.
    setRevision((r) => r + 1);
  }, []);
  const dismissAccessLost = useCallback(() => setAccessLost(null), []);

  const value = useMemo(
    () => ({ user, ready, status, revision, access, accessLost, dismissAccessLost, switchAccount, signIn, signOut }),
    [user, ready, status, revision, access, accessLost, dismissAccessLost, switchAccount, signIn, signOut],
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

/**
 * בורר חשבון הנתונים בתפריט הצד (docs/sharing-spec.md): "הנתונים שלי" וכל
 * חשבון ששותף עם המשתמש. מוצג רק כשיש חשבונות כאלה.
 */
export function AccountSwitcher({ onSwitched }: { onSwitched?: () => void }) {
  const styles = useStyles(makeSwitcherStyles);
  const { user, access, switchAccount } = useCloudSync();
  const [list, setList] = useState<SharedAccess[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setList([]);
      return;
    }
    let alive = true;
    listSharedWithMe()
      .then((l) => alive && setList(l))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user, access]);

  if (!user || (list.length === 0 && !access)) return null;

  async function go(a: SharedAccess | null) {
    const id = a?.ownerUid ?? 'me';
    if ((access?.ownerUid ?? 'me') === id) return;
    setBusy(id);
    setError(null);
    try {
      await switchAccount(a);
      onSwitched?.();
    } catch {
      setError('המעבר נכשל — ייתכן שההרשאה בוטלה או שאין חיבור לרשת.');
    } finally {
      setBusy(null);
    }
  }

  const rows: { id: string; label: string; sub: string; a: SharedAccess | null }[] = [
    { id: 'me', label: 'הנתונים שלי', sub: user.email ?? '', a: null },
    ...list.map((a) => ({ id: a.ownerUid, label: a.ownerName || a.ownerEmail, sub: ROLE_LABELS[a.role], a })),
  ];
  const current = access?.ownerUid ?? 'me';
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>חשבון</Text>
      {rows.map((r) => (
        <Pressable
          key={r.id}
          onPress={() => void go(r.a)}
          accessibilityRole="radio"
          accessibilityState={{ selected: r.id === current }}
          style={({ pressed }) => [styles.row, r.id === current && styles.rowOn, pressed && styles.pressed]}
        >
          <Icon
            name={r.id === current ? 'radiobox-marked' : 'radiobox-blank'}
            size={20}
            color={r.id === current ? styles.on.color : styles.off.color}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {busy === r.id ? 'עובר…' : r.label}
            </Text>
            {r.sub ? (
              <Text style={styles.sub} numberOfLines={1}>
                {r.sub}
              </Text>
            ) : null}
          </View>
          {r.a ? (
            <Pressable
              hitSlop={8}
              onPress={() => {
                const owner = r.a!;
                void (async () => {
                  try {
                    if (access?.ownerUid === owner.ownerUid) await switchAccount(null);
                    await leaveShare(owner.ownerUid);
                    setList((l) => l.filter((x) => x.ownerUid !== owner.ownerUid));
                  } catch {
                    setError('העזיבה נכשלה. נסו שוב.');
                  }
                })();
              }}
            >
              <Text style={styles.leave}>עזיבה</Text>
            </Pressable>
          ) : null}
        </Pressable>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function makeSwitcherStyles(c: ColorScheme, layout: StyleLayout) {
  return {
    wrap: { gap: 2, paddingBottom: spacing.sm },
    label: {
      fontSize: 13,
      fontWeight: '700' as const,
      color: c.textMuted,
      textAlign: layout.textStart,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: 10,
    },
    rowOn: { backgroundColor: c.brandLight },
    pressed: { opacity: 0.7 },
    on: { color: c.brand },
    off: { color: c.textMuted },
    name: { fontSize: 15, color: c.text, textAlign: layout.textStart },
    sub: { fontSize: 12, color: c.textMuted, textAlign: layout.textStart },
    leave: { fontSize: 13, color: c.dangerText },
    error: { fontSize: 13, color: c.danger, textAlign: layout.textStart, paddingHorizontal: spacing.md },
  };
}
