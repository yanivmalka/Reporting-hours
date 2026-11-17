import { describe, expect, it } from 'vitest';
import { taxStatus, type Workplace } from '../lib/workplaces';

const file = { path: 'p', name: 'tax.pdf', contentType: 'application/pdf', size: 1, uploadedAt: 1 };

describe('מצב תיאום מס לשנה', () => {
  it('חסר → נטען → נשלח; סימון "נשלח" גובר גם בלי קובץ', () => {
    const w = { id: 'w1' } as Workplace;
    expect(taxStatus(w, '2027')).toBe('missing');
    expect(taxStatus({ ...w, taxFiles: { '2027': file } }, '2027')).toBe('loaded');
    expect(taxStatus({ ...w, taxFiles: { '2027': file } }, '2026')).toBe('missing');
    expect(taxStatus({ ...w, taxFiles: { '2027': file }, taxCoordination: { '2027': '2027-01-05' } }, '2027')).toBe('sent');
    expect(taxStatus({ ...w, taxCoordination: { '2027': '2027-01-05' } }, '2027')).toBe('sent');
  });
});
