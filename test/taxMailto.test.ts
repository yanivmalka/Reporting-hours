import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-document-picker', () => ({}));
vi.mock('firebase/storage', () => ({}));
vi.mock('firebase/functions', () => ({}));
vi.mock('../lib/firebase', () => ({ APP_ID: 'reporting-hours', cloudStorage: () => null, cloudFunctions: () => null }));
vi.mock('../lib/sync', () => ({ authUser: () => ({ name: 'Google Name' }), getAccess: () => null, flush: async () => {} }));

import { taxMailto } from '../lib/taxFiles';
import { EMPTY_PROFILE } from '../lib/profile';
import type { Workplace } from '../lib/workplaces';

const w = { id: 'w1', name: 'מכללה', payrollEmail: 'pay@x.com', ccEmails: ['cc@x.com'] } as Workplace;

describe('טיוטת מייל לתיאום מס', () => {
  it('ברירת מחדל — למייל מחלקת השכר ולמכותבים', () => {
    const url = taxMailto(w, '2026', 'https://f', EMPTY_PROFILE);
    expect(url.startsWith('mailto:pay@x.com?')).toBe(true);
    expect(url).toContain('cc=cc%40x.com');
  });

  it('בלי מחלקת השכר — בלי נמען ובלי מכותבים', () => {
    const url = taxMailto(w, '2026', 'https://f', { ...EMPTY_PROFILE, fullName: 'דנה' }, false);
    expect(url.startsWith('mailto:?')).toBe(true);
    expect(url).not.toContain('cc=');
    expect(url).toContain(encodeURIComponent('https://f'));
  });

  it('שם השולח — השם המלא מהפרטים האישיים, עם חתימה', () => {
    const url = decodeURIComponent(
      taxMailto({ ...w, employeeNumber: '77' }, '2026', 'https://f', { ...EMPTY_PROFILE, fullName: 'יניב מלכא', phone: '050' }),
    );
    expect(url).toContain('טופס תיאום מס 2026 — יניב מלכא');
    expect(url).toContain('בברכה,\nיניב מלכא\nמספר עובד 77\n050');
  });

  it('בלי שם מלא — שם חשבון Google', () => {
    expect(decodeURIComponent(taxMailto(w, '2026', 'https://f', EMPTY_PROFILE))).toContain('— Google Name');
  });
});
