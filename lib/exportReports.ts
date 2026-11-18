/**
 * ייצוא דיווחים לקובץ — CSV (לאקסל / Google Sheets) ו־PDF (טבלה להדפסה / שליחה).
 * חישוב טהור: בחירת הדיווחים, השורות, הסיכום והתוכן של הקבצים. השמירה והשיתוף — במסך
 * (app/export.tsx, `components/exportFile.ts`).
 *
 * שורה לכל דיווח: תאריך, יום, מקום עבודה, קורס, שעות, הפסקות, נטו, שעות לתשלום (לפי בסיס
 * השכר של המקום) ושכר — רק אם בוחרים "כולל סכומים". מקום בשכר חודשי — בלי שכר לדיווח.
 */
import { netMinutes, totalBreakMinutes, type WorkReport } from './reports';
import { payableHours, reportPay } from './pay';
import { basisFor, type PayBasis } from './payBasis';
import { dateFromIso } from './dates';
import { formatShekels } from './travel';
import type { Course } from './courses';
import type { Workplace } from './workplaces';

export type ExportOptions = {
  /** טווח תאריכים (כולל) */
  from: string;
  to: string;
  /** מקום עבודה אחד, או כולם */
  workplaceId?: string | null;
  /** כולל שכר ₪ */
  withPay: boolean;
};

export type ExportRow = {
  date: string;
  weekday: string;
  workplace: string;
  course: string;
  start: string;
  end: string;
  breakMinutes: number;
  netMinutes: number;
  /** שעות לתשלום (אקדמיות או רגילות, לפי המקום) */
  payHours: number;
  basis: PayBasis;
  /** null — מקום בשכר חודשי, או בלי סכומים */
  pay: number | null;
};

export type ExportData = {
  rows: ExportRow[];
  totals: { reports: number; netMinutes: number; pay: number; workdays: number };
  /** מקומות בשכר חודשי שיש להם דיווחים בטווח — השכר שלהם אינו לפי דיווח */
  monthly: string[];
};

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export function buildExport(
  reports: readonly WorkReport[],
  workplaces: readonly Workplace[],
  courses: readonly Course[],
  basis: PayBasis,
  opts: ExportOptions,
): ExportData {
  const wp = new Map(workplaces.map((w) => [w.id, w]));
  const courseName = new Map(courses.map((c) => [c.id, c.name]));
  const chosen = reports
    .filter((r) => r.date >= opts.from && r.date <= opts.to)
    .filter((r) => !opts.workplaceId || r.workplaceId === opts.workplaceId)
    .filter((r) => wp.has(r.workplaceId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

  const monthly = new Set<string>();
  const rows: ExportRow[] = chosen.map((r) => {
    const w = wp.get(r.workplaceId)!;
    const b = basisFor(w, basis);
    const pay = opts.withPay ? reportPay(r, w, basis) : null;
    if (opts.withPay && pay == null) monthly.add(w.name);
    return {
      date: r.date,
      weekday: WEEKDAYS[dateFromIso(r.date).getDay()],
      workplace: w.name,
      course: (r.courseId && courseName.get(r.courseId)) || r.note || '',
      start: r.start,
      end: r.end,
      breakMinutes: totalBreakMinutes(r.breaks ?? []),
      netMinutes: netMinutes(r) ?? 0,
      payHours: payableHours(r, b),
      basis: b,
      pay,
    };
  });
  return {
    rows,
    totals: {
      reports: rows.length,
      netMinutes: rows.reduce((s, r) => s + r.netMinutes, 0),
      pay: rows.reduce((s, r) => s + (r.pay ?? 0), 0),
      workdays: new Set(chosen.map((r) => `${r.workplaceId}@${r.date}`)).size,
    },
    monthly: [...monthly],
  };
}

/** "DD.MM.YYYY" */
export function displayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** דקות → "H:MM" (גם מעל 24 שעות). */
export function hoursText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const basisLabel = (b: PayBasis) => (b === 'academic' ? 'אקדמיות' : 'רגילות');

function headers(withPay: boolean): string[] {
  const h = ['תאריך', 'יום', 'מקום עבודה', 'קורס / הערה', 'התחלה', 'סיום', 'הפסקות (דק׳)', 'נטו (שעות)', 'שעות לתשלום', 'סוג שעות'];
  return withPay ? [...h, 'שכר (₪)'] : h;
}

function cells(r: ExportRow, withPay: boolean): (string | number)[] {
  const c: (string | number)[] = [
    displayDate(r.date),
    r.weekday,
    r.workplace,
    r.course,
    r.start,
    r.end,
    r.breakMinutes,
    hoursText(r.netMinutes),
    round2(r.payHours),
    basisLabel(r.basis),
  ];
  return withPay ? [...c, r.pay == null ? '' : round2(r.pay)] : c;
}

/** שדה CSV: במירכאות כשיש פסיק, מירכאות או שורה חדשה. */
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV עם BOM (כדי שאקסל יזהה UTF-8 ועברית), שורת כותרות, שורה לכל דיווח ושורת סיכום.
 */
export function toCsv(data: ExportData, withPay: boolean): string {
  const lines = [headers(withPay), ...data.rows.map((r) => cells(r, withPay))];
  const total: (string | number)[] = ['סה״כ', '', '', `${data.totals.reports} דיווחים`, '', '', '', hoursText(data.totals.netMinutes), '', ''];
  if (withPay) total.push(round2(data.totals.pay));
  lines.push(total);
  return '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const esc = (s: string | number) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML מלא בעברית (RTL) לטבלה — ל־PDF ולהדפסה. */
export function toHtml(data: ExportData, withPay: boolean, title: string, subtitle: string): string {
  const head = headers(withPay).map((h) => `<th>${esc(h)}</th>`).join('');
  const body = data.rows
    .map((r) => {
      const c = cells(r, withPay).map((v, i) =>
        withPay && i === 10 && v !== '' ? formatShekels(Number(v)) : v,
      );
      return `<tr>${c.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`;
    })
    .join('');
  const summary = [
    `${data.totals.reports} דיווחים`,
    `${data.totals.workdays} ימי עבודה`,
    `${hoursText(data.totals.netMinutes)} שעות נטו`,
    withPay ? `שכר לפי דיווחים: ${formatShekels(data.totals.pay)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const monthly = withPay && data.monthly.length
    ? `<p class="note">בשכר חודשי (הסכום אינו לפי דיווח): ${esc(data.monthly.join(', '))}</p>`
    : '';
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #555; margin: 0 0 12px; font-size: 13px; }
  .sum { font-weight: 700; margin: 0 0 12px; font-size: 14px; }
  .note { color: #555; font-size: 12px; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: right; white-space: nowrap; }
  td:nth-child(4) { white-space: normal; }
  th { background: #f0f4f4; }
  tr:nth-child(even) td { background: #fafafa; }
  @page { size: A4 landscape; margin: 12mm; }
</style></head>
<body>
<h1>${esc(title)}</h1>
<p class="sub">${esc(subtitle)}</p>
<p class="sum">${esc(summary)}</p>
${monthly}
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body></html>`;
}

/**
 * שם הקובץ — באותיות לטיניות ("reports_2026-11-01_2026-11-30.csv"): שם בעברית לא נשמר נכון
 * בהורדה בדפדפן ובחלק מהאפליקציות שמקבלות את הקובץ. מקום העבודה מופיע בתוך הקובץ.
 */
export function exportFileName(opts: Pick<ExportOptions, 'from' | 'to'>, ext: 'csv' | 'pdf'): string {
  return `reports_${opts.from}_${opts.to}.${ext}`;
}
