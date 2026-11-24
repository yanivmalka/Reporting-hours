/**
 * עורך רמת הפירוט של דוח השכר שנשלח (lib/payrollTemplate.ts): תיבת סימון לכל רכיב
 * בדוח, תצוגה מקדימה חיה של המייל, ושמירה כתבנית (חדשה / עדכון). מורשה בלי `canEdit`
 * יכול להחיל את הפירוט לשליחה הזו בלבד.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../Text';
import { Button } from '../Button';
import { Checkbox } from '../Checkbox';
import { Dialog } from '../Dialog';
import { SelectField } from '../SelectField';
import { TextField } from '../TextField';
import { MailPreview } from './MailPreview';
import { GROUP_LEVEL_OPTIONS, groupLevelTitle, type GroupLevel } from '../../lib/courseGrouping';
import type { PayrollDetail, PayrollTemplate } from '../../lib/payrollTemplate';
import { useTheme } from '../../theme/ThemeContext';
import { spacing } from '../../theme/colors';
import { TEXT_RIGHT } from '../../theme/align';

type Item = { key: keyof PayrollDetail; label: string; hint?: string; when?: (d: PayrollDetail) => boolean };

const SECTIONS: { title: string; items: Item[] }[] = [
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
  preview: (d: PayrollDetail) => { subject: string; body: string };
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

  const actions = naming
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
    <Dialog visible={visible} onClose={onClose} title="פירוט הדוח לשכר" maxWidth={560} actions={actions}>
      {naming ? (
        <View style={styles.section}>
          <Text style={[styles.title, { color: colors.text }]}>שם התבנית</Text>
          <TextField value={name} onChangeText={setName} placeholder="למשל: מקוצר עם שעות נטו" />
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            התבנית נשמרת לכל מקומות העבודה, ונבחרת למקום הזה.
          </Text>
        </View>
      ) : null}
      <View style={styles.section}>
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
        <View key={sec.title} style={styles.section}>
          <Text style={[styles.title, { color: colors.text }]}>{sec.title}</Text>
          {items
            .map((it) => (
              <Checkbox
                key={it.key}
                checked={Boolean(d[it.key])}
                onChange={(v) => set(it.key, v)}
                label={it.label}
                hint={it.hint}
              />
            ))}
        </View>
      ))}
      <View style={styles.section}>
        <Text style={[styles.title, { color: colors.text }]}>תצוגה מקדימה</Text>
        <MailPreview compact subject={p.subject} body={p.body} />
      </View>
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
});
