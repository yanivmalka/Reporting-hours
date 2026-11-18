/**
 * דיאלוג מוקפץ אחיד: כותרת קבועה למעלה, כפתורים קבועים למטה, ורק האמצע נגלל.
 *
 * - כשיש עוד תוכן מתחת — דהייה בתחתית אזור הגלילה וקו צל מעל הכפתורים; כשגוללים
 *   מהראש — קו מתחת לכותרת. בסוף הגלילה הם נעלמים. פס הגלילה נשאר גלוי
 *   (`persistentScrollbar`, אנדרואיד) כל עוד יש מה לגלול.
 * - מקלדת פתוחה: הכותרת מתכווצת לשורה אחת (`compactTitle`), הכפתורים עוברים לשורה
 *   אחת נמוכה מעל המקלדת, והשדה שבו כותבים נגלל לאמצע האזור הגלוי.
 * - שכבת הגלגלת (`WheelOverlayHost`) מרונדרת בתוך ה־Modal — המארח הכללי מאחוריו.
 *
 * שימוש:
 *   <Dialog title="ביטול מפגש" head={<Text>…</Text>} onClose={close}
 *     actions={[<Button key="ok" … />, <Button key="back" variant="secondary" … />]}>
 *     …תוכן נגלל…
 *   </Dialog>
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput as RNTextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Text } from './Text';
import { WheelOverlayHost } from './WheelOverlay';
import { CompactActions } from './Button';
import { radius, spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

/** האם המקלדת פתוחה (אנדרואיד / iOS; ב־web תמיד false). */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

type Props = {
  visible?: boolean;
  onClose: () => void;
  title: string;
  /** שורות קבועות מתחת לכותרת (נושא, תאריך) — מוסתרות כשהמקלדת פתוחה */
  head?: ReactNode;
  /** שורה אחת במקום הכותרת כשהמקלדת פתוחה (ברירת מחדל — הכותרת) */
  compactTitle?: string;
  /** הכפתורים הקבועים בתחתית, לפי סדר התצוגה (הראשי ראשון). כל אחד עם key. */
  actions?: ReactNode[];
  /** הכפתורים בשורה אחת גם בלי מקלדת (למשל "חזרה" · "העברה") */
  actionsRow?: boolean;
  /** תוכן קבוע מתחת לכפתורים (למשל קישור "ביטול המפגש") */
  below?: ReactNode;
  maxWidth?: number;
  alert?: boolean;
  scrollRef?: RefObject<ScrollView | null>;
  children?: ReactNode;
};

/** רצועות בשקיפות עולה — דהייה בלי תלות ב־gradient */
const FADE = [0.15, 0.35, 0.55, 0.75, 0.9];

export function Dialog({
  visible = true,
  onClose,
  title,
  head,
  compactTitle,
  actions,
  actionsRow,
  below,
  maxWidth = 440,
  alert,
  scrollRef,
  children,
}: Props) {
  const styles = useStyles(makeStyles);
  const keyboard = useKeyboardOpen();
  const ownRef = useRef<ScrollView>(null);
  const scroll = scrollRef ?? ownRef;
  const contentRef = useRef<View>(null);
  const box = useRef({ y: 0, height: 0, content: 0 });
  const [edges, setEdges] = useState({ top: true, end: true });

  const update = useCallback(() => {
    const { y, height, content } = box.current;
    const top = y <= 2;
    const end = y + height >= content - 2;
    setEdges((e) => (e.top === top && e.end === end ? e : { top, end }));
  }, []);

  // מקלדת נפתחה — השדה שבו כותבים לאמצע האזור הגלוי (אחרי שהדיאלוג התכווץ).
  useEffect(() => {
    if (!keyboard) return;
    const t = setTimeout(() => {
      const input = RNTextInput.State.currentlyFocusedInput?.() as unknown as View | null;
      const content = contentRef.current;
      if (!input || !content) return;
      try {
        input.measureLayout(
          content as never,
          (_x, y, _w, h) => {
            const target = Math.max(0, y - (box.current.height - h) / 2);
            scroll.current?.scrollTo({ y: target, animated: true });
          },
          () => {},
        );
      } catch {
        // השדה אינו בתוך הדיאלוג — בלי גלילה
      }
    }, 120);
    return () => clearTimeout(t);
  }, [keyboard, scroll]);

  const compact = keyboard;
  const row = actionsRow || compact;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View
          style={[styles.dialog, { maxWidth }, compact && styles.dialogKeyboard]}
          accessibilityRole={alert ? 'alert' : undefined}
        >
          <View style={[styles.head, compact && styles.headCompact, !edges.top && styles.headShadow]}>
            {compact ? (
              <Text style={styles.compactTitle} numberOfLines={1}>
                {compactTitle ?? title}
              </Text>
            ) : (
              <>
                <Text style={styles.title}>{title}</Text>
                {head}
              </>
            )}
          </View>

          <View style={styles.bodyWrap}>
            <ScrollView
              ref={scroll}
              style={styles.scroll}
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              persistentScrollbar
              scrollEventThrottle={32}
              onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                box.current.y = e.nativeEvent.contentOffset.y;
                update();
              }}
              onLayout={(e: LayoutChangeEvent) => {
                box.current.height = e.nativeEvent.layout.height;
                update();
              }}
              onContentSizeChange={(_w, h) => {
                box.current.content = h;
                update();
              }}
            >
              <View ref={contentRef} collapsable={false} style={styles.content}>
                {children}
              </View>
            </ScrollView>
            {!edges.end ? (
              <View pointerEvents="none" style={styles.fade}>
                {FADE.map((o) => (
                  <View key={o} style={[styles.fadeStrip, { opacity: o }]} />
                ))}
              </View>
            ) : null}
          </View>

          {actions?.length || below ? (
            <View style={[styles.foot, compact && styles.footCompact, !edges.end && styles.footShadow]}>
              {actions?.length ? (
                <CompactActions.Provider value={compact}>
                  <View style={row ? styles.actionsRow : styles.actionsStack}>
                    {actions.map((a, i) => (
                      <View key={i} style={row ? styles.actionCell : undefined}>
                        {a}
                      </View>
                    ))}
                  </View>
                </CompactActions.Provider>
              ) : null}
              {!compact ? below : null}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
      <WheelOverlayHost />
    </Modal>
  );
}

const makeStyles = (c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    dialog: {
      width: '100%',
      maxHeight: '90%',
      backgroundColor: c.surface,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    dialogKeyboard: { maxHeight: '100%' },
    head: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, gap: 4 },
    headCompact: { paddingTop: spacing.sm + 2, paddingBottom: spacing.sm },
    headShadow: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    title: { fontSize: 18, fontWeight: '800', color: c.text, textAlign: layout.textStart },
    compactTitle: { fontSize: 14, fontWeight: '700', color: c.text, textAlign: layout.textStart },
    bodyWrap: { flexShrink: 1, minHeight: 0 },
    // ב־web הדפדפן מסמן את אזור הגלילה במסגרת מיקוד שחורה — בלי
    scroll: { flexGrow: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) },
    body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    content: { gap: spacing.sm },
    fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    fadeStrip: { height: 6, backgroundColor: c.surface },
    foot: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
      gap: spacing.sm,
      backgroundColor: c.surface,
    },
    footCompact: { paddingBottom: spacing.sm },
    footShadow: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      elevation: 6,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: -2 },
    },
    actionsStack: { gap: spacing.sm },
    actionsRow: { flexDirection: layout.rowStart, gap: spacing.sm },
    actionCell: { flex: 1 },
  });
