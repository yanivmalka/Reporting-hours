import { Keyboard, View } from 'react-native';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import { Button } from '../Button';
import { FormField } from '../FormField';
import { TimeInput } from '../TimeInput';
import { WheelNumber } from '../WheelNumber';
import { SegmentedControl } from '../SegmentedControl';
import { formatHours } from '../../lib/pay';
import { EXTRA_SESSION_LABELS, type ExtraSessionKind } from '../../lib/reports';
import { SelectField } from '../SelectField';
import { courseScheduleLabel, sessionTimes } from '../../lib/courses';
import { formatShekels } from '../../lib/travel';
import { END_BEFORE_START, endNotAfterStart, formatDuration } from '../../lib/time';
import type { ReportWizard } from './useReportWizard';

/** שלב 3: שעות, הפסקות ותצוגה מקדימה של נטו, שעות ושכר. */
export function TimesStep({ w }: { w: ReportWizard }) {
  const { router, styles, direct, editing, courseId, extraKind, setExtraKind, step, viaCourse, endRef, start, setStart, end, setEnd, breaks, leftoverChoice, errors, setErrors, addBreak, updateBreak, removeBreak, shown, selectedCourse, extraCandidates, chooseExtraCourse, jointOffer, jointWith, applyJoint, undoJoint, date } = w;
  return (
    <>
    {/* ── 3. שעות ── */}
    {step === 'times' ? (
      <>
        <Text style={styles.stepTitle}>
          {direct ? 'השעות לפי הקורס — אפשר לעדכן' : selectedCourse ? 'השעות לפי הקורס — אפשר לעדכן' : 'מתי עבדת?'}
        </Text>
        {!viaCourse && extraCandidates.length > 0 ? (
          <FormField label="מפגש נוסף לקורס (רשות)">
            <SelectField<string | null>
              title="שיוך לקורס"
              value={extraKind ? courseId : null}
              options={[
                { value: null, label: 'לא משויך לקורס' },
                ...extraCandidates.map((c) => ({
                  value: c.id as string | null,
                  label: c.name,
                  sub: courseScheduleLabel(c),
                })),
              ]}
              onChange={chooseExtraCourse}
            />
            {extraKind ? (
              <SegmentedControl<ExtraSessionKind>
                options={(Object.keys(EXTRA_SESSION_LABELS) as ExtraSessionKind[]).map((k) => ({
                  value: k,
                  label: EXTRA_SESSION_LABELS[k],
                }))}
                value={extraKind}
                onChange={setExtraKind}
              />
            ) : null}
          </FormField>
        ) : null}
        {/* שעת התחלה משמאל ושעת סיום מימין — כמו "12:05–15:00". */}
        <View style={styles.timesRow}>
          <View style={styles.timeCol}>
            <FormField label="שעת סיום" error={errors.end ?? (endNotAfterStart(start, end) ? END_BEFORE_START : undefined)}>
              <TimeInput
                ref={endRef}
                min={start}
                value={end}
                onChange={(v) => {
                  setEnd(v);
                  setErrors((prev) => ({ ...prev, end: undefined }));
                }}
                label="שעת סיום"
                onComplete={() => Keyboard.dismiss()}
                invalid={Boolean(errors.end)}
              />
            </FormField>
          </View>
          <View style={styles.timeCol}>
            <FormField label="שעת התחלה" error={errors.start}>
              <TimeInput
                value={start}
                onChange={(v) => {
                  setStart(v);
                  setErrors((prev) => ({ ...prev, start: undefined, end: undefined }));
                }}
                onComplete={() => endRef.current?.focus()}
                label="שעת התחלה"
                onOverflow={(d) => endRef.current?.feed(d)}
                invalid={Boolean(errors.start)}
              />
            </FormField>
          </View>
        </View>
        <Text style={styles.wheelHint}>אפשר גם לגרור למעלה או למטה בתוך התיבה: בצד שמאל — שעות, בצד ימין — דקות</Text>

        {/* קורסים צמודים — הצעה לדיווח אחד ליום (lib/jointCourses.ts) */}
        {jointOffer && selectedCourse ? (
          <View style={styles.joint}>
            <Text style={styles.jointTitle}>אחריו באותו יום: {jointOffer.course.name}</Text>
            <Text style={styles.jointText}>
              {`${sessionTimes(jointOffer.course, date).start}–${jointOffer.end} · אותו מקום. אפשר לדווח את שניהם בדיווח אחד: הסיום ${jointOffer.end}${jointOffer.gap > 0 ? `, הפער (${jointOffer.gap} דק׳) כהפסקה` : ''}, ו"${jointOffer.course.name}" יסומן כבוטל — דווח יחד.`}
            </Text>
            <Pressable onPress={applyJoint} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.jointLink}>דיווח משותף עד {jointOffer.end}</Text>
            </Pressable>
          </View>
        ) : null}
        {jointWith ? (
          <View style={styles.joint}>
            <Text style={styles.jointTitle}>דיווח משותף עם {jointWith.name}</Text>
            <Text style={styles.jointText}>{`בשמירה "${jointWith.name}" יסומן כבוטל — דווח יחד עם ${selectedCourse?.name ?? ''}.`}</Text>
            <Pressable onPress={undoJoint} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.jointLink}>ביטול הדיווח המשותף</Text>
            </Pressable>
          </View>
        ) : null}

        <FormField label="הפסקות (בדקות)" error={errors.breaks}>
          <View style={styles.breaks}>
            {breaks.map((row, index) => (
              <View key={row.id} style={styles.breakRow}>
                <View style={styles.breakInput}>
                  <WheelNumber
                    value={row.minutes}
                    onChange={(t) => updateBreak(row.id, t)}
                    placeholder={`הפסקה ${index + 1}`}
                    label={`הפסקה ${index + 1}`}
                    max={600}
                  />
                </View>
                <Pressable
                  onPress={() => removeBreak(row.id)}
                  style={styles.breakRemove}
                  accessibilityLabel={`הסרת הפסקה ${index + 1}`}
                >
                  <Text style={styles.breakRemoveText}>✕</Text>
                </Pressable>
              </View>
            ))}
            <Button label="הוספת הפסקה" variant="secondary" onPress={addBreak} />
          </View>
        </FormField>

        {shown.net != null ? (
          <View style={styles.netCard}>
            <View style={styles.netCol}>
              <Text style={styles.netLabel}>נטו</Text>
              <Text style={styles.netValue}>{formatDuration(shown.net)}</Text>
            </View>
            <View style={styles.netCol}>
              <Text style={styles.netLabel}>שעות אקדמיות</Text>
              <Text style={styles.netValue}>{formatHours(shown.academic)}</Text>
            </View>
            {shown.money != null ? (
              <View style={styles.netCol}>
                <Text style={styles.netLabel}>שכר</Text>
                <Text style={styles.netValue}>{formatShekels(shown.money)}</Text>
              </View>
            ) : null}
            {/* דקות עודפות — שורה קבועה בתחתית הסיכום (תמיד תופסת מקום), כדי שהפקדים לא יזוזו. */}
            <View style={styles.netLeftover}>
              <Text style={styles.netLeftoverText} numberOfLines={1}>
                {shown.leftover > 0
                  ? `+${shown.leftover} דק׳ עודפות · ${leftoverChoice === 'carry' ? 'למונה המצטבר' : 'בשבר שעה'}${editing ? ' · כפי שנקבע בדיווח' : ''}`
                  : ' '}
              </Text>
              {shown.leftover > 0 && !editing ? (
                <Pressable
                  onPress={() => router.push({ pathname: '/settings', params: { focus: 'settings' } })}
                  accessibilityRole="link"
                  accessibilityLabel="שינוי אופן הדקות העודפות בהגדרות"
                  hitSlop={8}
                >
                  <Text style={styles.netLeftoverLink}>שינוי</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </>
    ) : null}

    </>
  );
}
