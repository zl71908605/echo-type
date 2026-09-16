import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `IS_DEV_LOGIN_ENABLED` 在模块顶层求值，所以切换开关必须 `vi.resetModules()` 之后
 * 动态 `import()`，否则读到的是上一次的模块缓存。
 */
async function importDevLogin() {
  vi.resetModules();
  return import('./dev-login');
}

function createLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

describe('dev-login', () => {
  const originalFlag = process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN;
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN;
    } else {
      process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN = originalFlag;
    }
    vi.unstubAllGlobals();
  });

  it('is disabled by default', async () => {
    const { IS_DEV_LOGIN_ENABLED, isDevLoginPhone } = await importDevLogin();

    expect(IS_DEV_LOGIN_ENABLED).toBe(false);
    expect(isDevLoginPhone('13800138000')).toBe(false);
  });

  it('is enabled only when the flag is exactly "true"', async () => {
    process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN = '1';
    expect((await importDevLogin()).IS_DEV_LOGIN_ENABLED).toBe(false);

    process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN = 'true';
    expect((await importDevLogin()).IS_DEV_LOGIN_ENABLED).toBe(true);
  });

  it('matches the fixed number in every input format', async () => {
    process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN = 'true';
    const { isDevLoginPhone, DEV_LOGIN_PHONE_E164 } = await importDevLogin();

    expect(DEV_LOGIN_PHONE_E164).toBe('+8613800138000');
    for (const input of ['13800138000', '138 0013 8000', '+8613800138000', '013800138000', '+86 138 0013 8000']) {
      expect(isDevLoginPhone(input), input).toBe(true);
    }
  });

  it('rejects other valid numbers while enabled', async () => {
    process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN = 'true';
    const { isDevLoginPhone } = await importDevLogin();

    expect(isDevLoginPhone('13900139000')).toBe(false);
    expect(isDevLoginPhone('')).toBe(false);
  });

  it('never matches while the switch is off', async () => {
    const { isDevLoginPhone } = await importDevLogin();

    expect(isDevLoginPhone('13800138000')).toBe(false);
    expect(isDevLoginPhone('+8613800138000')).toBe(false);
  });

  it('exposes a dev user carrying every required supabase User field', async () => {
    const { DEV_LOGIN_USER, DEV_LOGIN_USER_ID, DEV_LOGIN_PHONE_E164, DEV_LOGIN_OTP } = await importDevLogin();

    expect(DEV_LOGIN_USER.id).toBe(DEV_LOGIN_USER_ID);
    expect(DEV_LOGIN_USER.aud).toBe('authenticated');
    expect(DEV_LOGIN_USER.created_at).toEqual(expect.any(String));
    expect(DEV_LOGIN_USER.app_metadata).toBeTypeOf('object');
    expect(DEV_LOGIN_USER.user_metadata).toMatchObject({ dev_login: true });
    expect(DEV_LOGIN_USER.phone).toBe(DEV_LOGIN_PHONE_E164);
    expect(DEV_LOGIN_OTP).toMatch(/^\d{6}$/);
  });

  it('round-trips the session flag through localStorage', async () => {
    process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN = 'true';
    vi.stubGlobal('localStorage', createLocalStorageStub());
    vi.stubGlobal('window', {});
    const { readDevLoginSession, writeDevLoginSession, clearDevLoginSession } = await importDevLogin();

    expect(readDevLoginSession()).toBe(false);
    writeDevLoginSession();
    expect(readDevLoginSession()).toBe(true);
    clearDevLoginSession();
    expect(readDevLoginSession()).toBe(false);
  });

  it('reports no session without a window (ssr and node), and writes are no-ops', async () => {
    process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN = 'true';
    const { readDevLoginSession, writeDevLoginSession, clearDevLoginSession } = await importDevLogin();

    expect(readDevLoginSession()).toBe(false);
    expect(() => writeDevLoginSession()).not.toThrow();
    expect(() => clearDevLoginSession()).not.toThrow();
  });

  it('degrades to no session when storage access throws', async () => {
    process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN = 'true';
    const denied = () => {
      throw new Error('storage denied');
    };
    vi.stubGlobal('localStorage', { getItem: denied, setItem: denied, removeItem: denied });
    vi.stubGlobal('window', {});
    const { readDevLoginSession, writeDevLoginSession, clearDevLoginSession } = await importDevLogin();

    expect(readDevLoginSession()).toBe(false);
    expect(() => writeDevLoginSession()).not.toThrow();
    expect(() => clearDevLoginSession()).not.toThrow();
  });

  it('keeps dev session helpers inert while the switch is off', async () => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
    vi.stubGlobal('window', {});
    const { readDevLoginSession, writeDevLoginSession } = await importDevLogin();

    writeDevLoginSession();
    expect(readDevLoginSession()).toBe(false);
  });
});
