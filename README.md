# דיווח שעות (Reporting-hours)

אפליקציית אנדרואיד לדיווח עצמי של מרצים על שעות עבודה לפי מקום עבודה:
שעות אקדמיות, הפסקות, שכר, נסיעות וסיכומים חודשיים.

החזון המלא ותוכנית העבודה: [WISHLIST.md](./WISHLIST.md).

## סטאק

- **React Native + Expo (SDK 57)** ב־TypeScript — קוד אחד שרץ גם כ**אתר** (react-native-web)
  וגם כ**אפליקציית אנדרואיד**.
- **expo-router** לניווט מבוסס־קבצים (תיקיית `app/`).
- כיווניות **RTL** נכפית דרך [lib/rtl.ts](./lib/rtl.ts) ובתבנית ה־HTML [app/+html.tsx](./app/+html.tsx).
- אחסון מקומי במכשיר/דפדפן בלבד בשלב זה (ללא שרת).

## אתר (web)

- בנייה מקומית: `npm run build:web` → פלט סטטי בתיקיית `dist/`.
- פריסה: workflow ב־[.github/workflows/deploy-web.yml](./.github/workflows/deploy-web.yml)
  בונה ופורס ל־**GitHub Pages** בכל push ל־`main`.
- כתובת: `https://yanivmalka.github.io/Reporting-hours/`
  (דורש הפעלה חד־פעמית: Settings → Pages → Source = "GitHub Actions").
- ה־`baseUrl` מוגדר ל־`/Reporting-hours` ב־`app.json` בשל נתיב ה־project-site של Pages;
  יש לשנותו אם עוברים לדומיין ייעודי.

## APK (אנדרואיד)

תשתית ה־build ל־APK (EAS) תתווסף בשלב המעבר לאריזה (שלב 8). עד אז מריצים על אנדרואיד
דרך Expo Go (`npm start` + סריקת QR).

## מבנה

| נתיב | תיאור |
|------|-------|
| `app/_layout.tsx` | Stack navigator, ערכת צבעים, כפיית RTL |
| `app/+html.tsx` | תבנית HTML לגרסת web (עברית, RTL) |
| `app/index.tsx` | מסך בית עם ניווט למסכים |
| `app/report.tsx` | דיווח יום עבודה (זמני — שלב 2–4) |
| `app/workplaces.tsx` | מקומות עבודה (זמני — שלב 1) |
| `app/settings.tsx` | הגדרות ותגיות (זמני — שלב 6) |
| `components/` | רכיבים משותפים (`Screen`, `NavCard`, `Placeholder`) |
| `theme/colors.ts` | צבעים, ריווח ורדיוסים |

## הרצה

```bash
npm install
npm start          # מפעיל את Metro; לחיצה על a פותחת אמולטור אנדרואיד / Expo Go
npm run android    # הרצה ישירה על אנדרואיד
npm run typecheck  # בדיקת טייפים
npx expo-doctor    # בדיקת תקינות הפרויקט
```

## סטטוס

- [x] **שלב 0 — יסודות טכניים:** שלד Expo רץ (web + אנדרואיד), ניווט, RTL, ערכת צבעים,
      מסך בית, פריסת אתר ל־GitHub Pages.
- [ ] שלב 1 — פרופיל ומקומות עבודה
- [ ] שלב 2 — מסך דיווח בסיסי
- [ ] שלב 3 — שעות אקדמיות ודקות מצטברות
- [ ] שלב 4 — חישוב שכר
- [ ] שלב 5 — חישוב נסיעות
- [ ] שלב 6 — הגדרות משתמש: תגיות ודשבורד חודשי
- [ ] שלב 7 — סיכום חודשי אוטומטי והתראות
- [ ] שלב 8 — ליטוש ואריזה
