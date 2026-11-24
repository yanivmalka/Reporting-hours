# מפת הקוד — דיווח שעות

מפה לאיתור מהיר: איפה כל דבר נמצא ואיך הנתונים זורמים. הכללים והמוסכמות נמצאים ב־[CLAUDE.md](./CLAUDE.md), והסטאק והבנייה ב־[README.md](./README.md). כשמוסיפים קובץ או משנים זרימה, מעדכנים גם כאן.

## מבנה התיקיות

- `test/` — בדיקות יחידה (Vitest, `npm test`) לחישובי `lib/`; תחליפים ל־react-native ול־AsyncStorage ב־`test/stubs/`.

- `app/` — מסכים (expo-router, קובץ = נתיב).
- `lib/` — מודלים, אחסון וחישובים טהורים. אין בו רכיבי מסך, חוץ מ־`i18n.tsx` ו־`payBasis.tsx` שהם Providers.
- `components/` — רכיבי UI ודיאלוגים משותפים.
  - מסך גדול מפוצל לתיקייה משלו: `components/report/` (אשף הדיווח), `components/workplaceForm/` (טופס מקום עבודה), `components/journal/` (היומן). בכל אחת: `use….tsx` (hook של מצב ופעולות + פונקציית נגזרות אחרי הטעינה), רכיב לכל חלק שמקבל את הכול כ־`w`, `styles.ts` ו־`shared.ts`. קובץ המסך ב־`app/` רק מרכיב.
- `theme/` — צבעים, גופן, יישור RTL (`align.ts`), גוונים לגרפים (`shades.ts`), צבע לכל מקום עבודה (`workplaceColors.ts`).

## מודל הנתונים ומפתחות האחסון

כל מפתח רשום ב־`lib/keys.ts` (שם והיקף: `synced` / `viewerDevice` / `device`), נשמר ב־AsyncStorage (`lib/storage.ts`), ומפתחות `synced` ו־`viewerDevice` משוכפלים לענן (`lib/sync.ts`) תחת `apps/reporting-hours/users/{uid}/kv/{key}`. רק `synced` נכלל בגיבוי.

| ישות | קובץ | מפתח |
|---|---|---|
| מקום עבודה (כולל `archivedAt`, `deletedAt`, `trashed`, `termsHistory`, `colorIndex`, `cancelPay`) | `lib/workplaces.ts` | `reporting-hours/workplaces/v1` |
| דיווח (`WorkReport`, עם `courseId` אופציונלי) | `lib/reports.ts` | `reporting-hours/reports/v1` |
| קורס מחזורי | `lib/courses.ts` | `reporting-hours/courses/v1` |
| סימוני מפגש (`canceled` / `held`) | `lib/sessions.ts` | `reporting-hours/sessions/v1` |
| הגדרות דיווח במייל (הפעלה, שעה, ארכיון) | `lib/mailReport.ts` | `reporting-hours/email-report/v1` |
| דיווחים מהמייל שכבר הוצגה עליהם הודעה (לכל חשבון, במכשיר) | `components/MailSync.tsx` | `reporting-hours/mail-seen/v1` |
| נקודת ההמשך של הורדת עדכון שהושהתה (במכשיר) | `lib/update.ts` | `reporting-hours/update-download/v1` |
| נעילת האפליקציה בטביעת אצבע (במכשיר) | `lib/appLock.ts` | `reporting-hours/app-lock/v1` |
| התראות לטלפון — הפעלה וסוגים שכובו (במכשיר) | `lib/push.ts` | `reporting-hours/push/v1` |
| פרטי מפגש (הערה, הגעה, תוכן, סימון הגשה, תזכורת) | `lib/sessionNotes.ts` | `reporting-hours/session-notes/v1` |
| הגדרות ביטול אוטומטי בחגים | `lib/sessions.ts` | `reporting-hours/holiday-cancel/v2` |
| סיבות ביטול (רשימה גלובלית) | `lib/cancelReasons.ts` | `reporting-hours/cancel-reasons/v1` |
| לוח החופשות | `lib/vacations.ts` (נשמר דרך `saveVacations` ב־`lib/sessions.ts`) | `reporting-hours/vacations/v1` |
| סטטוס דוחות שכר (נשלח / שולם) | `lib/payroll.ts` | `reporting-hours/payroll/v1` |
| תבניות פירוט לדוח השכר ותבנית לכל מקום | `lib/payrollTemplate.ts` | `reporting-hours/payroll-templates/v1` |
| מונה דקות מצטברות | `lib/accumulated.ts` | `reporting-hours/accumulated/v2` |
| אופן פדיון דקות | `lib/redeem.ts` | `reporting-hours/redeem-mode/v1` |
| בסיס חישוב שכר (ברירת מחדל ישנה; לכל מקום — `Workplace.payBasis`) | `lib/payBasis.tsx` | `reporting-hours/pay-basis/v1` |
| תאריך התחלת עבודה עם המערכת | `lib/trackingStart.ts` | `reporting-hours/tracking-start/v1` |
| רמת הקיבוץ המשותפת של דיווחים (`workplace` / `course` / `courseDay`; ערכים ישנים `merged`/`split` מומרים) — לוח הבקרה, יומן, דוח שכר ומייל, ייצוא | `lib/courseGrouping.ts` | `reporting-hours/course-grouping/v1` |
| מצב צפייה בלבד (במכשיר) | `lib/viewOnly.ts` | `reporting-hours/view-only/v1` |
| יומן פעולות — כל שינוי בדיווחים עם הגרסאות לפני / אחרי (מסונכרן, 90 יום) | `lib/activityLog.ts`, `lib/activityUndo.ts`, `app/activity.tsx` | `reporting-hours/activity-log/v1` |
| מזהה מכשיר קצר ליומן הפעולות (במכשיר) | `lib/activityLog.ts` | `reporting-hours/device-id/v1` |
| מצב התאריכון ביומן (`auto` / `full` — מלא נעוץ / `week` — פס שבוע נעוץ) | `app/reports.tsx` | `reporting-hours/journal-calendar-pin/v1` |
| דקות עודפות — למונה / בדיווח (הגדרה כללית) | `lib/leftover.ts` | `reporting-hours/leftover-mode/v1` |
| פרטים אישיים | `lib/profile.ts` | `reporting-hours/profile/v1` |
| הצעות ארכיון שנדחו | `lib/recommend.ts` | `reporting-hours/recommend-dismissed/v1` |
| התראות בית שנסגרו | `lib/home.ts` | `reporting-hours/home-dismissed/v1` |
| נתוני הדגמה | `lib/demo.ts` | `reporting-hours/demo/v1`, `demo-auto/v1` |
| שפה / ערכת נושא | `lib/i18n.tsx`, `theme/ThemeContext.tsx` | `lang/v1`, `theme/v1` |
| סנכרון: מטא, בסיס למיזוג, חשבון נתונים פעיל (מקומי בלבד) | `lib/sync.ts` | `reporting-hours-sync/meta/v1`, `…/base/<key>`, `…/active/v1` |

שיתוף חשבון (`lib/sharing.ts`, מסך `app/sharing.tsx`): ההרשאות בענן, לא באחסון המקומי — `apps/reporting-hours/users/{owner}/grants/{email}` ו־`apps/reporting-hours/shared/{email}/owners/{owner}`. דיווח שמורשה יצר או ערך שומר `WorkReport.by`.

## מחזור החיים של מפגש ודיווח

אין רשומה שמורה של "ממתין לדיווח". המצב נגזר בכל טעינה:

1. **מתוכנן**: `coursesOn` / `occurrences` ב־`lib/courses.ts` מחשבות את המפגשים מהקורסים, ומדלגות על מפגשים מבוטלים דרך `CancelIndex`.
2. **מבוטל**: `lib/sessions.ts` מסמן ביטול ידני כסימון `canceled` עם סיבה. ביטול אוטומטי בחג (`lib/holidays.ts`) וחופשה מלוח החופשות (`lib/vacations.ts`, `kind: 'vacation'`) מחושבים ולא נשמרים, ו"המפגש התקיים" שומר סימון `held`. ביטול עם "דחיית כל השיעורים" (`pushSession`) נשמר כ־`moved` אל המועד הפנוי הבא אחרי סוף הקורס (`nextFreeSlot`).
3. **חסר**: מפגש שלא בוטל ואין לו דיווח (`courseReported`). מוצג בהתראות הבית (`missingAlerts` ב־`lib/home.ts`) ובלו״ז.
4. **דווח**: דיווח עם `courseId`. דיווחים ישנים בלי מזהה משויכים לפי שם הקורס או חפיפה בשעות (`covers`, `reportsOfCourse`).
5. **נעול**: הדוח לשכר של התקופה נשלח (`isLocked`) או שולם (`isPaid`), ב־`lib/payroll.ts`.

### דיווח שדווח בטעות

- **השיעור לא התקיים**: בעריכת הדיווח (אשף `app/report.tsx`, מתחת ל"חזרה", לצד "העברת השיעור לתאריך אחר") יש קישור "סימון כבוטל", שמופיע רק כשהדיווח משויך לקורס: לפי `courseId` (גם אם הקורס נערך ולא מתקיים עוד בתאריך), ובדיווח ישן בלי מזהה — לפי קורסי אותו יום. הכפתור פותח את `SessionCancelDialog`, ובאישור המפגש מסומן כמבוטל, הדיווח נמחק והדקות שהעביר למונה יורדות.
- **דיווח שגוי סתם**: "מחיקת הדיווח" במסך התצוגה (`app/report-view.tsx`), וגם בשלב הסיכום של אשף העריכה (`app/report.tsx`). המחיקה לצמיתות, בלי אשפה.
- **נשלח לשכר**: מבטלים קודם את השליחה בדוח השכר. **שולם**: הדיווח נעול לצמיתות.

## סיבות ביטול ותשלום על ביטול

- רשימת סיבות גלובלית (`lib/cancelReasons.ts`), נערכת ב"חגים וחופשות". סימון ביטול שומר את טקסט הסיבה ואת `reasonId`.
- כלל תשלום לכל מוסד ולכל סיבה (`Workplace.cancelPay`, בקבוצה "ביטולים" בעריכת מקום העבודה): ללא · מלא · אחוז · סכום קבוע (`canceledSessionPay`).
- מפגש מבוטל בתשלום: שורה בדוח השכר וסיכום לפי סיבה (`PayrollReport.canceled`, `canceledByReason`), כלול ב־`pay`, בצפי (`expectedFor`) ובפוטנציאל.

## מחיקה, ארכיון ואשפה

- הכללים ב־`lib/trash.ts`. בקצרה: מה שיש לו היסטוריה כספית עובר לארכיון ולא נמחק.
- מקום עבודה עובר לאשפה יחד עם כל הנתונים שלו (`trashWorkplaceWithData`), שנשמרים בשדה `trashed` ונמחקים אחרי 30 יום. אם דוח שכר שלו נשלח או שולם, הוא עובר רק לארכיון (`archivedAt`).
- קורס בלי דיווחים נמחק. קורס עם דיווחים מסתיים: `endDateForCourse` קובע את תאריך הסיום, והקורס עובר לארכיון.
- דיווח: אין לו אשפה ואין ארכיון. הוא נמחק כל עוד הדוח לשכר שלו לא נשלח.
- עריכת מועד של קורס (`app/course-form.tsx`) מתריעה על דיווחים ישנים בלי `courseId` שיתנתקו ועל מפגשי עבר שיופיעו כחסרים.
- מפגש נוסף לקורס (`extraKind` ב־`WorkReport`, תוויות ב־`EXTRA_SESSION_LABELS`): נבחר בשלב השעות של `app/report.tsx`, מוצג בתצוגת הדיווח, ו־`covers` ב־`lib/courses.ts` לא מחשיב אותו כמפגש המתוכנן.
- הסרת נתוני ההדגמה (`removeDemoData` ב־`lib/demo.ts`) שומרת מקום הדגמה וקורס הדגמה שיש עליהם דיווח אמיתי, והופכת אותם לרגילים.
- המסך: `app/archive.tsx`, עם בורר ארכיון / אשפה. רשימת האשפה ב־`components/TrashList.tsx`, וההצעות ב־`lib/recommend.ts`. הנתיב `app/trash.tsx` מפנה ללשונית האשפה.

## ניווט בין רשומות

- `app/report.tsx`: אריח מקום העבודה באשף ← `/workplace`. `app/course-form.tsx` (תצוגה): מקום העבודה ← `/workplace`. `app/settings.tsx`, `app/tax.tsx`: שם המקום ← `/workplace`.
- `app/report-view.tsx`: שורות לחיצות למקום העבודה (`/workplace`), לקורס (`/course-form?view=1`) ולדוח השכר של התקופה (`/payroll-report`).
- `app/payroll-report.tsx`: שם מקום העבודה ← `/workplace`; כל מפגש ← `/report-view` (לפי `PayrollSession.reportId`).
- `app/workplace-form.tsx`: כשהמחיקה חסומה, רשימת הדוחות הנעולים (`WorkplaceDeletion.lockedPeriods`) עם מעבר לכל אחד, ובמקום הדגמה ← `/data`.

## מסכים (`app/`)

| קובץ | מה יש בו |
|---|---|
| `_layout.tsx` | Stack, כותרות (☰ / חזרה מימין, ⋮ משמאל), Providers |
| `index.tsx` | בית: ברכה; שורה עליונה — כפתור דיווח ("היום הרלוונטי הבא", `nextRelevantDay`) ואריח לוח בקרה; לו״ז עם קישור "ליומן"; התראות (כולל מוסתרות) |
| `report.tsx` | אשף דיווח: כניסה ישירה (`?course&date` — מסך אחד "דיווח מפגש") או מלאה (פס שלבים); עריכה ומחיקה. הלוגיקה ב־`components/report/useReportWizard.tsx`, וכל שלב ברכיב משלו (`DateStep`, `CourseStep`, `WorkplaceStep`, `TimesStep`, `SummaryStep`, `DoneStep`, `WizardNav`) |
| `report-view.tsx` | תצוגת דיווח (קריאה בלבד), עריכה ומחיקה; נסגר לבד כשהדיווח נמחק בעריכה |
| `reports.tsx` | "יומן": בורר תכנון (`components/PlanList.tsx`) · דיווחים (`?tab=reports`); תאריכון, שורה מוצמדת (`WeekStrip`) וסינון משותפים. הלוגיקה ב־`components/journal/useJournal.tsx`; התאריכון, פס השבוע, השכבה המוצמדת ולשונית הדיווחים — רכיבים ב־`components/journal/` |
| `workplaces.tsx` / `workplace.tsx` / `workplace-form.tsx` | רשימת מקומות / פירוט מקום / עריכת מקום — קבוצות מתקפלות; מקום חדש בוויזארד; `?focus=payroll` פותח את "דוחות שכר" ומדגיש. הטופס: הלוגיקה ב־`components/workplaceForm/useWorkplaceForm.tsx`, כל קבוצה ברכיב `*Section`, והסידור (וויזארד / קבוצות) ב־`FormGroups` |
| `course-form.tsx` | קורס מחזורי |
| `dashboard.tsx` | לוח בקרה (חישובים ב־`lib/dashboard.ts`, `lib/forecast.ts`) |
| `payroll.tsx` / `payroll-report.tsx` | דוחות שכר / דוח בודד, מייל, סימון נשלח |
| `payments.tsx`, `tax.tsx`, `profile.tsx` | תשלומים, מס, פרטים אישיים |
| `archive.tsx`, `trash.tsx` | ארכיון ואשפה |
| `settings.tsx`, `data.tsx` | דקות מצטברות (מונה ובסיס חישוב שכר); ניהול נתונים וגיבוי |
| `preferences.tsx` | "הגדרות": חשבון, כללי (תחילת עבודה, שפה), תצוגה, נעילה, קישורים למסכי ההגדרה, אודות ועדכונים |
| `sharing.tsx` | שיתוף והרשאות: הוספת מורשה (מייל + רמה), שינוי רמה, הסרה, שליחת הודעה (בעלים בלבד) |
| `holidays.tsx` | חגים וחופשות: מתגי הביטול האוטומטי, לוח החופשות (`VacationBoard`) וסיבות הביטול |

## חישובים (`lib/`)

- זמן ושעות: `time.ts`, `academic.ts` (45 דק׳), `accumulated.ts`, `redeem.ts`.
- טופס הדיווח: `reportForm.ts` — אימות, תצוגה מקדימה חיה ובניית הדיווח שנשמר (טהור, עם בדיקות; משמש את `components/report/useReportWizard.tsx`).
- כסף: `pay.ts`, `payBasis.tsx`, `travel.ts`, `payroll.ts`, `forecast.ts`.
- לוח שנה: `hebrewDate.ts`, `holidays.ts`, `sessions.ts`, `vacations.ts`.
- ייצוא: `exportReports.ts` (שורות, CSV עם BOM, HTML ל־PDF — טהור, עם בדיקות); השמירה והשיתוף — `components/exportFile.ts`, המסך — `app/export.tsx`.
- התראות לטלפון: `pushPlan.ts` (מה לתזמן — טהור, עם בדיקות), `push.ts` (הגדרה, הרשאה ותזמון ב־expo-notifications).
- מסכים: `home.ts` (כולל `nextRelevantDay`), `dashboard.ts` (כולל `deadlineRelative`), `recommend.ts`, `dayStatus.ts`.
- תשתית: `migrations.ts` (הסבות נתונים לפי גרסה), `keys.ts` (מרשם המפתחות), `dates.ts` (המרות ISO), `storage.ts`, `sync.ts`, `firebase.ts`, `authPlatform(.web).ts`, `backup.ts`, `update.ts`, `rtl.ts`, `i18n.tsx`, `strings.ts`, `demo.ts`.

## רכיבים בולטים (`components/`)

- דיאלוגים: המסגרת המשותפת `Dialog` (כותרת וכפתורים קבועים, אמצע נגלל, מצב מקלדת), ועליה `ConfirmDialog`, `SessionCancelDialog`, `PaymentDialog`, `SessionSheet`.
- חופשות: `Vacations` — `VacationBoard` (הלוח המרכזי), `VacationsCard` (בדף קורס / מקום עבודה, עם "התעלם" בעריכה), `useVacationEditor`.
- ניווט וכותרות: `AppDrawer`, `Screen`, `ExitGuard`.
- תשתית: `CloudSync` (סנכרון), `BackupScheduler` / `BackupSection`, `UpdateChecker`, `DemoSeeder`, `MailSync`, `PushScheduler` (תזמון מחדש של ההתראות לטלפון ופתיחת המסך בלחיצה; ההגדרה — `PushSetting`).
- תצוגה: `Charts`, `ForecastChart`, `WorkplaceTile`, `ReportCard`, `RangeCalendar`, `WeekStrip`, `TrashList`, `PlanList`.
- טעינה: `useScreenData` (טעינת נתוני מסך: פוקוס, תוצאה ישנה, רענון אחרי החלפת נתונים, `reload`), `LoadingScreen`.
- משותפים: `Checkbox`, `FoldSection` (קבוצה מתקפלת), `MonthSlide` (החלקת חודש בתאריכון), `DateText` (לועזי + עברי בלי שבירה), `Chevrons` (חץ כניסה ‹ וחץ קיפול ⌄/⌃), `DayDot` (נקודות מצב יום — נקודה למפגשים שמתקיימים וטבעת לבוטל / הועבר / חופשה / חג — ומקרא של הסוגים שבחודש, לפי `lib/dayStatus.ts`), `useFlash` / `useFade` (הבהוב / עמעום קצר).
- קלט: `TimeInput`, `DatePicker`, `SelectField`, `TextField`.
- טופס קורס (`components/course/`): `BreakField` (הפסקה בשורה אחת), `EndTimeCalculator` (מחשבון שעת סיום, `computeEnd` ב־`lib/academic.ts`), `ExtraSessionsCard` (מפגשים נוספים עם שם, שעות ותיאור).
- אשף הדיווח: `components/report/SessionDetailsCard.tsx` — סיכום המפגש, הערה למפגש הבא והמפגשים הקודמים. את `Text` ו־`TextInput` מייבאים תמיד מ־`components/Text`.
