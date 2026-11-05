/**
 * לוח החופשות — רכיבי ממשק:
 *   - `VacationBoard` — הלוח המרכזי במסך "חגים וחופשות": כל החופשות, הוספה ועריכה;
 *   - `VacationsCard` — בדף הקורס ובדף מקום העבודה: אילו חופשות חלות ומאיפה
 *     הגיעו ("מלוח החופשות" / "של מקום העבודה" / "של הקורס"). במצב עריכה —
 *     מתג "התעלם" לחופשה שבהורשה, והוספה / מחיקה של חופשה משלו;
 *   - `useVacationEditor` — דיאלוג הוספה / עריכה של חופשה.
 * כל שינוי נשמר מיד ובונה מחדש את אינדקס הביטולים (saveVacations).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { Button } from './Button';
import { TextField } from './TextField';
import { DateField } from './DatePicker';
import { SelectField, type SelectOption } from './SelectField';
import { EnterChevron } from './Chevrons';
import { Icon } from './Icon';
import { useToast } from './Toast';
import { loadCourses, type Course } from '../lib/courses';
import { activeWorkplaces, loadWorkplaces, type Workplace } from '../lib/workplaces';
import { saveVacations } from '../lib/sessions';
import {
  makeVacationId,
  useVacations,
  vacationIgnored,
  vacationRangeLabel,
  vacationsForCourse,
  vacationsForWorkplace,
  type Vacation,
  type VacationScope,
} from '../lib/vacations';
import { radius, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** מקומות העבודה והקורסים — לשמות ולבחירת היקף. */
function useNames() {
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  useEffect(() => {
    let active = true;
    Promise.all([loadWorkplaces(), loadCourses()]).then(([w, c]) => {
      if (!active) return;
      setWorkplaces(activeWorkplaces(w));
      setCourses(c);
    });
    return () => {
      active = false;
    };
  }, []);
  return { workplaces, courses };
}

function scopeLabel(scope: VacationScope, workplaces: readonly Workplace[], courses: readonly Course[]): string {
  if (scope.kind === 'all') return 'כל המוסדות';
  if (scope.kind === 'workplace') return workplaces.find((w) => w.id === scope.id)?.name ?? 'מקום עבודה';
  return courses.find((c) => c.id === scope.id)?.name ?? 'קורס';
}

function scopeKey(scope: VacationScope): string {
  return scope.kind === 'all' ? 'all' : `${scope.kind}:${scope.id}`;
}

function parseScope(key: string): VacationScope {
  if (key === 'all') return { kind: 'all' };
  const [kind, id] = key.split(':');
  return kind === 'workplace' ? { kind: 'workplace', id } : { kind: 'course', id };
}

// ───────────────────────── דיאלוג עריכה ─────────────────────────

type EditorRequest = {
  /** חופשה קיימת לעריכה; בלי — חופשה חדשה */
  vacation?: Vacation;
  /** היקף קבוע (מדף קורס / מקום עבודה) — בלי בורר היקף */
  fixedScope?: VacationScope;
};

export function useVacationEditor() {
  const [request, setRequest] = useState<EditorRequest | null>(null);
  const open = useCallback((r: EditorRequest = {}) => setRequest(r), []);
  const dialog = useMemo(
    () => (request ? <VacationEditor request={request} onClose={() => setRequest(null)} /> : null),
    [request],
  );
  return { open, dialog };
}

function VacationEditor({ request, onClose }: { request: EditorRequest; onClose: () => void }) {
  const styles = useStyles(makeStyles);
  const { showToast } = useToast();
  const vacations = useVacations();
  const { workplaces, courses } = useNames();
  const existing = request.vacation;
  const [name, setName] = useState(existing?.name ?? '');
  const [from, setFrom] = useState(existing?.from ?? todayISO());
  const [to, setTo] = useState(existing?.to ?? existing?.from ?? todayISO());
  const [scope, setScope] = useState<VacationScope>(existing?.scope ?? request.fixedScope ?? { kind: 'all' });
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const invalid = to < from;

  const options: SelectOption<string>[] = [
    { value: 'all', label: 'כל המוסדות' },
    ...workplaces.map((w) => ({ value: `workplace:${w.id}`, label: w.name, sub: 'כל הקורסים של המקום' })),
    ...courses
      .filter((c) => c.to >= todayISO() || c.id === (scope.kind === 'course' ? scope.id : ''))
      .map((c) => ({
        value: `course:${c.id}`,
        label: c.name,
        sub: workplaces.find((w) => w.id === c.workplaceId)?.name ?? 'קורס',
      })),
  ];

  async function save() {
    setTried(true);
    if (invalid) return;
    setBusy(true);
    try {
      const next: Vacation = {
        id: existing?.id ?? makeVacationId(),
        name: name.trim() || undefined,
        from,
        to,
        mode: 'cancel',
        scope,
        // החלפת היקף מאפסת התעלמויות שכבר לא רלוונטיות.
        exclude: existing && scopeKey(existing.scope) === scopeKey(scope) ? existing.exclude : [],
      };
      await saveVacations(
        existing ? vacations.map((v) => (v.id === existing.id ? next : v)) : [...vacations, next],
      );
      showToast(existing ? 'החופשה עודכנה' : 'החופשה נוספה');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setBusy(true);
    try {
      await saveVacations(vacations.filter((v) => v.id !== existing.id));
      showToast('החופשה נמחקה');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{existing ? 'עריכת חופשה' : 'חופשה חדשה'}</Text>
          <Text style={styles.message}>מפגשים בחופשה מתבטלים: הם לא נכללים בפוטנציאל ובצפי. מפגש שכבר דווח לא מושפע.</Text>
          <TextField value={name} onChangeText={setName} placeholder="שם (לא חובה), למשל חופשת חנוכה" />
          <View style={styles.dates}>
            <View style={styles.dateCol}>
              <Text style={styles.fieldLabel}>מתאריך</Text>
              <DateField
                value={from}
                onChange={(v) => {
                  setFrom(v);
                  if (v > to) setTo(v);
                }}
              />
            </View>
            <View style={styles.dateCol}>
              <Text style={styles.fieldLabel}>עד תאריך</Text>
              <DateField value={to} onChange={setTo} invalid={tried && invalid} />
            </View>
          </View>
          {tried && invalid ? <Text style={styles.error}>תאריך הסיום לפני תאריך ההתחלה</Text> : null}
          {request.fixedScope ? (
            <Text style={styles.message}>חלה על: {scopeLabel(scope, workplaces, courses)}</Text>
          ) : (
            <View style={styles.gapSm}>
              <Text style={styles.fieldLabel}>חלה על</Text>
              <SelectField
                value={scopeKey(scope)}
                options={options}
                onChange={(k) => setScope(parseScope(k))}
                title="על מה חלה החופשה"
              />
            </View>
          )}
          <View style={styles.actions}>
            {existing ? (
              <Button label="מחיקת החופשה" variant="dangerLink" onPress={remove} disabled={busy} />
            ) : null}
            <Button label="ביטול" variant="secondary" onPress={onClose} disabled={busy} />
            <Button label={existing ? 'שמירה' : 'הוספה'} onPress={save} loading={busy} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ───────────────────────── הלוח המרכזי ─────────────────────────

/** כל החופשות, מהקרובה, עם הוספה ועריכה. */
export function VacationBoard() {
  const styles = useStyles(makeStyles);
  const vacations = useVacations();
  const { workplaces, courses } = useNames();
  const editor = useVacationEditor();
  const today = todayISO();
  const sorted = [...vacations].sort((a, b) => a.from.localeCompare(b.from));
  const upcoming = sorted.filter((v) => v.to >= today);
  const past = sorted.filter((v) => v.to < today);

  const row = (v: Vacation, last: boolean) => (
    <Pressable
      key={v.id}
      onPress={() => editor.open({ vacation: v })}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, last && styles.rowLast, pressed && styles.pressed]}
    >
      <View style={styles.rowTexts}>
        <Text style={styles.rowTitle}>
          {v.name?.trim() || 'חופשה'} · {vacationRangeLabel(v)}
        </Text>
        <Text style={styles.rowSub}>
          {scopeLabel(v.scope, workplaces, courses)}
          {v.exclude.length ? ` · ${v.exclude.length === 1 ? 'מקום / קורס אחד מתעלם' : `${v.exclude.length} מתעלמים`}` : ''}
        </Text>
      </View>
      <EnterChevron />
    </Pressable>
  );

  return (
    <View style={styles.gapSm}>
      {upcoming.length || past.length ? (
        <View style={styles.card}>
          {upcoming.map((v, i) => row(v, i === upcoming.length - 1 && !past.length))}
          {past.length ? <Text style={styles.groupLabel}>חופשות שעברו</Text> : null}
          {past.map((v, i) => row(v, i === past.length - 1))}
        </View>
      ) : (
        <Text style={styles.note}>אין עדיין חופשות. חופשה כללית חלה על כל המוסדות; אפשר גם לקבוע חופשה למקום עבודה או לקורס.</Text>
      )}
      <Button label="הוספת חופשה" variant="secondary" onPress={() => editor.open()} />
      {editor.dialog}
    </View>
  );
}

// ───────────────────────── כרטיס בדף קורס / מקום עבודה ─────────────────────────

type CardTarget = { kind: 'course'; id: string; workplaceId: string } | { kind: 'workplace'; id: string };

/**
 * החופשות שחלות על קורס או על מקום עבודה, ומאיפה הגיעו. `editable` — מתג
 * "התעלם" לחופשה שבהורשה, והוספה / מחיקה של חופשה משלו. `onChanged` — אחרי
 * כל שינוי (לרענון עיגולי המפגשים).
 */
export function VacationsCard({
  target,
  editable,
  onChanged,
  bare,
}: {
  target: CardTarget;
  editable?: boolean;
  onChanged?: () => void;
  /** בלי מסגרת וכותרת — בתוך קבוצה מתקפלת שכבר יש לה כותרת */
  bare?: boolean;
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const vacations = useVacations();
  const editor = useVacationEditor();
  const { inherited, own } =
    target.kind === 'course'
      ? vacationsForCourse(vacations, target.id, target.workplaceId)
      : vacationsForWorkplace(vacations, target.id);
  const workplaceId = target.kind === 'course' ? target.workplaceId : target.id;
  const today = todayISO();
  const relevant = (v: Vacation) => editable || v.to >= today;
  const shownInherited = inherited.filter(relevant);
  const shownOwn = own.filter(relevant);

  // רענון הקורא אחרי כל שינוי בחופשות (שמירה מכל מקום).
  useEffect(() => {
    onChanged?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vacations]);

  if (!editable && !shownInherited.length && !shownOwn.length) return null;

  async function toggleIgnore(v: Vacation, ignore: boolean) {
    const exclude = ignore ? [...new Set([...v.exclude, target.id])] : v.exclude.filter((e) => e !== target.id);
    await saveVacations(vacations.map((x) => (x.id === v.id ? { ...x, exclude } : x)));
  }

  const sourceLabel = (v: Vacation) =>
    v.scope.kind === 'all' ? 'מלוח החופשות' : v.scope.kind === 'workplace' ? 'של מקום העבודה' : 'של הקורס';

  const rows = [...shownInherited, ...shownOwn].sort((a, b) => a.from.localeCompare(b.from));
  const ownScope: VacationScope =
    target.kind === 'course' ? { kind: 'course', id: target.id } : { kind: 'workplace', id: target.id };

  return (
    <View style={bare ? styles.gapSm : styles.card}>
      {bare ? null : <Text style={styles.cardTitle}>חופשות</Text>}
      {rows.length === 0 ? (
        <Text style={styles.note}>אין חופשות שחלות כאן.</Text>
      ) : (
        rows.map((v, i) => {
          const inheritedRow = !shownOwn.includes(v);
          // התעלמות של מקום העבודה חלה גם על הקורס — מוצגת, אבל משנים אותה בדף המקום.
          const ignoredHere = v.exclude.includes(target.id);
          const ignoredAbove = !ignoredHere && vacationIgnored(v, target.id, workplaceId);
          const ignored = ignoredHere || ignoredAbove;
          return (
            <View key={v.id} style={[styles.row, i === rows.length - 1 && styles.rowLast]}>
              <View style={styles.rowTexts}>
                <Text style={[styles.rowTitle, ignored && styles.muted]}>
                  {v.name?.trim() || 'חופשה'} · {vacationRangeLabel(v)}
                </Text>
                <Text style={styles.rowSub}>
                  {sourceLabel(v)}
                  {ignoredAbove ? ' · מקום העבודה מתעלם' : ignoredHere ? ' · מתעלם' : ''}
                </Text>
              </View>
              {editable && inheritedRow && !ignoredAbove ? (
                <Pressable
                  onPress={() => void toggleIgnore(v, !ignoredHere)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: ignoredHere }}
                  accessibilityLabel={`התעלמות מ${v.name?.trim() || 'החופשה'}`}
                  hitSlop={6}
                  style={({ pressed }) => [styles.ignore, pressed && styles.pressed]}
                >
                  <Icon
                    name={ignoredHere ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={24}
                    color={ignoredHere ? colors.brand : colors.textMuted}
                  />
                  <Text style={styles.rowSub}>התעלם</Text>
                </Pressable>
              ) : null}
              {editable && !inheritedRow ? (
                <Button label="עריכה" variant="secondary" onPress={() => editor.open({ vacation: v, fixedScope: v.scope })} />
              ) : null}
            </View>
          );
        })
      )}
      {editable ? (
        <Button
          label={target.kind === 'course' ? 'הוספת חופשה לקורס' : 'הוספת חופשה למקום העבודה'}
          variant="secondary"
          onPress={() => editor.open({ fixedScope: ownScope })}
        />
      ) : null}
      {editor.dialog}
    </View>
  );
}

const makeStyles = (c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
    pressed: { opacity: 0.85 },
    gapSm: { gap: spacing.sm },
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
      gap: spacing.sm,
    },
    title: { fontSize: 18, fontWeight: '800', color: c.text, textAlign: layout.textStart },
    message: { fontSize: 14, lineHeight: 21, color: c.textMuted, textAlign: layout.textStart },
    error: { fontSize: 13, color: c.danger, textAlign: layout.textStart },
    fieldLabel: { fontSize: 13, color: c.textMuted, textAlign: layout.textStart, marginBottom: 4 },
    dates: { flexDirection: layout.rowStart, gap: spacing.sm },
    dateCol: { flex: 1, minWidth: 0 },
    // כפתורים זה מתחת לזה, ברוחב מלא; הפעולה הראשית (האחרונה בקוד) למעלה.
    actions: { flexDirection: 'column-reverse', gap: spacing.sm, marginTop: spacing.sm },
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: c.text, textAlign: layout.textStart, paddingTop: 4 },
    groupLabel: { fontSize: 12, color: c.textMuted, textAlign: layout.textStart, paddingTop: spacing.sm },
    row: {
      flexDirection: layout.rowStart,
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    rowLast: { borderBottomWidth: 0 },
    rowTexts: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: 15, fontWeight: '700', color: c.text, textAlign: layout.textStart },
    rowSub: { fontSize: 13, color: c.textMuted, textAlign: layout.textStart },
    muted: { color: c.textMuted, textDecorationLine: 'line-through' },
    ignore: { flexDirection: layout.rowStart, alignItems: 'center', gap: 6 },
    note: { fontSize: 14, lineHeight: 21, color: c.textMuted, textAlign: layout.textStart },
  });
