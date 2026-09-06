/**
 * מילוני התרגום של האפליקציה (עברית / אנגלית).
 *
 * המבנה זהה בשתי השפות. גישה למחרוזת נעשית דרך t('namespace.key') מתוך
 * lib/i18n.tsx, עם תמיכה בהחלפת משתנים בסגנון "{name}".
 */

export type Lang = 'he' | 'en';

export type StringTree = { [key: string]: string | StringTree };

const he = {
  common: {
    back: 'חזרה',
    add: 'הוספה',
    save: 'שמירה',
    cancel: 'ביטול',
    dash: '—',
  },
  drawer: {
    openMenu: 'פתיחת התפריט',
    closeMenu: 'סגירת התפריט',
    title: 'תפריט',
    navigation: 'ניווט',
    appearance: 'מראה',
    mode: {
      light: 'בהיר',
      dark: 'כהה',
      system: 'אוטומטי',
    },
    palette: 'ערכת צבעים',
    language: 'שפה',
  },
  nav: {
    home: 'דיווח שעות',
    report: 'דיווח יום עבודה',
    reports: 'הדיווחים שלי',
    workplaces: 'מקומות עבודה',
    workplaceForm: 'מקום עבודה',
    trash: 'אשפה',
    settings: 'דקות מצטברות',
  },
  home: {
    welcome: 'ברוך הבא 👋',
    subtitle:
      'דיווח עצמי של שעות עבודה לפי מקום עבודה, כולל שעות אקדמיות, הפסקות, נסיעות וסיכומים חודשיים.',
    cardReportTitle: 'דיווח יום עבודה',
    cardReportSubtitle: 'בחירת מקום עבודה, טווח שעות והפסקות',
    cardReportsTitle: 'הדיווחים שלי',
    cardReportsSubtitle: 'רשימת ימי העבודה שדווחו וזמן העבודה נטו',
    cardWorkplacesTitle: 'מקומות עבודה',
    cardWorkplacesSubtitle: 'הגדרת תעריפים, סוג תשלום ונסיעות',
    cardSettingsTitle: 'דקות מצטברות',
    cardSettingsSubtitle: 'סיכומי החודש, שעות, נסיעות ודקות מצטברות',
    footnote:
      'שלב 2 — דיווח ימי עבודה ורשימת דיווחים פעילים. שעות אקדמיות, שכר, נסיעות ותגיות יתווספו בשלבים הבאים.',
  },
  reports: {
    title: 'הדיווחים שלי',
    subtitle: 'כל ימי העבודה שדווחו, מהחדש לישן, עם זמן העבודה נטו לכל אחד.',
    empty: 'עדיין לא נשמרו דיווחים.',
    logDay: 'דיווח יום עבודה',
  },
  report: {
    title: 'דיווח יום עבודה',
    subtitle:
      'בחירת מקום עבודה, טווח שעות והפסקות. זמן העבודה נטו מחושב אוטומטית.',
    needWorkplace: 'כדי לדווח צריך קודם להגדיר לפחות מקום עבודה אחד.',
    addWorkplace: 'הוספת מקום עבודה',
    fieldWorkplace: 'מקום עבודה',
    fieldDate: 'תאריך',
    hintDate: 'פורמט YYYY-MM-DD',
    fieldStart: 'שעת התחלה',
    fieldEnd: 'שעת סיום',
    fieldBreaks: 'הפסקות (בדקות)',
    hintBreaks: 'ניתן להוסיף כמה הפסקות; הן מנוכות מזמן העבודה',
    breakN: 'הפסקה {n}',
    removeBreakN: 'הסרת הפסקה {n}',
    addBreak: 'הוספת הפסקה',
    range: 'טווח שעות: {value}',
    net: 'זמן עבודה נטו: {value}',
    submit: 'שמירת הדיווח',
    errWorkplace: 'יש לבחור מקום עבודה',
    errDate: 'תאריך בפורמט YYYY-MM-DD',
    errTime: 'שעה בפורמט HH:MM',
    errEndBeforeStart: 'שעת הסיום חייבת להיות אחרי ההתחלה',
    errBreakValue: 'כל הפסקה: מספר דקות שלם, 0 ומעלה',
    errBreakTooLong: 'סך ההפסקות ארוך או שווה לטווח השעות',
  },
  workplaces: {
    title: 'מקומות העבודה שלי',
    subtitle:
      'לכל מוסד: תעריף, סוג תשלום, יום קבלת השכר ונתוני נסיעה. אפשר לערוך ולהוסיף בכל עת.',
    empty: 'עדיין לא הוזנו מקומות עבודה.',
    add: 'הוספת מקום עבודה',
  },
  workplaceForm: {
    titleEdit: 'עריכת מקום עבודה',
    titleNew: 'מקום עבודה חדש',
    name: 'שם מקום העבודה',
    namePlaceholder: 'מכללה / אוניברסיטה',
    paymentType: 'סוג תשלום',
    rateHourly: 'תעריף לשעה (₪)',
    rateMonthly: 'שכר חודשי (₪)',
    payday: 'יום קבלת השכר בחודש',
    paydayHint: 'מגדיר את גבולות ה״חודש״ של מקום העבודה לצורך הסיכומים',
    arrivalMode: 'אופן הגעה',
    travelCost: 'עלות נסיעה לכיוון (₪)',
    tripsPerDay: 'מספר נסיעות ליום',
    tripsPerDayHint: 'ברירת מחדל 2 — הלוך ושוב',
    saveEdit: 'שמירת שינויים',
    saveNew: 'הוספה',
    deleteConfirm: 'לחצו שוב לאישור המחיקה',
    deleteAction: 'מחיקת מקום העבודה',
    errName: 'יש להזין שם',
    errRate: 'יש להזין סכום תקין',
    errPayday: 'יום בחודש בין 1 ל־31',
    errTravelCost: 'יש להזין עלות תקינה',
    errTrips: 'מספר שלם, 0 ומעלה',
  },
  settings: {
    heading: 'דקות מצטברות',
    description:
      'כאן יוצגו התגיות: סכום עד חודש זה, שעות לחודש, נסיעות ודקות עבודה מצטברות.',
    stage: 'שלב 6',
  },
  workplace: {
    paymentType: { hourly: 'שעתי', monthly: 'חודשי' },
    arrivalMode: {
      public_transport: 'תחבורה ציבורית',
      car: 'רכב',
      walk: 'הליכה',
    },
    payHourly: '{rate} ₪ לשעה',
    payMonthly: '{rate} ₪ לחודש',
    summaryLine: '{type} · {pay} · תשלום ב־{payday} לחודש',
    arrivalLine: 'הגעה: {mode}',
  },
  reportCard: {
    deletedWorkplace: 'מקום עבודה שנמחק',
    breaks: 'הפסקות {value}',
    net: 'זמן עבודה נטו: {value}',
  },
  duration: {
    hoursShort: 'שע׳',
    minutesShort: 'דק׳',
    join: ' ו־',
  },
} as const;

const en: StringTree = {
  common: {
    back: 'Back',
    add: 'Add',
    save: 'Save',
    cancel: 'Cancel',
    dash: '—',
  },
  drawer: {
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    title: 'Menu',
    navigation: 'Navigation',
    appearance: 'Appearance',
    mode: {
      light: 'Light',
      dark: 'Dark',
      system: 'System',
    },
    palette: 'Color palette',
    language: 'Language',
  },
  nav: {
    home: 'Hours Reporting',
    report: 'Log a Work Day',
    reports: 'My Reports',
    workplaces: 'Workplaces',
    workplaceForm: 'Workplace',
    trash: 'Trash',
    settings: 'Accumulated Minutes',
  },
  home: {
    welcome: 'Welcome 👋',
    subtitle:
      'Self-reporting of work hours by workplace — academic hours, breaks, travel and monthly summaries.',
    cardReportTitle: 'Log a Work Day',
    cardReportSubtitle: 'Pick a workplace, time range and breaks',
    cardReportsTitle: 'My Reports',
    cardReportsSubtitle: 'The logged work days and their net working time',
    cardWorkplacesTitle: 'Workplaces',
    cardWorkplacesSubtitle: 'Set rates, payment type and travel',
    cardSettingsTitle: 'Accumulated Minutes',
    cardSettingsSubtitle: 'Monthly totals: hours, travel and accumulated minutes',
    footnote:
      'Stage 2 — Logging work days and the reports list are live. Academic hours, pay, travel and stats come in later stages.',
  },
  reports: {
    title: 'My Reports',
    subtitle: 'Every logged work day, newest first, with its net working time.',
    empty: 'No reports saved yet.',
    logDay: 'Log a Work Day',
  },
  report: {
    title: 'Log a Work Day',
    subtitle:
      'Pick a workplace, a time range and breaks. Net working time is calculated automatically.',
    needWorkplace: 'To log a day you first need at least one workplace.',
    addWorkplace: 'Add a workplace',
    fieldWorkplace: 'Workplace',
    fieldDate: 'Date',
    hintDate: 'Format YYYY-MM-DD',
    fieldStart: 'Start time',
    fieldEnd: 'End time',
    fieldBreaks: 'Breaks (minutes)',
    hintBreaks: 'You can add several breaks; they are deducted from working time',
    breakN: 'Break {n}',
    removeBreakN: 'Remove break {n}',
    addBreak: 'Add a break',
    range: 'Time range: {value}',
    net: 'Net working time: {value}',
    submit: 'Save report',
    errWorkplace: 'Please choose a workplace',
    errDate: 'Date in YYYY-MM-DD format',
    errTime: 'Time in HH:MM format',
    errEndBeforeStart: 'End time must be after the start time',
    errBreakValue: 'Each break: a whole number of minutes, 0 or more',
    errBreakTooLong: 'Total breaks are longer than or equal to the time range',
  },
  workplaces: {
    title: 'My workplaces',
    subtitle:
      'For each place: rate, payment type, payday and travel details. You can edit and add any time.',
    empty: 'No workplaces added yet.',
    add: 'Add a workplace',
  },
  workplaceForm: {
    titleEdit: 'Edit workplace',
    titleNew: 'New workplace',
    name: 'Workplace name',
    namePlaceholder: 'College / university',
    paymentType: 'Payment type',
    rateHourly: 'Hourly rate (₪)',
    rateMonthly: 'Monthly salary (₪)',
    payday: 'Payday of the month',
    paydayHint: 'Defines the workplace "month" boundaries used for summaries',
    arrivalMode: 'Arrival mode',
    travelCost: 'Travel cost per direction (₪)',
    tripsPerDay: 'Trips per day',
    tripsPerDayHint: 'Default 2 — there and back',
    saveEdit: 'Save changes',
    saveNew: 'Add',
    deleteConfirm: 'Tap again to confirm deletion',
    deleteAction: 'Delete workplace',
    errName: 'Please enter a name',
    errRate: 'Please enter a valid amount',
    errPayday: 'A day of the month between 1 and 31',
    errTravelCost: 'Please enter a valid cost',
    errTrips: 'A whole number, 0 or more',
  },
  settings: {
    heading: 'Accumulated Minutes',
    description:
      'This screen will show the stats: total up to this month, hours per month, travel and accumulated working minutes.',
    stage: 'Stage 6',
  },
  workplace: {
    paymentType: { hourly: 'Hourly', monthly: 'Monthly' },
    arrivalMode: {
      public_transport: 'Public transport',
      car: 'Car',
      walk: 'Walking',
    },
    payHourly: '₪{rate} / hour',
    payMonthly: '₪{rate} / month',
    summaryLine: '{type} · {pay} · paid on the {payday}',
    arrivalLine: 'Arrival: {mode}',
  },
  reportCard: {
    deletedWorkplace: 'Deleted workplace',
    breaks: 'breaks {value}',
    net: 'Net working time: {value}',
  },
  duration: {
    hoursShort: 'h',
    minutesShort: 'm',
    join: ' ',
  },
};

export const STRINGS: Record<Lang, StringTree> = { he, en };

export const LANG_LABELS: Record<Lang, string> = {
  he: 'עברית',
  en: 'English',
};

export const RTL_LANGS: readonly Lang[] = ['he'];
