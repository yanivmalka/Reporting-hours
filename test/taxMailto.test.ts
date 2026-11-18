import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-document-picker', () => ({}));
vi.mock('firebase/storage', () => ({}));
vi.mock('../lib/firebase', () => ({ APP_ID: 'reporting-hours', cloudStorage: () => null }));

import { taxMailto } from '../lib/taxFiles';
import type { Workplace } from '../lib/workplaces';

const w = { id: 'w1', name: 'מכללה', payrollEmail: 'pay@x.com', ccEmails: ['cc@x.com'] } as Workplace;

describe('טיוטת מייל לתיאום מס', () => {
  it('ברירת מחדל — למייל מחלקת השכר ולמכותבים', () => {
    const url = taxMailto(w, '2026', 'https://f');
    expect(url.startsWith('mailto:pay@x.com?')).toBe(true);
    expect(url).toContain('cc=cc%40x.com');
  });

  it('בלי מחלקת השכר — בלי נמען ובלי מכותבים', () => {
    const url = taxMailto(w, '2026', 'https://f', 'דנה', false);
    expect(url.startsWith('mailto:?')).toBe(true);
    expect(url).not.toContain('cc=');
    expect(url).toContain(encodeURIComponent('https://f'));
  });
});
