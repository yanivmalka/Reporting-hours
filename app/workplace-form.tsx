import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Animated, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { FoldChevron } from '../components/Chevrons';
import { Checkbox } from '../components/Checkbox';
import { usePayBasis } from '../lib/payBasis';
import { SelectField } from '../components/SelectField';
import { CANCEL_PAY_LABELS, useCancelReasons, type CancelPayKind } from '../lib/cancelReasons';
import { formatShekels } from '../lib/travel';
import { Text } from '../components/Text';
import { Pressable } from '../components/Pressable';
import { Button } from '../components/Button';
import { courseScheduleLabel, loadCourses, type Course } from '../lib/courses';
import { VacationsCard } from '../components/Vacations';
import { useVacations, vacationsForWorkplace } from '../lib/vacations';
import { currentPayPeriod, dateRange } from '../lib/dashboard';
import { periodTitle } from '../lib/payroll';
import { formatISODate, todayISO } from '../lib/time';
import { DateField } from '../components/DatePicker';
import { FormField } from '../components/FormField';
import { useConfirm } from '../components/ConfirmDialog';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { TextField } from '../components/TextField';
import { TimeInput } from '../components/TimeInput';
import { useToast } from '../components/Toast';
import {
  canDeleteWorkplace,
  deletionSummary,
  trashWorkplaceWithData,
  workplaceDeletion,
  type WorkplaceDeletion,
} from '../lib/trash';
import { contactsSupported, pickContact, pickContactPhone } from '../lib/contacts';
import { parseTime } from '../lib/time';
import {
  ARRIVAL_MODE_LABELS,
  paydayFromDeadline,
  reportDeadlineDay,
  PAYMENT_TYPE_LABELS,
  DEFAULT_TAXI_REMINDER,
  emptyDraft,
  freeColor,
  isTaxi,
  makeContactId,
  paymentTermsOf,
  termsChanged,
  type Workplace,
  loadWorkplaces,
  setWorkplaceArchived,
  upsertWorkplace,
  type ArrivalMode,
  type PaymentType,
  type TaxiReminder,
} from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';
import { workplacePalette } from '../theme/workplaceColors';
import { EnterChevron } from '../components/Chevrons';

/** מצב הטופס — שדות מספריים נשמרים כמחרוזת כדי לאפשר עריכה חופשית. */
/** איש קשר בטופס — כל השדות כמחרוזות */
type ContactRow = { id: string; description: string; name: string; phone: string; email: string };

/** כלל תשלום על ביטול בטופס — הערך כמחרוזת לעריכה חופשית. */
type CancelPayRow = { kind: CancelPayKind; value: string };

type FormState = {
  /** כלל תשלום על ביטול, לכל סיבה (מזהה) */
  cancelPay: Record<string, CancelPayRow>;
  name: string;
  address: string;
  contacts: ContactRow[];
  rate: string;
  paymentType: PaymentType;
  payday: string;
  paymentTermsDays: string;
  payrollEmail: string;
  ccEmails: string;
  taxPercent: string;
  employeeNumber: string;
  arrivalMode: ArrivalMode;
  travelCostPerDirection: string;
  tripsPerDay: string;
  /** מונית: טלפון, שם איש קשר והעדפת תזכורת */
  taxiPhone: string;
  taxiContact: string;
  taxiReminderKind: TaxiReminder['kind'];
  taxiHours: string;
  taxiNightTime: string;
  /** משבצת הצבע בפלטת מקומות העבודה */
  colorIndex: number;
  /** תשלום לפי שעה אקדמית (45 דק׳); null — לא נקבע במקום (ההגדרה הכללית) */
  academic: boolean | null;
};

type Errors = Partial<Record<keyof FormState, string>> & { contactErrors?: Record<string, string> };

/**
 * קבוצות הטופס, לפי הסדר: כללי · שכר ותשלום · (ביטולים) · קורסים · חופשות · הגעה
 * ונסיעות · דוחות שכר · ניהול. בעריכה — קבוצות מתקפלות עם שורת תקציר;
 * ביצירה — וויזארד, צעד לכל קבוצה.
 */
type GroupKey = 'general' | 'pay' | 'cancel' | 'courses' | 'vacations' | 'arrival' | 'payroll' | 'manage';
const GROUP_TITLES: Record<GroupKey, string> = {
  general: 'כללי',
  pay: 'שכר ותשלום',
  cancel: 'ביטולים',
  courses: 'קורסים',
  vacations: 'חופשות',
  arrival: 'הגעה ונסיעות',
  payroll: 'דוחות שכר',
  manage: 'ניהול',
};
const EDIT_GROUPS: GroupKey[] = ['general', 'pay', 'cancel', 'courses', 'vacations', 'arrival', 'payroll', 'manage'];
/** ביצירה: קורסים, חופשות וניהול — רק אחרי שמירה. */
const NEW_STEPS: GroupKey[] = ['general', 'pay', 'cancel', 'arrival', 'payroll'];
/** לאיזו קבוצה שייכת כל שגיאה (לפתיחת הקבוצה / לחזרה לצעד). */
const ERROR_GROUP: Partial<Record<string, GroupKey>> = {
  name: 'general',
  contactErrors: 'general',
  rate: 'pay',
  payday: 'pay',
  paymentTermsDays: 'pay',
  taxPercent: 'pay',
  employeeNumber: 'pay',
  address: 'arrival',
  travelCostPerDirection: 'arrival',
  tripsPerDay: 'arrival',
  taxiPhone: 'arrival',
  taxiHours: 'arrival',
  taxiNightTime: 'arrival',
  payrollEmail: 'payroll',
  ccEmails: 'payroll',
  cancelPay: 'cancel',
};
const groupsWithErrors = (e: Errors): GroupKey[] =>
  [...new Set(Object.entries(e).filter(([, v]) => Boolean(v)).map(([k]) => ERROR_GROUP[k] ?? 'general'))];

/** אפשרויות "שוטף +" לבחירה (בלי הקלדה חופשית). */
const TERMS_OPTIONS = [0, 15, 30, 45, 60, 90];

const PAYMENT_OPTIONS = (Object.keys(PAYMENT_TYPE_LABELS) as PaymentType[]).map(
  (value) => ({ value, label: PAYMENT_TYPE_LABELS[value] }),
);
const ARRIVAL_OPTIONS = (Object.keys(ARRIVAL_MODE_LABELS) as ArrivalMode[])
  .filter((value) => value !== 'walk')
  .map((value) => ({ value, label: ARRIVAL_MODE_LABELS[value] }));

function draftToForm(d: ReturnType<typeof emptyDraft>): FormState {
  const reminder = d.taxi?.reminder ?? DEFAULT_TAXI_REMINDER;
  return {
    cancelPay: Object.fromEntries(
      Object.entries(d.cancelPay ?? {}).map(([k, r]) => [k, { kind: r.kind, value: r.value != null ? String(r.value) : '' }]),
    ),
    name: d.name,
    address: d.address ?? '',
    contacts: (d.contacts ?? []).map((c) => ({
      id: c.id,
      description: c.description,
      name: c.name ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
    })),
    rate: String(d.rate),
    paymentType: d.paymentType,
    payday: String(reportDeadlineDay(d)),
    paymentTermsDays: String(paymentTermsOf(d)),
    payrollEmail: d.payrollEmail ?? '',
    taxPercent: String(d.taxPercent ?? 0),
    employeeNumber: d.employeeNumber ?? '',
    ccEmails: (d.ccEmails ?? []).join(', '),
    arrivalMode: d.arrivalMode,
    travelCostPerDirection: String(d.travelCostPerDirection),
    tripsPerDay: String(d.tripsPerDay),
    taxiPhone: d.taxi?.phone ?? '',
    taxiContact: d.taxi?.contactName ?? '',
    taxiReminderKind: reminder.kind,
    taxiHours: String(reminder.kind === 'hoursBefore' ? reminder.hours : 2),
    taxiNightTime: reminder.kind === 'nightBefore' ? reminder.time : '21:00',
    colorIndex: d.colorIndex ?? 0,
    academic: d.payBasis == null ? null : d.payBasis === 'academic',
  };
}

const TAXI_REMINDER_OPTIONS: { value: TaxiReminder['kind']; label: string }[] = [
  { value: 'hoursBefore', label: 'שעות לפני' },
  { value: 'nightBefore', label: 'ערב לפני' },
  { value: 'none', label: 'בלי תזכורת' },
];

function formToReminder(f: FormState): TaxiReminder {
  if (f.taxiReminderKind === 'hoursBefore') return { kind: 'hoursBefore', hours: parseNum(f.taxiHours) };
  if (f.taxiReminderKind === 'nightBefore') return { kind: 'nightBefore', time: f.taxiNightTime };
  return { kind: 'none' };
}

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const splitEmails = (v: string) =>
  v
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);

function parseNum(value: string): number {
  return Number(value.replace(',', '.').trim());
}

export default function WorkplaceFormScreen() {
  const { basis } = usePayBasis();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; focus?: string }>();
  const id = typeof params.id === 'string' && params.id ? params.id : undefined;
  const isEdit = Boolean(id);
  // ב־web הדף מרונדר מראש בלי פרמטרים, כך שהשרת לא יודע אם זו עריכה או מקום
  // חדש. לכן הרינדור הראשון בדפדפן הוא תמיד מצב טעינה, כמו בשרת, ורק אחריו
  // הטופס — אחרת פתיחה ישירה של ?id= גורמת לאי־התאמה (#418). דגל מקומי ולא
  // useHydrated: מסכי הניווט עוברים hydration אחרי הקליפה, שכבר הדליקה את
  // הדגל הגלובלי. באנדרואיד אין רינדור מראש — מוצג מיד.
  const [hydrated, setHydrated] = useState(Platform.OS !== 'web');
  useEffect(() => setHydrated(true), []);

  const [form, setForm] = useState<FormState | null>(
    isEdit ? null : draftToForm(emptyDraft()),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  /** מקום העבודה כפי שנטען — להשוואת תנאים ולהיסטוריה */
  const [original, setOriginal] = useState<Workplace | null>(null);
  /** מאיזה תאריך חל שינוי בתנאים הכספיים */
  const [effectiveFrom, setEffectiveFrom] = useState(todayISO());
  const confirm = useConfirm();
  const { showToast } = useToast();
  /** מה יימחק עם מקום העבודה, והאם מותר (דוח שנשלח / שולם — רק ארכיון) */
  const [deletion, setDeletion] = useState<WorkplaceDeletion | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const reasons = useCancelReasons();
  const vacations = useVacations();
  /** ביצירה: הצעד בוויזארד */
  const [wizStep, setWizStep] = useState(0);
  /** בעריכה: הקבוצות הפתוחות. "עריכת כתובות" מדוח השכר (?focus=payroll) — דוחות שכר פתוחה */
  const [openGroups, setOpenGroups] = useState<GroupKey[]>(params.focus === 'payroll' ? ['payroll'] : []);
  const toggleGroup = (k: GroupKey) =>
    setOpenGroups((g) => (g.includes(k) ? g.filter((x) => x !== k) : [...g, k]));
  const scrollRef = useRef<ScrollView>(null);
  const groupY = useRef<Partial<Record<GroupKey, number>>>({});
  // הדגשה רגעית של שדות "דוחות שכר" — רקע בהיר שדוהה תוך ~2 שניות.
  const highlight = useRef(new Animated.Value(0)).current;
  const focusDone = useRef(false);

  // הקורסים של מקום העבודה — נטען מחדש בחזרה מטופס הקורס.
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let active = true;
      loadCourses().then((all) => {
        if (active) setCourses(all.filter((c) => c.workplaceId === id).sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)));
      });
      return () => {
        active = false;
      };
    }, [id]),
  );

  // מקום חדש: הצבע הפנוי הבא (המשתמש יכול לבחור אחר).
  useEffect(() => {
    if (id) return;
    let active = true;
    loadWorkplaces().then((list) => {
      if (active) setForm((prev) => (prev ? { ...prev, colorIndex: freeColor(list) } : prev));
    });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    Promise.all([loadWorkplaces(), workplaceDeletion(id)]).then(([list, del]) => {
      if (!active) return;
      const found = list.find((w) => w.id === id);
      setOriginal(found ?? null);
      setForm(found ? draftToForm(found) : draftToForm(emptyDraft()));
      setDeletion(del);
    });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (params.focus !== 'payroll' || !form || focusDone.current) return;
    focusDone.current = true;
    const t = setTimeout(() => {
      const y = groupY.current.payroll;
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
      highlight.setValue(1);
      Animated.timing(highlight, { toValue: 0, duration: 2000, useNativeDriver: false }).start();
    }, 350);
    return () => clearTimeout(t);
  }, [params.focus, form, highlight]);

  const set = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    },
    [],
  );

  function validate(state: FormState): Errors {
    const next: Errors = {};
    if (!state.name.trim()) next.name = 'יש להזין שם';

    const rate = parseNum(state.rate);
    if (!Number.isFinite(rate) || rate < 0) next.rate = 'יש להזין סכום תקין';

    const deadline = parseNum(state.payday);
    if (!Number.isInteger(deadline) || deadline < 1 || deadline > 31 || deadline === 29 || deadline === 30) {
      next.payday = 'יום בין 1 ל־28, או 31 לסוף החודש';
    }

    if (state.payrollEmail.trim() && !isEmail(state.payrollEmail.trim())) {
      next.payrollEmail = 'כתובת מייל לא תקינה';
    }
    if (splitEmails(state.ccEmails).some((e) => !isEmail(e))) {
      next.ccEmails = 'אחת הכתובות אינה תקינה (מפרידים בפסיק)';
    }
    const tax = parseNum(state.taxPercent);
    if (!Number.isFinite(tax) || tax < 0 || tax > 60) next.taxPercent = 'אחוז בין 0 ל־60';
    const terms = parseNum(state.paymentTermsDays);
    if (!Number.isInteger(terms) || terms < 0 || terms > 365) {
      next.paymentTermsDays = 'מספר ימים שלם בין 0 ל־365';
    }

    if (state.arrivalMode === 'public_transport') {
      const cost = parseNum(state.travelCostPerDirection);
      if (!Number.isFinite(cost) || cost < 0) {
        next.travelCostPerDirection = 'יש להזין עלות תקינה';
      }
      const trips = parseNum(state.tripsPerDay);
      if (!Number.isInteger(trips) || trips < 0) {
        next.tripsPerDay = 'מספר שלם, 0 ומעלה';
      }
    }
    const contactErrors: Record<string, string> = {};
    for (const c of state.contacts) {
      if (!c.phone.trim() && !c.email.trim()) contactErrors[c.id] = 'יש להזין טלפון או מייל';
      else if (c.email.trim() && !isEmail(c.email.trim())) contactErrors[c.id] = 'כתובת מייל לא תקינה';
    }
    if (Object.keys(contactErrors).length) next.contactErrors = contactErrors;

    if (isTaxi(state.arrivalMode)) {
      const phone = state.taxiPhone.replace(/[^\d+]/g, '');
      if (state.taxiPhone.trim() && phone.length < 7) next.taxiPhone = 'מספר טלפון לא תקין';
      if (state.taxiReminderKind === 'hoursBefore') {
        const h = parseNum(state.taxiHours);
        if (!Number.isFinite(h) || h <= 0 || h > 24) next.taxiHours = 'בין חצי שעה ל־24 שעות';
      }
      if (state.taxiReminderKind === 'nightBefore' && parseTime(state.taxiNightTime) == null) {
        next.taxiNightTime = 'יש להזין שעה';
      }
    }
    return next;
  }

  function addContact(row?: Partial<ContactRow>) {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            contacts: [
              ...prev.contacts,
              {
                id: makeContactId(),
                description: prev.contacts.length === 0 ? 'מזכירות' : '',
                name: '',
                phone: '',
                email: '',
                ...row,
              },
            ],
          }
        : prev,
    );
  }

  function updateContact(cid: string, patch: Partial<ContactRow>) {
    setForm((prev) =>
      prev ? { ...prev, contacts: prev.contacts.map((c) => (c.id === cid ? { ...c, ...patch } : c)) } : prev,
    );
    setErrors((prev) => {
      if (!prev.contactErrors?.[cid]) return prev;
      const { [cid]: _gone, ...rest } = prev.contactErrors;
      return { ...prev, contactErrors: rest };
    });
  }

  function removeContact(cid: string) {
    setForm((prev) => (prev ? { ...prev, contacts: prev.contacts.filter((c) => c.id !== cid) } : prev));
  }

  async function importContact() {
    const picked = await pickContact();
    if (picked) addContact({ name: picked.name, phone: picked.phone, email: picked.email });
  }

  async function chooseContact() {
    const picked = await pickContactPhone();
    if (!picked) return;
    set('taxiPhone', picked.phone);
    set('taxiContact', picked.name);
  }

  async function handleSave() {
    if (!form) return;
    const found = validate(form);
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      const bad = groupsWithErrors(found);
      if (isEdit) setOpenGroups((g) => [...new Set([...g, ...bad])]);
      else setWizStep(Math.min(...bad.map((k) => Math.max(0, NEW_STEPS.indexOf(k)))));
      return;
    }

    setSaving(true);
    await upsertWorkplace({
      id,
      name: form.name.trim(),
      colorIndex: form.colorIndex,
      payBasis: form.academic == null ? undefined : form.academic ? 'academic' : 'regular',
      address: form.address.trim() || undefined,
      contacts: form.contacts.map((c) => ({
        id: c.id,
        description: c.description.trim(),
        name: c.name.trim() || undefined,
        phone: c.phone.trim() || undefined,
        email: c.email.trim() || undefined,
      })),
      rate: parseNum(form.rate),
      paymentType: form.paymentType,
      payday: paydayFromDeadline(parseNum(form.payday)),
      paymentTermsDays: parseNum(form.paymentTermsDays),
      payrollEmail: form.payrollEmail.trim(),
      ccEmails: splitEmails(form.ccEmails),
      taxPercent: parseNum(form.taxPercent) || 0,
      employeeNumber: form.employeeNumber.trim(),
      arrivalMode: form.arrivalMode,
      travelCostPerDirection:
        form.arrivalMode === 'public_transport'
          ? parseNum(form.travelCostPerDirection)
          : 0,
      tripsPerDay:
        form.arrivalMode === 'public_transport'
          ? parseNum(form.tripsPerDay)
          : 0,
      cancelPay: Object.fromEntries(
        Object.entries(form.cancelPay)
          .filter(([, r]) => r.kind !== 'none')
          .map(([k, r]) => [k, r.kind === 'full' ? { kind: r.kind } : { kind: r.kind, value: parseNum(r.value) || 0 }]),
      ),
      taxi: isTaxi(form.arrivalMode)
        ? {
            phone: form.taxiPhone.trim(),
            contactName: form.taxiContact.trim() || undefined,
            reminder: formToReminder(form),
          }
        : undefined,
      // שינוי תנאים כספיים חל מתאריך התחולה; דיווחים קודמים נשארים בתנאים הישנים.
    }, effectiveFrom);
    router.back();
  }

  /** אי אפשר למחוק (דוח שכר נשלח / שולם) — מציעים ארכיון. */
  function handleArchive() {
    if (!id) return;
    confirm({
      title: 'להעביר לארכיון?',
      message:
        'דוחות שכר של מקום העבודה כבר נשלחו או שולמו, ולכן אי אפשר למחוק אותו. בארכיון הוא לא יוצג בלו״ז, בתזכורות ובבחירה לדיווח חדש — והדיווחים, דוחות השכר והתשלומים נשמרים. אפשר להחזיר אותו בכל עת.',
      confirmLabel: 'העברה לארכיון',
      destructive: false,
      onConfirm: async () => {
        await setWorkplaceArchived(id, true);
        showToast('מקום העבודה הועבר לארכיון');
        router.back();
      },
    });
  }

  function handleDelete() {
    if (!id || !deletion) return;
    if (!canDeleteWorkplace(deletion)) return handleArchive();
    const withData = deletionSummary(deletion);
    confirm({
      title: deletion.reports > 0 ? 'למחוק את מקום העבודה ואת כל הדיווחים שלו?' : 'להעביר לאשפה?',
      message:
        deletion.reports > 0
          ? `"${form?.name ?? ''}" יועבר לאשפה יחד עם ${withData}. אפשר לשחזר את הכול מהאשפה תוך 30 יום, ואחר כך הם נמחקים לצמיתות.\n\nאם רק הפסקת לעבוד שם — עדיף "העברה לארכיון" במסך מקום העבודה: הדיווחים נשמרים.`
          : `"${form?.name ?? ''}" יועבר לאשפה${withData ? ` יחד עם ${withData}` : ''}. אפשר לשחזר משם תוך 30 יום.`,
      confirmLabel: deletion.reports > 0 ? 'מחיקה עם הדיווחים' : 'העברה לאשפה',
      onConfirm: async () => {
        setSaving(true);
        const ok = await trashWorkplaceWithData(id);
        if (!ok) {
          setSaving(false);
          return handleArchive();
        }
        // חוזרים לרשימת מקומות העבודה — מסך הצפייה של המקום שהועבר לאשפה כבר לא קיים.
        router.dismissTo('/workplaces');
      },
    });
  }


  /** וויזארד: מעבר לצעד הבא אחרי בדיקת השדות של הצעד הנוכחי. */
  function wizNext() {
    if (!form) return;
    const found = validate(form);
    const here = Object.fromEntries(
      Object.entries(found).filter(([k, v]) => v && (ERROR_GROUP[k] ?? 'general') === NEW_STEPS[wizStep]),
    ) as Errors;
    setErrors(here);
    if (Object.keys(here).length) return;
    setWizStep((n) => Math.min(NEW_STEPS.length - 1, n + 1));
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  /** שורת התקציר של קבוצה סגורה. */
  function summaryOf(key: GroupKey): string {
    if (!form) return '';
    switch (key) {
      case 'general':
        return [form.name || 'ללא שם', form.contacts.length ? `${form.contacts.length} אנשי קשר` : null]
          .filter(Boolean)
          .join(' · ');
      case 'pay': {
        const rate = parseNum(form.rate);
        return [
          form.paymentType === 'monthly'
            ? `חודשי ${formatShekels(rate || 0)}`
            : `${formatShekels(rate || 0)} לשעה ${(form.academic ?? basis === 'academic') ? 'אקדמית' : 'רגילה'}`,
          Number(form.taxPercent) ? `מס ${form.taxPercent}%` : null,
          `שוטף + ${form.paymentTermsDays}`,
          `יום אחרון ${Number(form.payday) >= 31 ? 'סוף החודש' : form.payday}`,
        ]
          .filter(Boolean)
          .join(' · ');
      }
      case 'cancel': {
        const paid = reasons.filter((r) => (form.cancelPay[r.id]?.kind ?? 'none') !== 'none');
        return paid.length === 0 ? 'ללא תשלום על ביטולים' : `בתשלום: ${paid.map((r) => r.name.trim()).join(', ')}`;
      }
      case 'courses':
        return courses.length === 0 ? 'אין קורסים' : courses.length === 1 ? 'קורס אחד' : `${courses.length} קורסים`;
      case 'vacations': {
        const today = todayISO();
        const { inherited, own } = vacationsForWorkplace(vacations, id ?? '');
        const upcoming = [...inherited, ...own].filter((v) => v.to >= today && !(id && v.exclude.includes(id)));
        return upcoming.length === 0 ? 'אין חופשות קרובות' : upcoming.length === 1 ? 'חופשה קרובה אחת' : `${upcoming.length} חופשות קרובות`;
      }
      case 'arrival':
        return [ARRIVAL_MODE_LABELS[form.arrivalMode], form.address.trim() || null].filter(Boolean).join(' · ');
      case 'payroll':
        return form.payrollEmail.trim() || 'לא הוגדר מייל לשכר';
      case 'manage':
        return 'דוחות שכר קיימים, ארכיון ומחיקה';
    }
  }

  const highlightBg = highlight.interpolate({
    inputRange: [0, 1],
    outputRange: [`${colors.brandLight}00`, colors.brandLight],
  });

  const title = !hydrated ? 'מקום עבודה' : isEdit ? 'עריכת מקום עבודה' : 'מקום עבודה חדש';

  if (!form || !hydrated) {
    return (
      <Screen scroll={false}>
        <Stack.Screen options={{ title }} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  const isPublicTransport = form.arrivalMode === 'public_transport';
  // האם שונו התנאים הכספיים (בעריכה) — אז שואלים מאיזה תאריך השינוי חל.
  const termsDirty =
    original != null &&
    termsChanged(original, {
      rate: parseNum(form.rate),
      paymentType: form.paymentType,
      arrivalMode: form.arrivalMode,
      travelCostPerDirection: isPublicTransport ? parseNum(form.travelCostPerDirection) : 0,
      tripsPerDay: isPublicTransport ? parseNum(form.tripsPerDay) : 0,
      taxPercent: parseNum(form.taxPercent) || 0,
    });

  return (
    <Screen keyboardFooter scrollRef={scrollRef}>
      <Stack.Screen options={{ title }} />

      {/* ── קבוצות הטופס ── */}
      {(() => {
        const sections: Record<GroupKey, React.ReactNode> = {
          general: (
            <>
            <FormField label="שם מקום העבודה" error={errors.name}>
              <TextField
                value={form.name}
                onChangeText={(t) => set('name', t)}
                placeholder="מכללה / אוניברסיטה"
                invalid={Boolean(errors.name)}
              />
            </FormField>

            <FormField label="צבע" hint="מסמן את מקום העבודה בלו״ז, בדיווחים ובלוח הבקרה. משתנה יחד עם צבע המערכת.">
              <View style={styles.swatches} accessibilityRole="radiogroup">
                {workplacePalette(colors).map((c, i) => {
                  const on = form.colorIndex === i;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => set('colorIndex', i)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`צבע ${i + 1}`}
                      style={[styles.swatch, { backgroundColor: c }, on && { borderColor: colors.text }]}
                    >
                      {on ? <Text style={styles.swatchCheck}>✓</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            </FormField>

            <FormField label="אנשי קשר" hint="מזכירות, רכז/ת, מחלקת שכר — טלפון ו/או מייל">
              <View style={styles.contacts}>
                {form.contacts.map((c) => (
                  <View key={c.id} style={styles.contactCard}>
                    <View style={styles.phoneRow}>
                      <View style={{ flex: 1 }}>
                        <TextField
                          value={c.description}
                          onChangeText={(t) => updateContact(c.id, { description: t })}
                          placeholder="תיאור (למשל מזכירות)"
                        />
                      </View>
                      <Pressable
                        onPress={() => removeContact(c.id)}
                        accessibilityRole="button"
                        accessibilityLabel="הסרת איש הקשר"
                        style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.6 }]}
                      >
                        <Text style={styles.removeText}>✕</Text>
                      </Pressable>
                    </View>
                    <TextField
                      value={c.name}
                      onChangeText={(t) => updateContact(c.id, { name: t })}
                      placeholder="שם (רשות)"
                    />
                    <TextField
                      value={c.phone}
                      onChangeText={(t) => updateContact(c.id, { phone: t })}
                      phone
                      placeholder="טלפון"
                    />
                    <TextField
                      value={c.email}
                      onChangeText={(t) => updateContact(c.id, { email: t })}
                      email
                      placeholder="מייל"
                    />
                    {errors.contactErrors?.[c.id] ? (
                      <Text style={styles.contactError}>{errors.contactErrors[c.id]}</Text>
                    ) : null}
                  </View>
                ))}
                <View style={styles.chipWrap}>
                  <Pressable
                    onPress={() => addContact()}
                    style={({ pressed }) => [styles.termsChip, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.termsChipText}>+ הוספה ידנית</Text>
                  </Pressable>
                  {contactsSupported ? (
                    <Pressable
                      onPress={importContact}
                      style={({ pressed }) => [styles.termsChip, pressed && { opacity: 0.7 }]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.termsChipText}>+ מאנשי הקשר</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </FormField>
            </>
          ),
          pay: (
            <>
            <FormField label="סוג תשלום">
              <SegmentedControl
                options={PAYMENT_OPTIONS}
                value={form.paymentType}
                onChange={(v) => set('paymentType', v)}
              />
            </FormField>

            <FormField
              label={form.paymentType === 'hourly' ? 'תעריף לשעה (₪)' : 'שכר חודשי (₪)'}
              error={errors.rate}
            >
              <TextField
                value={form.rate}
                onChangeText={(t) => set('rate', t)}
                numeric
                invalid={Boolean(errors.rate)}
              />
            </FormField>

            {form.paymentType === 'hourly' ? (
              <Checkbox
                checked={form.academic ?? basis === 'academic'}
                onChange={(v) => set('academic', v)}
                label="תשלום לפי שעה אקדמית (45 דק׳)"
                hint={
                  (form.academic ?? basis === 'academic')
                    ? 'התעריף מוכפל בשעות אקדמיות. דקות שאינן משלימות שעה נכנסות למונה הדקות המצטברות של המקום.'
                    : 'התעריף מוכפל בשעות רגילות (60 דק׳). כל זמן העבודה נטו נכנס לחישוב.'
                }
              />
            ) : null}

            <FormField
              label="אחוז מס (ניכוי במקור)"
              hint="לחישוב הסכום נטו במעקב התשלומים"
              error={errors.taxPercent}
            >
              <TextField
                value={form.taxPercent}
                onChangeText={(t) => set('taxPercent', t)}
                numeric
                invalid={Boolean(errors.taxPercent)}
              />
            </FormField>

            <FormField
              label="תנאי תשלום"
              hint="מספר הימים מסוף החודש ועד שהתשלום מתקבל בפועל (ברירת מחדל: שוטף + 30)"
              error={errors.paymentTermsDays}
            >
              <ScrollView
                horizontal
                style={{ flexGrow: 0 }}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.termsRow}
              >
                {TERMS_OPTIONS.map((n) => {
                  const on = form.paymentTermsDays === String(n);
                  return (
                    <Pressable
                      key={n}
                      onPress={() => set('paymentTermsDays', String(n))}
                      style={[styles.termsChip, on && styles.termsChipOn]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.termsChipText, on && styles.termsChipTextOn]}>
                        {n === 0 ? 'שוטף' : `שוטף + ${n}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </FormField>

            <FormField
              label="יום אחרון בחודש לדיווח שכר"
              hint="חשוב: עד היום הזה (כולל) צריך לשלוח את דוח השכר — דוח שנשלח אחריו ישולם רק בחודש שאחרי. התקופה החודשית מסתיימת ביום הזה. 31 = סוף החודש."
              error={errors.payday}
            >
              <TextField
                value={form.payday}
                onChangeText={(t) => set('payday', t)}
                numeric
                invalid={Boolean(errors.payday)}
              />
            </FormField>

            <FormField label="מספר עובד" hint="רשות — יופיע בדוחות ובמיילים לשכר">
              <TextField
                value={form.employeeNumber}
                onChangeText={(t) => set('employeeNumber', t)}
                numeric
              />
            </FormField>

            {termsDirty ? (
              <FormField
                label="השינוי בתנאים חל מתאריך"
                hint="דיווחים לפני תאריך זה יחושבו לפי התנאים הקודמים"
              >
                <DateField value={effectiveFrom} onChange={setEffectiveFrom} />
              </FormField>
            ) : null}

            {original?.termsHistory?.length ? (
              <FormField label="היסטוריית תנאים">
                <View style={styles.courses}>
                  {[...original.termsHistory].reverse().map((v) => (
                    <Text key={v.until} style={styles.courseMeta}>
                      עד {formatISODate(v.until)}:{' '}
                      {v.paymentType === 'monthly' ? `חודשי ${formatShekels(v.rate)}` : `${formatShekels(v.rate)} לשעה`}
                      {' · '}
                      {ARRIVAL_MODE_LABELS[v.arrivalMode]}
                      {v.arrivalMode === 'public_transport'
                        ? ` ${formatShekels(v.travelCostPerDirection)} × ${v.tripsPerDay}`
                        : ''}
                      {v.taxPercent ? ` · מס ${v.taxPercent}%` : ''}
                    </Text>
                  ))}
                </View>
              </FormField>
            ) : null}
            </>
          ),
          arrival: (
            <>
            <FormField label="כתובת" hint="מוצגת בתזכורת לנסיעה">
              <TextField
                value={form.address}
                onChangeText={(t) => set('address', t)}
                placeholder="רחוב, מספר, עיר"
              />
            </FormField>

            <FormField label="אופן הגעה">
              <View style={styles.chipWrap}>
                {ARRIVAL_OPTIONS.map((o) => {
                  const on = form.arrivalMode === o.value;
                  return (
                    <Pressable
                      key={o.value}
                      onPress={() => set('arrivalMode', o.value)}
                      style={[styles.termsChip, on && styles.termsChipOn]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.termsChipText, on && styles.termsChipTextOn]}>{o.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </FormField>

            {isTaxi(form.arrivalMode) ? (
              <>
                <FormField
                  label="טלפון להזמנת מונית"
                  hint={
                    form.taxiContact
                      ? `מאנשי הקשר: ${form.taxiContact}`
                      : form.arrivalMode === 'taxi_voucher'
                        ? 'תחנה / רכז ההסעות שמזמינים דרכו את הפתק'
                        : 'תחנת מוניות או נהג קבוע'
                  }
                  error={errors.taxiPhone}
                >
                  <View style={styles.phoneRow}>
                    <View style={{ flex: 1 }}>
                      <TextField
                        value={form.taxiPhone}
                        onChangeText={(t) => {
                          set('taxiPhone', t);
                          set('taxiContact', '');
                        }}
                        phone
                        placeholder="050-0000000"
                        invalid={Boolean(errors.taxiPhone)}
                      />
                    </View>
                    {contactsSupported ? (
                      <Pressable
                        onPress={chooseContact}
                        style={({ pressed }) => [styles.termsChip, styles.contactBtn, pressed && { opacity: 0.7 }]}
                        accessibilityRole="button"
                      >
                        <Text style={styles.termsChipText}>מאנשי הקשר</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </FormField>

                <FormField label="תזכורת להזמנת מונית">
                  <SegmentedControl
                    options={TAXI_REMINDER_OPTIONS}
                    value={form.taxiReminderKind}
                    onChange={(v) => set('taxiReminderKind', v)}
                  />
                </FormField>

                {form.taxiReminderKind === 'hoursBefore' ? (
                  <FormField
                    label="כמה שעות לפני היציאה"
                    hint="שעת היציאה = תחילת הקורס הראשון באותו יום"
                    error={errors.taxiHours}
                  >
                    <TextField
                      value={form.taxiHours}
                      onChangeText={(t) => set('taxiHours', t)}
                      numeric
                      invalid={Boolean(errors.taxiHours)}
                    />
                  </FormField>
                ) : null}

                {form.taxiReminderKind === 'nightBefore' ? (
                  <FormField
                    label="באיזו שעה להזכיר בערב שלפני"
                    error={errors.taxiNightTime}
                  >
                    <TimeInput
                      value={form.taxiNightTime}
                      onChange={(v) => set('taxiNightTime', v)}
                      invalid={Boolean(errors.taxiNightTime)}
                    />
                  </FormField>
                ) : null}
              </>
            ) : null}

            {isPublicTransport ? (
              <>
                <FormField
                  label="עלות נסיעה לכיוון (₪)"
                  error={errors.travelCostPerDirection}
                >
                  <TextField
                    value={form.travelCostPerDirection}
                    onChangeText={(t) => set('travelCostPerDirection', t)}
                    numeric
                    invalid={Boolean(errors.travelCostPerDirection)}
                  />
                </FormField>

                <FormField
                  label="מספר נסיעות ליום"
                  hint="ברירת מחדל 2 — הלוך ושוב"
                  error={errors.tripsPerDay}
                >
                  <TextField
                    value={form.tripsPerDay}
                    onChangeText={(t) => set('tripsPerDay', t)}
                    numeric
                    invalid={Boolean(errors.tripsPerDay)}
                  />
                </FormField>
              </>
            ) : null}
            </>
          ),
          payroll: (
            <Animated.View style={[styles.highlight, { backgroundColor: highlightBg }]}>
            <FormField
              label="מייל לשכר"
              hint="לכתובת זו נשלח דוח השעות החודשי (מסך דוחות שכר)"
              error={errors.payrollEmail}
            >
              <TextField
                value={form.payrollEmail}
                onChangeText={(t) => set('payrollEmail', t)}
                placeholder="payroll@college.ac.il"
                email
                invalid={Boolean(errors.payrollEmail)}
              />
            </FormField>

            <FormField label="העתק (CC)" hint="אפשר כמה כתובות, מופרדות בפסיק" error={errors.ccEmails}>
              <TextField
                value={form.ccEmails}
                onChangeText={(t) => set('ccEmails', t)}
                placeholder="coordinator@college.ac.il, ..."
                email
                invalid={Boolean(errors.ccEmails)}
              />
            </FormField>
            </Animated.View>
          ),
          cancel: (
            <>
              <Text style={styles.courseMeta}>
                כמה המוסד משלם על מפגש שבוטל, לפי סיבת הביטול. את רשימת הסיבות עורכים ב"חגים וחופשות".
              </Text>
              {reasons
                .filter((r) => r.name.trim())
                .map((r) => {
                  const row = form.cancelPay[r.id] ?? { kind: 'none' as CancelPayKind, value: '' };
                  const setRow = (patch: Partial<CancelPayRow>) =>
                    set('cancelPay', { ...form.cancelPay, [r.id]: { ...row, ...patch } });
                  return (
                    <FormField key={r.id} label={r.name.trim()}>
                      <SelectField<CancelPayKind>
                        title={`תשלום על ביטול — ${r.name.trim()}`}
                        value={row.kind}
                        options={(Object.keys(CANCEL_PAY_LABELS) as CancelPayKind[]).map((k) => ({
                          value: k,
                          label: CANCEL_PAY_LABELS[k],
                        }))}
                        onChange={(kind) => setRow({ kind })}
                      />
                      {row.kind === 'percent' || row.kind === 'fixed' ? (
                        <TextField
                          value={row.value}
                          onChangeText={(t) => setRow({ value: t.replace(/[^\d.]/g, '') })}
                          placeholder={row.kind === 'percent' ? 'אחוז מהשכר המתוכנן (למשל 50)' : 'סכום למפגש ב־₪'}
                          numeric
                        />
                      ) : null}
                    </FormField>
                  );
                })}
            </>
          ),
          vacations: id ? <VacationsCard target={{ kind: 'workplace', id }} editable bare /> : null,
          courses: (
            <>
          <FormField
            label="קורסים קבועים"
            hint="קורס מחזורי: יום בשבוע ושעות קבועות לתקופה. משמש למילוי מהיר של דיווח ולשעות המתוכננות לחודש."
          >
            {isEdit ? (
              <View style={styles.courses}>
                {/* פעילים קודם; קורסים שהסתיימו (ארכיון) — בסוף ומעומעמים */}
                {[...courses]
                  .sort((x, y) => Number(x.to < todayISO()) - Number(y.to < todayISO()))
                  .map((c) => {
                    const ended = c.to < todayISO();
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => router.push({ pathname: '/course-form', params: { id: c.id } })}
                        style={({ pressed }) => [styles.course, ended && { opacity: 0.6 }, pressed && { opacity: 0.7 }]}
                      >
                        <Text style={styles.courseName}>
                          {c.name}
                          {ended ? ' · הסתיים (ארכיון)' : ''}
                        </Text>
                        <Text style={styles.courseMeta}>
                          {courseScheduleLabel(c)} · {dateRange(c.from, c.to, true)}
                        </Text>
                      </Pressable>
                    );
                  })}
                <Button
                  label="הוספת קורס"
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/course-form', params: { workplaceId: id } })}
                />
              </View>
            ) : (
              <Text style={styles.courseMeta}>אפשר להוסיף קורסים אחרי שמירת מקום העבודה.</Text>
            )}
          </FormField>
            </>
          ),
          manage: (
            <>
              {isEdit ? (
                <Pressable
                  onPress={() => router.push({ pathname: '/workplace', params: { id } })}
                  accessibilityRole="link"
                  style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.linkRowText}>דוחות השכר של מקום העבודה</Text>
                  <EnterChevron />
                </Pressable>
              ) : null}
          <View style={styles.actions}>
            {isEdit && deletion ? (
              canDeleteWorkplace(deletion) ? (
                <Button
                  label={deletion.reports > 0 ? 'מחיקת מקום העבודה עם כל הדיווחים' : 'העברת מקום העבודה לאשפה'}
                  variant="danger"
                  onPress={handleDelete}
                  disabled={saving}
                />
              ) : (
                <>
                  <Button label="העברה לארכיון" variant="secondary" onPress={handleArchive} disabled={saving} />
                  <Text style={styles.deleteNote}>
                    אי אפשר למחוק: {deletion.lockedPayrolls === 1 ? 'דוח שכר אחד נשלח' : `${deletion.lockedPayrolls} דוחות שכר נשלחו`} או שולמו.
                    {original?.demo ? '' : ' כדי למחוק, מבטלים בכל דוח את התשלום ואת השליחה.'}
                  </Text>
                  {original?.demo ? (
                    <Pressable
                      onPress={() => router.push('/data')}
                      accessibilityRole="link"
                      style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={styles.linkRowText}>זה מקום הדגמה — אפשר להסיר אותו ב"איפוס נתוני הדגמה"</Text>
                      <EnterChevron />
                    </Pressable>
                  ) : null}
                  {original
                    ? deletion.lockedPeriods.map((p) => {
                        const [y, m, d] = p.start.split('-').map(Number);
                        const period = currentPayPeriod(original.payday, new Date(y, m - 1, d));
                        return (
                          <Pressable
                            key={p.start}
                            onPress={() =>
                              router.push({ pathname: '/payroll-report', params: { wp: original.id, start: p.start } })
                            }
                            accessibilityRole="link"
                            style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
                          >
                            <Text style={styles.linkRowText}>
                              דוח שכר {periodTitle(period)} · {p.paid ? 'שולם' : 'נשלח'}
                            </Text>
                            <EnterChevron />
                          </Pressable>
                        );
                      })
                    : null}
                </>
              )
            ) : null}
          </View>
            </>
          ),
        };
        if (!isEdit) {
          // יצירה: וויזארד — צעד לכל קבוצה.
          const key = NEW_STEPS[wizStep];
          return (
            <>
              <View style={styles.stepper}>
                {NEW_STEPS.map((k, i) => (
                  <View key={k} style={styles.stepItem}>
                    <View style={[styles.stepDot, i <= wizStep && styles.stepDotOn]}>
                      <Text style={[styles.stepNum, i <= wizStep && styles.stepNumOn]}>{i < wizStep ? '✓' : i + 1}</Text>
                    </View>
                    <Text style={[styles.stepLabel, i === wizStep && styles.stepLabelOn]}>{GROUP_TITLES[k]}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.groupTitleBig}>{GROUP_TITLES[key]}</Text>
              {sections[key]}
              <View style={styles.actions}>
                {wizStep === NEW_STEPS.length - 1 ? (
                  <Button label="הוספה" onPress={handleSave} loading={saving} />
                ) : (
                  <Button label="המשך" onPress={wizNext} />
                )}
                {wizStep === 0 ? (
                  <Button label="ביטול" variant="secondary" onPress={() => router.back()} />
                ) : (
                  <Button label="חזרה" variant="secondary" onPress={() => setWizStep((n) => n - 1)} />
                )}
              </View>
            </>
          );
        }
        return (
          <>
            {EDIT_GROUPS.map((key) => {
              const open = openGroups.includes(key);
              return (
                <View
                  key={key}
                  style={styles.group}
                  onLayout={(e) => {
                    groupY.current[key] = e.nativeEvent.layout.y;
                  }}
                >
                  <Pressable
                    onPress={() => toggleGroup(key)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    style={({ pressed }) => [styles.groupHead, pressed && { opacity: 0.7 }]}
                  >
                    <View style={styles.groupTexts}>
                      <Text style={styles.groupTitle}>{GROUP_TITLES[key]}</Text>
                      {open ? null : (
                        <Text style={styles.groupSummary} numberOfLines={1}>
                          {summaryOf(key)}
                        </Text>
                      )}
                    </View>
                    <FoldChevron open={open} />
                  </Pressable>
                  {open ? <View style={styles.groupBody}>{sections[key]}</View> : null}
                </View>
              );
            })}
            <Button label="שמירת שינויים" onPress={handleSave} loading={saving} />
          </>
        );
      })()}

      {confirm.dialog}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    swatches: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    swatch: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 3,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatchCheck: { color: '#fff', fontSize: 18, fontWeight: '800' },
  courses: {
    gap: spacing.sm,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  linkRowText: { flex: 1, fontSize: 14, color: colors.text, textAlign: TEXT_RIGHT },
  linkRowChevron: { fontSize: 20, color: colors.textMuted },
  deleteNote: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: TEXT_RIGHT,
  },
  course: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  courseName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    textAlign: TEXT_RIGHT,
  },
  courseMeta: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: TEXT_RIGHT,
  },
  contacts: {
    gap: spacing.sm,
  },
  contactCard: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  removeBtn: {
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    fontSize: 18,
    color: colors.textMuted,
  },
  contactError: {
    fontSize: 13,
    color: colors.danger,
    textAlign: TEXT_RIGHT,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  contactBtn: {
    height: 48,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 2,
  },
  termsChip: {
    minWidth: 40,
    height: 36,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  termsChipOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  termsChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  termsChipTextOn: {
    color: colors.textOnBrand,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  groupTexts: { flex: 1, minWidth: 0, gap: 2 },
  groupTitle: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
  groupTitleBig: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
  groupSummary: { fontSize: 13, color: colors.textMuted, textAlign: TEXT_RIGHT },
  groupBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.md },
  highlight: { gap: spacing.md, borderRadius: radius.md, margin: -6, padding: 6 },
  stepper: { flexDirection: 'row', justifyContent: 'space-between' },
  stepItem: { flex: 1, alignItems: 'center', gap: 4 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  stepDotOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  stepNum: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  stepNumOn: { color: colors.textOnBrand },
  stepLabel: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  stepLabelOn: { color: colors.brand, fontWeight: '800' },
});
