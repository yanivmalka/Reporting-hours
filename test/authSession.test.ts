import { describe, expect, it } from 'vitest';
import { authenticateWithRecovery, createAuthSession, type AuthDriver, type AuthResult } from '../lib/authSession';

/** מודול זיהוי מדומה: כמו expo-local-authentication — בקשה חדשה בזמן שקודמת פתוחה ← app_cancel. */
function fakeDriver() {
  let open: ((r: AuthResult) => void) | null = null;
  const calls = { authenticate: 0, cancel: 0 };
  const d: AuthDriver & { calls: typeof calls; succeed(): void; hang: boolean } = {
    calls,
    hang: false,
    authenticate() {
      calls.authenticate++;
      if (open) return Promise.resolve({ success: false, error: 'app_cancel' });
      return new Promise<AuthResult>((res) => {
        open = res;
      });
    },
    async cancel() {
      calls.cancel++;
      const o = open;
      open = null;
      o?.({ success: false, error: 'user_cancel' });
    },
    succeed() {
      const o = open;
      open = null;
      o?.({ success: true });
    },
  };
  return d;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('זיהוי — התאוששות מבקשה תקועה', () => {
  it('app_cancel ← ביטול וניסיון חוזר', async () => {
    const d = fakeDriver();
    void d.authenticate(); // בקשה "תקועה" במודול (חלון שנסגר בלי תוצאה)
    const p = authenticateWithRecovery(d);
    await tick();
    expect(d.calls.cancel).toBe(1);
    d.succeed();
    expect(await p).toBe(true);
  });

  it('שגיאה שאינה app_cancel — בלי ניסיון חוזר', async () => {
    const d: AuthDriver = {
      authenticate: async () => ({ success: false, error: 'user_cancel' }),
      cancel: async () => {
        throw new Error('לא אמור להיקרא');
      },
    };
    expect(await authenticateWithRecovery(d)).toBe(false);
  });

  it('חריגה מהמודול ← false', async () => {
    const d: AuthDriver = {
      authenticate: async () => {
        throw new Error('x');
      },
      cancel: async () => {},
    };
    expect(await authenticateWithRecovery(d)).toBe(false);
  });

  it('קריאות חופפות — חלון אחד', async () => {
    const d = fakeDriver();
    const s = createAuthSession(d);
    let unlocked = 0;
    const a = s.run(() => unlocked++);
    const b = s.run(() => unlocked++);
    expect(a).toBe(b);
    d.succeed();
    expect(await a).toBe(true);
    expect(unlocked).toBe(1);
    expect(s.pendingId()).toBeNull();
  });

  it('בקשה שנזנחה (חזרה מהרקע) — הלחיצה הבאה פותחת חלון חדש ומצליחה', async () => {
    const d = fakeDriver();
    const s = createAuthSession(d);
    let unlocked = false;
    const stuck = s.run(() => (unlocked = true));
    await tick();
    const id = s.pendingId()!;
    s.abandon(id);
    expect(await stuck).toBe(false); // בוטלה במודול
    const again = s.run(() => (unlocked = true));
    expect(again).not.toBe(stuck);
    await tick();
    d.succeed();
    expect(await again).toBe(true);
    expect(unlocked).toBe(true);
  });

  it('זניחה של בקשה שכבר הסתיימה — לא נוגעת בבקשה החדשה', async () => {
    const d = fakeDriver();
    const s = createAuthSession(d);
    const first = s.run(() => {});
    await tick();
    const oldId = s.pendingId()!;
    d.succeed();
    await first;
    const second = s.run(() => {});
    await tick();
    s.abandon(oldId);
    expect(d.calls.cancel).toBe(0);
    d.succeed();
    expect(await second).toBe(true);
  });
});
