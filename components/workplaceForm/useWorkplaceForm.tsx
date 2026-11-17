import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Animated, Platform, ScrollView } from 'react-native';
import { usePayBasis } from '../../lib/payBasis';
import { useCancelReasons } from '../../lib/cancelReasons';
import { formatShekels } from '../../lib/travel';
import { loadCourses, type Course } from '../../lib/courses';
import { useVacations, vacationsForWorkplace } from '../../lib/vacations';
import { todayISO } from '../../lib/time';
import { useConfirm } from '../ConfirmDialog';
import { useToast } from '../Toast';
import { canDeleteWorkplace, deletionSummary, trashWorkplaceWithData, workplaceDeletion, type WorkplaceDeletion } from '../../lib/trash';
import { pickContact, pickContactPhone } from '../../lib/contacts';
import { parseTime } from '../../lib/time';
import { ARRIVAL_MODE_LABELS, paydayFromDeadline, emptyDraft, freeColor, isTaxi, makeContactId, termsChanged, type Workplace, loadWorkplaces, setWorkplaceArchived, upsertWorkplace } from '../../lib/workplaces';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { ContactRow, FormState, Errors, GroupKey, NEW_STEPS, ERROR_GROUP, groupsWithErrors, draftToForm, formToReminder, isEmail, splitEmails, parseNum } from './shared';
import { makeWorkplaceFormStyles as makeStyles } from './styles';

/**
 * הלוגיקה של טופס מקום העבודה (app/workplace-form.tsx): טעינה, מצב הטופס,
 * אימות, שמירה, מחיקה / ארכיון, אנשי קשר ותזכורת מונית.
 * useWorkplaceForm — כל ה־hooks והפעולות; workplaceFormView — נגזרות אחרי שהטופס נטען.
 * רכיבי הקבוצות (components/workplaceForm/*Section.tsx) מקבלים את שניהם יחד כ־`w`.
 */
export function useWorkplaceForm() {
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

  return {
    basis,
    router,
    styles,
    colors,
    params,
    id,
    isEdit,
    hydrated,
    setHydrated,
    form,
    setForm,
    errors,
    setErrors,
    saving,
    setSaving,
    original,
    setOriginal,
    effectiveFrom,
    setEffectiveFrom,
    confirm,
    showToast,
    deletion,
    setDeletion,
    courses,
    setCourses,
    reasons,
    vacations,
    wizStep,
    setWizStep,
    openGroups,
    setOpenGroups,
    toggleGroup,
    scrollRef,
    groupY,
    highlight,
    focusDone,
    set,
    highlightBg,
    title,
    validate,
    addContact,
    updateContact,
    removeContact,
    importContact,
    chooseContact,
    handleSave,
    handleArchive,
    handleDelete,
    wizNext,
    summaryOf,
  };
}

export type WorkplaceFormCore = ReturnType<typeof useWorkplaceForm>;

/** נגזרות אחרי הטעינה — נקרא רק כשהטופס נטען. */
export function workplaceFormView(core: WorkplaceFormCore & { form: FormState }) {
  const { form, original } = core;
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

  return {
    form,
    isPublicTransport,
    termsDirty,
  };
}

/** כל מה שרכיבי התצוגה מקבלים: המצב והפעולות, ונגזרות אחרי הטעינה. */
export type WorkplaceFormModel = WorkplaceFormCore & ReturnType<typeof workplaceFormView>;
