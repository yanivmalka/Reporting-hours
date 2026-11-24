/**
 * עורך רמת הפירוט של דוח השכר שנשלח (lib/payrollTemplate.ts). למעלה, קבוע — תצוגה
 * מקדימה חיה של המייל; לחיצה על שורה בה גוללת לפקד של הרכיב ומבליטה אותו. מתחת,
 * בגלילה — הפקדים, ובסופם הכפתורים (החלה / עדכון / שמירה כתבנית חדשה / ביטול).
 * מורשה בלי `canEdit` יכול להחיל את הפירוט לשליחה הזו בלבד.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { Text } from '../Text';
import { Button } from '../Button';
import { Checkbox } from '../Checkbox';
import { Dialog } from '../Dialog';
import { SelectField } from '../SelectField';
import { TextField } from '../TextField';
import { MailPreview } from './MailPreview';
import type { PreviewLine, PreviewTarget } from '../../lib/payroll';
import { GROUP_LEVEL_OPTIONS, groupLevelTitle, type GroupLevel } from '../../lib/courseGrouping';
import {
  REDEEMED_EDGE_OPTIONS,
  REDEEMED_PLACEMENT_OPTIONS,
  type PayrollDetail,
  type PayrollTemplate,
  type RedeemedEdge,
  type RedeemedPlacement,
} from '../../lib/payrollTemplate';
import { useTheme } from '../../theme/ThemeContext';
import { spacing } from '../../theme/colors';
import { TEXT_RIGHT } from '../../theme/align';

type Item = { key: keyof PayrollDetail; label: string; hint?: string; when?: (d: PayrollDetail) => boolean };

/** `anchor` — הקבוצה כולה היא היעד של שורה בתצוגה (עמודות הטבלה) */
const SECTIONS: { title: string; anchor?: PreviewTarget; items: Item[] }[] = [
  {
    title: 'פתיחה',
    items: [{ key: 'hebrewPeriod', label: 'טווח התאריכים העברי' }],
  },
  {
    title: 'קבוצות ומפגשים',
    items: [
      { key: 'groupSummary', label: 'שורת סיכום לכל קבוצה', hint: 'שם, מספר מפגשים ושעות' },
      { key: 'rows', label: 'שורה לכל מפגש', hint: 'בקיבוץ לפי מקום עבודה — שורה לכל יום' },
    ],
  },
  {
    title: 'מה מופיע בשורות',
    anchor: 'columns',
    items: [
      { key: 'weekday', label: 'יום בשבוע', when: (d) => d.rows },
      { key: 'hebrewDate', label: 'תאריך עברי', when: (d) => d.rows },
      { key: 'times', label: 'שעות התחלה וסיום', when: (d) => d.rows },
      { key: 'breaks', label: 'הפסקות (דק׳)', when: (d) => d.rows },
      { key: 'netHours', label: 'שעות נטו', hint: 'גם בשורת הקבוצה', when: (d) => d.rows || d.groupSummary },
      { key: 'academicHours', label: 'שעות אקדמיות', when: (d) => d.rows || d.groupSummary },
      {
        key: 'carried',
        label: 'דקות שהועברו למונה המצטבר',
        hint: 'לכל מפגש ולכל קבוצה',
        when: (d) => d.rows || d.groupSummary,
      },
    ],
  },
  {
    title: 'ביטולים',
    items: [
      { key: 'canceled', label: 'רשימת המפגשים שבוטלו' },
      { key: 'canceledSummary', label: 'סיכום הביטולים לפי סיבה' },
      { key: 'canceledAmounts', label: 'סכומים בביטולים', when: (d) => d.canceled || d.canceledSummary },
    ],
  },
  {
    title: 'דקות מצטברות',
    items: [
      { key: 'redeemed', label: 'פדיון מהמונה', hint: 'דקות מחודשים קודמים שנכללו בדוח' },
      { key: 'carriedTotal', label: 'סה״כ שהועבר למונה בחודש', hint: 'דקות עודפות שלא נכללו בשעות' },
    ],
  },
  {
    title: 'סיכום',
    items: [
      { key: 'totalAcademic', label: 'סה״כ שעות אקדמיות' },
      { key: 'totalNet', label: 'סה״כ שעות נטו' },
      { key: 'totalDays', label: 'ימי עבודה' },
      { key: 'travel', label: 'נסיעות' },
      { key: 'pay', label: 'סכום לתשלום' },
      { key: 'signature', label: 'חתימה עם הפרטים האישיים' },
    ],
  },
];

type LevelValue = GroupLevel | 'screen';

export function DetailEditor({
  visible,
  onClose,
  initial,
  template,
  screenLevel,
  canSave,
  preview,
  onApply,
  onSaveNew,
  onUpdate,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  initial: PayrollDetail;
  /** התבנית שממנה התחילו */
  template: PayrollTemplate;
  /** רמת הקיבוץ שנבחרה במסך (ההגדרה המשותפת) */
  screenLevel: GroupLevel;
  canSave: boolean;
  preview: (d: PayrollDetail) => { subject: string; lines: PreviewLine[] };
  onApply: (d: PayrollDetail) => void;
  onSaveNew: (name: string, d: PayrollDetail) => void;
  onUpdate: (d: PayrollDetail) => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const [d, setD] = useState(initial);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  useEffect(() => {
    if (visible) {
      setD(initial);
      setNaming(false);
      setName('');
    }
    // רק בפתיחה — כך עדכון של ההורה בזמן העריכה לא מוחק את מה שסומן
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const set = (k: keyof PayrollDetail, v: boolean) => setD((x) => ({ ...x, [k]: v }));
  const p = preview(d);
  const own = !template.builtIn;
  const { height: screenH } = useWindowDimensions();

  // עוגנים לגלילה: מיקום כל קבוצה בתוכן הנגלל, ומיקום כל פקד בתוך הקבוצה שלו
  const scrollRef = useRef<ScrollView | null>(null);
  const sectionY = useRef<Record<string, number>>({});
  const itemY = useRef<Record<string, { section: string; y: number }>>({});
  const [flash, setFlash] = useState<PreviewTarget | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  /** הפקד של רכיב, או החלופה כשהוא מוסתר (עמודות — כשאין שורות; שיבוץ הפדיון — כשהפדיון כבוי) */
  const anchorOf = (t: PreviewTarget): { key: PreviewTarget; y: number } | null => {
    const chain: PreviewTarget[] =
      t === 'columns' ? ['columns', 'rows'] : t === 'redeemedPlacement' ? ['redeemedPlacement', 'redeemed'] : [t];
    for (const k of chain) {
      if (k in sectionY.current) return { key: k, y: sectionY.current[k] };
      const it = itemY.current[k];
      if (it && it.section in sectionY.current) return { key: k, y: sectionY.current[it.section] + it.y };
    }
    return null;
  };
  const jumpTo = (t: PreviewTarget) => {
    const a = anchorOf(t);
    if (!a) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, a.y - spacing.sm), animated: true });
    setFlash(a.key);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1800);
  };
  const onSection = (key: string) => (e: LayoutChangeEvent) => {
    sectionY.current[key] = e.nativeEvent.layout.y;
  };
  const onItem = (section: string, key: string) => (e: LayoutChangeEvent) => {
    itemY.current[key] = { section, y: e.nativeEvent.layout.y };
  };
  /** עטיפה לפקד — עוגן גלילה ורקע מודגש כשקופצים אליו */
  // פונקציה (לא קומפוננטה) — כדי שהפקד לא ייבנה מחדש בכל רינדור
  const anchor = (section: string, k: PreviewTarget, children: ReactNode) => (
    <View
      key={k}
      onLayout={onItem(section, k)}
      style={[styles.anchor, flash === k && { backgroundColor: colors.brandLight, borderColor: colors.brand }]}
    >
      {children}
    </View>
  );

  const buttons = naming
    ? [
        <Button
          key="save"
          label="שמירת התבנית"
          onPress={() => onSaveNew(name.trim(), d)}
          disabled={!name.trim()}
        />,
        <Button key="back" label="חזרה" variant="secondary" onPress={() => setNaming(false)} />,
      ]
    : [
        <Button key="apply" label="החלה על הדוח" onPress={() => onApply(d)} />,
        ...(canSave && own
          ? [<Button key="update" label={`עדכון התבנית "${template.name}"`} variant="secondary" onPress={() => onUpdate(d)} />]
          : []),
        ...(canSave
          ? [<Button key="new" label="שמירה כתבנית חדשה" variant="secondary" onPress={() => setNaming(true)} />]
          : []),
        <Button key="close" label="ביטול" variant="secondary" onPress={onClose} />,
      ];

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title="פירוט הדוח לשכר"
      maxWidth={560}
      scrollRef={scrollRef}
      head={
        <View style={styles.previewWrap}>
          <ScrollView style={{ maxHeight: Math.max(160, screenH * 0.36) }} nestedScrollEnabled>
            <MailPreview compact subject={p.subject} lines={p.lines} onLinePress={jumpTo} />
          </ScrollView>
          <Text style={[styles.hint, { color: colors.textMuted }]}>לחיצה על שורה — מעבר לפקד שמשנה אותה</Text>
        </View>
      }
    >
      {naming ? (
        <View style={styles.section}>
          <Text style={[styles.title, { color: colors.text }]}>שם התבנית</Text>
          <TextField value={name} onChangeText={setName} placeholder="למשל: מקוצר עם שעות נטו" />
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            התבנית נשמרת לכל מקומות העבודה, ונבחרת למקום הזה.
          </Text>
        </View>
      ) : null}
      <View
        onLayout={onSection('level')}
        style={[styles.section, styles.anchor, flash === 'level' && { backgroundColor: colors.brandLight, borderColor: colors.brand }]}
      >
        <Text style={[styles.title, { color: colors.text }]}>קיבוץ המפגשים</Text>
        <SelectField<LevelValue>
          value={d.level ?? 'screen'}
          onChange={(v) => setD((x) => ({ ...x, level: v === 'screen' ? null : v }))}
          title="קיבוץ המפגשים בדוח"
          options={[
            { value: 'screen', label: `כפי שנבחר במסך (${groupLevelTitle(screenLevel)})` },
            ...GROUP_LEVEL_OPTIONS,
          ]}
        />
      </View>
      {SECTIONS.map((sec) => ({ sec, items: sec.items.filter((it) => !it.when || it.when(d)) }))
        .filter((x) => x.items.length > 0)
        .map(({ sec, items }) => (
        <View
          key={sec.title}
          onLayout={onSection(sec.anchor ?? sec.title)}
          style={[
            styles.section,
            sec.anchor && styles.anchor,
            sec.anchor && flash === sec.anchor && { backgroundColor: colors.brandLight, borderColor: colors.brand },
          ]}
        >
          <Text style={[styles.title, { color: colors.text }]}>{sec.title}</Text>
          {items
            .map((it) => (
              anchor(
                sec.anchor ?? sec.title,
                it.key,
                <Checkbox
                  checked={Boolean(d[it.key])}
                  onChange={(v) => set(it.key, v)}
                  label={it.label}
                  hint={it.hint}
                />,
              )
            ))}
          {sec.title === 'דקות מצטברות' && d.redeemed ? (
            <View
              style={[
                styles.sub,
                styles.anchor,
                flash === 'redeemedPlacement' && { backgroundColor: colors.brandLight, borderColor: colors.brand },
              ]}
              onLayout={onItem(sec.title, 'redeemedPlacement')}
            >
              <SelectField<RedeemedPlacement>
                label="הצגת הפדיון:"
                title="היכן להציג את הדקות שנפדו"
                value={d.redeemedPlacement}
                onChange={(v) => setD((x) => ({ ...x, redeemedPlacement: v }))}
                options={REDEEMED_PLACEMENT_OPTIONS}
              />
              {d.redeemedPlacement !== 'separate' ? (
                <>
                  <SelectField<RedeemedEdge>
                    label="בתוך היום:"
                    title="היכן ביום להוסיף את הדקות"
                    value={d.redeemedEdge}
                    onChange={(v) => setD((x) => ({ ...x, redeemedEdge: v }))}
                    options={REDEEMED_EDGE_OPTIONS}
                  />
                  <Text style={[styles.hint, { color: colors.textMuted }]}>
                    שעות היום ושעות הקבוצה גדלות בדקות שנפדו, ושורת הפדיון הנפרדת לא מופיעה. הסה״כ לא משתנה.
                  </Text>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      ))}
      <View style={styles.buttons}>{buttons}</View>
      {canSave && own && !naming ? (
        <Button label={`מחיקת התבנית "${template.name}"`} variant="dangerLink" onPress={onDelete} />
      ) : null}
      {!canSave ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          שמירת תבניות — לבעל החשבון ולמורשה בהרשאה מלאה. אפשר להחיל את הפירוט על השליחה הזו.
        </Text>
      ) : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  section: { gap: 2, marginBottom: spacing.sm },
  title: { fontSize: 14, fontWeight: '700', textAlign: TEXT_RIGHT },
  hint: { fontSize: 12, textAlign: TEXT_RIGHT },
  sub: { gap: spacing.xs, marginTop: spacing.xs },
  anchor: { borderRadius: 8, borderWidth: 1, borderColor: 'transparent', paddingHorizontal: 4 },
  previewWrap: { gap: 4, marginTop: spacing.xs },
  buttons: { gap: spacing.sm, marginTop: spacing.sm },
});
