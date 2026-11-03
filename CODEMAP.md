# מפת הקוד — דיווח שעות

מפה לאיתור מהיר: איפה כל דבר נמצא ואיך הנתונים זורמים. הכללים והמוסכמות נמצאים ב־[CLAUDE.md](./CLAUDE.md), והסטאק והבנייה ב־[README.md](./README.md). כשמוסיפים קובץ או משנים זרימה, מעדכנים גם כאן.

## מבנה התיקיות

- `app/` — מסכים (expo-router, קובץ = נתיב).
- `lib/` — מודלים, אחסון וחישובים טהורים. אין בו רכיבי מסך, חוץ מ־`i18n.tsx` ו־`payBasis.tsx` שהם Providers.
- `components/` — רכיבי UI ודיאלוגים משותפים.
- `theme/` — צבעים, גופן, יישור RTL (`align.ts`), גוונים לגרפים (`shades.ts`).

## מודל הנתונים ומפתחות האחסון

כל מפתח נשמר ב־AsyncStorage (`lib/storage.ts`) ומשוכפל לענן (`lib/sync.ts`) תחת `apps/reporting-hours/users/{uid}/kv/{key}`.

| ישות | קובץ | מפתח |
|---|---|---|
| מקום עבודה (כולל `archivedAt`, `deletedAt`, `trashed`, `termsHistory`) | `lib/workplaces.ts` | `reporting-hours/workplaces/v1` |
| דיווח (`WorkReport`, עם `courseId` אופציונלי) | `lib/reports.ts` | `reporting-hours/reports/v1` |
| קורס מחזורי | `lib/courses.ts` | `reporting-hours/courses/v1` |
| סימוני מפגש (`canceled` / `held`) | `lib/sessions.ts` | `reporting-hours/sessions/v1` |
| הגדרות ביטול אוטומטי בחגים | `lib/sessions.ts` | `reporting-hours/holiday-cancel/v2` |
| סטטוס דוחות שכר (נשלח / שולם) | `lib/payroll.ts` | `reporting-hours/payroll/v1` |
| מונה דקות מצטברות | `lib/accumulated.ts` | `reporting-hours/accumulated/v2` |
| אופן פדיון דקות | `lib/redeem.ts` | `reporting-hours/redeem-mode/v1` |
| בסיס חישוב שכר | `lib/payBasis.tsx` | `reporting-hours/pay-basis/v1` |
| פרטים אישיים | `lib/profile.ts` | `reporting-hours/profile/v1` |
| הצעות ארכיון שנדחו | `lib/recommend.ts` | `reporting-hours/recommend-dismissed/v1` |
| התראות בית שנסגרו | `lib/home.ts` | `reporting-hours/home-dismissed/v1` |
| נתוני הדגמה | `lib/demo.ts` | `reporting-hours/demo/v1`, `demo-auto/v1` |
| שפה / ערכת נושא | `lib/i18n.tsx`, `theme/ThemeContext.tsx` | `lang/v1`, `theme/v1` |

## מחזור החיים של מפגש ודיווח

אין רשומה שמורה של "ממתין לדיווח". המצב נגזר בכל טעינה:

1. **מתוכנן**: `coursesOn` / `occurrences` ב־`lib/courses.ts` מחשבות את המפגשים מהקורסים, ומדלגות על מפגשים מבוטלים דרך `CancelIndex`.
2. **מבוטל**: `lib/sessions.ts` מסמן ביטול ידני כסימון `canceled` עם סיבה. ביטול אוטומטי בחג (`lib/holidays.ts`) מחושב ולא נשמר, ו"המפגש התקיים" שומר סימון `held`.
3. **חסר**: מפגש שלא בוטל ואין לו דיווח (`courseReported`). מוצג בהתראות הבית (`missingAlerts` ב־`lib/home.ts`) ובלו״ז.
4. **דווח**: דיווח עם `courseId`. דיווחים ישנים בלי מזהה משויכים לפי שם הקורס או חפיפה בשעות (`covers`, `reportsOfCourse`).
5. **נעול**: הדוח לשכר של התקופה נשלח (`isLocked`) או שולם (`isPaid`), ב־`lib/payroll.ts`.

### דיווח שדווח בטעות

- **השיעור לא התקיים**: במסך התצוגה (`app/report-view.tsx`) יש כפתור "השיעור לא התקיים — סימון כבוטל", שמופיע רק כשהדיווח משויך לקורס: לפי `courseId` (גם אם הקורס נערך ולא מתקיים עוד בתאריך), ובדיווח ישן בלי מזהה — לפי קורסי אותו יום. הכפתור פותח את `SessionCancelDialog`, ובאישור המפגש מסומן כמבוטל, הדיווח נמחק והדקות שהעביר למונה יורדות.
- **דיווח שגוי סתם**: הכפתור "מחיקת הדיווח" נמצא באשף העריכה (`app/report.tsx`), אחרי "עריכה". המחיקה לצמיתות, בלי אשפה.
- **נשלח לשכר**: מבטלים קודם את השליחה בדוח השכר. **שולם**: הדיווח נעול לצמיתות.

## מחיקה, ארכיון ואשפה

- הכללים ב־`lib/trash.ts`. בקצרה: מה שיש לו היסטוריה כספית עובר לארכיון ולא נמחק.
- מקום עבודה עובר לאשפה יחד עם כל הנתונים שלו (`trashWorkplaceWithData`), שנשמרים בשדה `trashed` ונמחקים אחרי 30 יום. אם דוח שכר שלו נשלח או שולם, הוא עובר רק לארכיון (`archivedAt`).
- קורס בלי דיווחים נמחק. קורס עם דיווחים מסתיים: `endDateForCourse` קובע את תאריך הסיום, והקורס עובר לארכיון.
- דיווח: אין לו אשפה ואין ארכיון. הוא נמחק כל עוד הדוח לשכר שלו לא נשלח.
- עריכת מועד של קורס (`app/course-form.tsx`) מתריעה על דיווחים ישנים בלי `courseId` שיתנתקו ועל מפגשי עבר שיופיעו כחסרים.
- מפגש נוסף לקורס (`extraKind` ב־`WorkReport`, תוויות ב־`EXTRA_SESSION_LABELS`): נבחר בשלב השעות של `app/report.tsx`, מוצג בתצוגת הדיווח, ו־`covers` ב־`lib/courses.ts` לא מחשיב אותו כמפגש המתוכנן.
- הסרת נתוני ההדגמה (`removeDemoData` ב־`lib/demo.ts`) שומרת מקום הדגמה וקורס הדגמה שיש עליהם דיווח אמיתי, והופכת אותם לרגילים.
- המסך: `app/archive.tsx`, עם בורר ארכיון / אשפה. רשימת האשפה ב־`components/TrashList.tsx`, וההצעות ב־`lib/recommend.ts`. הנתיב `app/trash.tsx` מפנה ללשונית האשפה.

## מסכים (`app/`)

| קובץ | מה יש בו |
|---|---|
| `_layout.tsx` | Stack, כותרות (☰ / חזרה מימין, ⋮ משמאל), Providers |
| `index.tsx` | בית: ברכה, כפתור דיווח, לו״ז, התראות |
| `report.tsx` | אשף דיווח חדש / עריכה, כולל מחיקה |
| `report-view.tsx` | תצוגת דיווח (קריאה בלבד), עריכה, "השיעור לא התקיים" |
| `reports.tsx` | הדיווחים שלי: לוח חודשי, סינון, רשימה |
| `workplaces.tsx` / `workplace.tsx` / `workplace-form.tsx` | רשימת מקומות / פירוט מקום / עריכת מקום |
| `course-form.tsx` | קורס מחזורי |
| `dashboard.tsx` | לוח בקרה (חישובים ב־`lib/dashboard.ts`, `lib/forecast.ts`) |
| `payroll.tsx` / `payroll-report.tsx` | דוחות שכר / דוח בודד, מייל, סימון נשלח |
| `payments.tsx`, `tax.tsx`, `profile.tsx` | תשלומים, מס, פרטים אישיים |
| `archive.tsx`, `trash.tsx` | ארכיון ואשפה |
| `settings.tsx`, `data.tsx` | הגדרות; ניהול נתונים וגיבוי |

## חישובים (`lib/`)

- זמן ושעות: `time.ts`, `academic.ts` (45 דק׳), `accumulated.ts`, `redeem.ts`.
- כסף: `pay.ts`, `payBasis.tsx`, `travel.ts`, `payroll.ts`, `forecast.ts`.
- לוח שנה: `hebrewDate.ts`, `holidays.ts`, `sessions.ts`.
- מסכים: `home.ts`, `dashboard.ts`, `recommend.ts`.
- תשתית: `storage.ts`, `sync.ts`, `firebase.ts`, `authPlatform(.web).ts`, `backup.ts`, `update.ts`, `rtl.ts`, `i18n.tsx`, `strings.ts`, `demo.ts`.

## רכיבים בולטים (`components/`)

- דיאלוגים: `ConfirmDialog`, `SessionCancelDialog`, `PaymentDialog`.
- ניווט וכותרות: `AppDrawer`, `Screen`, `ExitGuard`.
- תשתית: `CloudSync` (סנכרון), `BackupScheduler` / `BackupSection`, `UpdateChecker`, `DemoSeeder`.
- תצוגה: `Charts`, `ForecastChart`, `WorkplaceTile`, `ReportCard`, `RangeCalendar`, `WeekStrip`, `TrashList`.
- קלט: `TimeInput`, `DatePicker`, `SelectField`, `TextField`. את `Text` ו־`TextInput` מייבאים תמיד מ־`components/Text`.
