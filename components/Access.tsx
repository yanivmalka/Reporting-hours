/**
 * שיתוף החשבון בצד הממשק (docs/sharing-spec.md).
 *
 * - useAccess — מה מותר בחשבון הנתונים הפעיל (שלך, או של בעלים ששיתף איתך),
 *   ובמצב צפייה בלבד (lib/viewOnly.ts) — בלי דיווח ובלי עריכה.
 * - BlockedWriteNotice — הודעה קופצת כששינוי לא נשמר כי הרמה לא מתירה אותו.
 * - NoAccess / RequireAccess — מסך חלופי למסכים שהרמה לא מתירה.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Text } from './Text';
import { Button } from './Button';
import { Screen } from './Screen';
import { useToast } from './Toast';
import { useCloudSync } from './CloudSync';
import { onBlockedWrite, type ShareRole } from '../lib/sync';
import { ROLE_LABELS } from '../lib/sharing';
import { setViewOnly, useViewOnly } from '../lib/viewOnly';
import { spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

export type AccessLevel = 'owner' | ShareRole;

export type Access = {
  level: AccessLevel;
  /** צופים בנתונים של אחר */
  shared: boolean;
  ownerName: string;
  /** דיווח, עריכה ומחיקה של דיווחים, ביטול והעברת מפגשים */
  canReport: boolean;
  /** מקומות עבודה, קורסים, חופשות, דוחות שכר והגדרות */
  canEdit: boolean;
  /** גיבויים, ניהול נתונים וניהול הרשאות */
  isOwner: boolean;
  /** מצב צפייה בלבד שהמשתמש בחר (כבה את canReport ו־canEdit) */
  viewOnly: boolean;
};

export function useAccess(): Access {
  const { access } = useCloudSync();
  const viewOnly = useViewOnly();
  const level: AccessLevel = access ? access.role : 'owner';
  return {
    level,
    shared: !!access,
    ownerName: access ? access.ownerName || access.ownerEmail : '',
    canReport: !viewOnly && level !== 'view',
    canEdit: !viewOnly && (level === 'owner' || level === 'full'),
    isOwner: level === 'owner',
    viewOnly,
  };
}

export function BlockedWriteNotice() {
  const { showToast } = useToast();
  const last = useRef(0);
  useEffect(
    () =>
      onBlockedWrite(() => {
        const now = Date.now();
        if (now - last.current < 4000) return;
        last.current = now;
        showToast('השינוי לא נשמר בחשבון — אין לך הרשאה לכך');
      }),
    [showToast],
  );
  return null;
}

export function NoAccess({ need }: { need: 'report' | 'edit' | 'owner' }) {
  const styles = useStyles(makeStyles);
  const router = useRouter();
  const { ownerName, level, viewOnly } = useAccess();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  // מצב צפייה בלבד שהמשתמש בחר — ייתכן שהרמה מתירה; מציעים לחזור לעריכה.
  const levelOk =
    need === 'owner' ? level === 'owner' : need === 'edit' ? level === 'owner' || level === 'full' : level !== 'view';
  if (viewOnly && levelOk) {
    return (
      <Screen>
        <Text style={styles.title}>מצב צפייה בלבד</Text>
        <Text style={styles.body}>המערכת מוצגת במצב צפייה בלבד, ולכן אי אפשר לדווח או לערוך.</Text>
        <Button label="מעבר למצב עריכה" onPress={() => void setViewOnly(false)} />
        <Button label="חזרה" variant="secondary" onPress={back} />
      </Screen>
    );
  }
  const what =
    need === 'owner'
      ? 'המסך הזה זמין רק לבעלים של החשבון.'
      : need === 'edit'
        ? 'השינוי הזה דורש הרשאה מלאה.'
        : 'ההרשאה שלך היא צפייה בלבד, ולכן אי אפשר לדווח.';
  return (
    <Screen>
      <Text style={styles.title}>אין הרשאה</Text>
      <Text style={styles.body}>
        {what}
        {ownerName ? `\nאת/ה צופה בנתונים של ${ownerName} (${ROLE_LABELS[level as ShareRole] ?? ''}).` : ''}
      </Text>
      <Button label="חזרה" variant="secondary" onPress={back} />
    </Screen>
  );
}

/** עוטף מסך: מציג אותו רק כשהרמה מתירה. */
export function RequireAccess({ need, children }: { need: 'report' | 'edit' | 'owner'; children: ReactNode }) {
  const a = useAccess();
  const ok = need === 'report' ? a.canReport : need === 'edit' ? a.canEdit : a.isOwner;
  return ok ? <>{children}</> : <NoAccess need={need} />;
}

function makeStyles(c: ColorScheme, layout: StyleLayout) {
  return {
    bar: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      backgroundColor: c.brandLight,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    lost: { backgroundColor: c.dangerSoft },
    text: { flex: 1, fontSize: 14, color: c.text, textAlign: layout.textStart },
    link: { fontSize: 14, fontWeight: '700' as const, color: c.brandDark },
    title: { fontSize: 20, fontWeight: '700' as const, color: c.text, textAlign: layout.textStart },
    body: { fontSize: 15, color: c.text, lineHeight: 22, textAlign: layout.textStart },
  };
}
