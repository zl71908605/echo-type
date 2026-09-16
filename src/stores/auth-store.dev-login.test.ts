import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 开发环境登录的 auth-store 行为。刻意独立成文件（而不是塞进 auth-store.test.ts），
 * 因为这里需要在 `NEXT_PUBLIC_ENABLE_DEV_LOGIN=true` 下重新导入模块，和那份文件的
 * mock 布局混在一起容易互相污染。
 */

const createClientMock = vi.fn();
const isSupabaseConfiguredMock = vi.fn();
const switchDatabaseForUserMock = vi.fn();
const triggerFullSyncMock = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: createClientMock,
  isSupabaseConfigured: isSupabaseConfiguredMock,
}));

vi.mock('@/lib/db', () => ({
  switchDatabaseForUser: switchDatabaseForUserMock,
}));

vi.mock('@/stores/sync-store', () => ({
  useSyncStore: {
    getState: () => ({ triggerFullSync: triggerFullSyncMock }),
  },
}));

/** 模拟「本机没有配置 Supabase」：这是开发环境登录要覆盖的主要场景。 */
function configureOffline() {
  isSupabaseConfiguredMock.mockReturnValue(false);
  createClientMock.mockReturnValue(null);
}

function installBrowserGlobals() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  });
  vi.stubGlobal('window', {});
}

describe('auth-store dev login', () => {
  const originalFlag = process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN = 'true';
    installBrowserGlobals();
    configureOffline();
    switchDatabaseForUserMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN;
    } else {
      process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN = originalFlag;
    }
    vi.unstubAllGlobals();
  });

  it('signs in with the fixed phone and code without touching Supabase', async () => {
    const { DEV_LOGIN_PHONE_E164 } = await import('@/lib/dev-login');
    const { useAuthStore } = await import('./auth-store');

    const sent = await useAuthStore.getState().signInWithPhone('13800138000');

    expect(sent).toBe(true);
    expect(createClientMock).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      phoneOtpSent: true,
      pendingPhone: DEV_LOGIN_PHONE_E164,
      phoneAuthError: null,
    });

    const verified = await useAuthStore.getState().verifyPhoneOtp(DEV_LOGIN_PHONE_E164, '123456');

    expect(verified).toBe(true);
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      isLoading: false,
      user: expect.objectContaining({ id: 'dev-local-user', phone: DEV_LOGIN_PHONE_E164 }),
    });
  });

  it('rejects a wrong code with the invalid-otp sentinel', async () => {
    const { INVALID_OTP_ERROR } = await import('@/lib/phone');
    const { useAuthStore } = await import('./auth-store');

    await useAuthStore.getState().signInWithPhone('13800138000');
    const verified = await useAuthStore.getState().verifyPhoneOtp('+8613800138000', '000000');

    expect(verified).toBe(false);
    expect(useAuthStore.getState()).toMatchObject({
      phoneAuthError: INVALID_OTP_ERROR,
      isAuthenticated: false,
    });
    expect(switchDatabaseForUserMock).not.toHaveBeenCalled();
  });

  it('switches to the dev database without starting a cloud sync', async () => {
    const { useAuthStore } = await import('./auth-store');

    await useAuthStore.getState().signInWithPhone('13800138000');
    await useAuthStore.getState().verifyPhoneOtp('+8613800138000', '123456');

    expect(switchDatabaseForUserMock).toHaveBeenCalledWith('dev-local-user');
    expect(triggerFullSyncMock).not.toHaveBeenCalled();
  });

  it('restores the dev session on initialize without resolving a supabase user', async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    const getUser = vi.fn();
    createClientMock.mockReturnValue({
      auth: {
        getUser,
        getSession: vi.fn(),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
    });

    const { writeDevLoginSession, DEV_LOGIN_PHONE_E164 } = await import('@/lib/dev-login');
    writeDevLoginSession();

    const { useAuthStore } = await import('./auth-store');
    await useAuthStore.getState().initialize();

    expect(getUser).not.toHaveBeenCalled();
    expect(switchDatabaseForUserMock).toHaveBeenCalledWith('dev-local-user');
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      isLoading: false,
      user: expect.objectContaining({ phone: DEV_LOGIN_PHONE_E164 }),
    });
    expect(triggerFullSyncMock).not.toHaveBeenCalled();
  });

  it('ignores a null supabase session while the dev session is active', async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    let authCallback: ((event: string, session: unknown) => void) | undefined;
    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn((callback) => {
          authCallback = callback;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
      },
    });

    const { writeDevLoginSession } = await import('@/lib/dev-login');
    writeDevLoginSession();

    const { useAuthStore } = await import('./auth-store');
    await useAuthStore.getState().initialize();

    authCallback?.('INITIAL_SESSION', null);
    await Promise.resolve();

    expect(useAuthStore.getState().user?.id).toBe('dev-local-user');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    // 闸门拦截后回调不会把库切回匿名库
    expect(switchDatabaseForUserMock).not.toHaveBeenCalledWith(null);
  });

  it('clears the dev session on signOut and falls back to the anonymous database', async () => {
    const { writeDevLoginSession, readDevLoginSession } = await import('@/lib/dev-login');
    writeDevLoginSession();

    const { useAuthStore } = await import('./auth-store');
    await useAuthStore.getState().signInWithPhone('13800138000');
    await useAuthStore.getState().verifyPhoneOtp('+8613800138000', '123456');

    await useAuthStore.getState().signOut();

    expect(readDevLoginSession()).toBe(false);
    expect(switchDatabaseForUserMock).toHaveBeenLastCalledWith(null);
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      phoneOtpSent: false,
      pendingPhone: null,
    });
  });

  it('ignores the dev credentials when the switch is off', async () => {
    delete process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN;
    vi.resetModules();
    configureOffline();

    const { useAuthStore } = await import('./auth-store');
    const sent = await useAuthStore.getState().signInWithPhone('13800138000');

    expect(sent).toBe(false);
    expect(useAuthStore.getState()).toMatchObject({
      phoneAuthError: 'Auth service not configured',
      phoneOtpSent: false,
    });
    expect(switchDatabaseForUserMock).not.toHaveBeenCalled();
  });
});
