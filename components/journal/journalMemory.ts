/**
 * זיכרון היומן בין כניסות: לשונית, סינון מקום עבודה והיום המסומן. כשחוזרים ליומן
 * (מתצוגת דיווח, מאשף הדיווח, מ"ליומן" במסך הסיום) — הוא נפתח באותו מקום שממנו יצאו.
 * פרמטר מפורש בכתובת (tab / wp / day) גובר. בזיכרון בלבד (לא נשמר), ותקף חצי שעה —
 * פתיחה מאוחרת יותר מתחילה מהיום, כרגיל.
 */
export type JournalMemory = { tab: 'plan' | 'reports'; wp: string | null; day: string | null; at: number };

const VALID_MS = 30 * 60 * 1000;
let memory: JournalMemory | null = null;

export function rememberJournal(m: Omit<JournalMemory, 'at'>): void {
  memory = { ...m, at: Date.now() };
}

/** מה שנשמר ביציאה האחרונה מהיומן, אם עדיין בתוקף. */
export function recallJournal(now = Date.now()): JournalMemory | null {
  return memory && now - memory.at <= VALID_MS ? memory : null;
}
