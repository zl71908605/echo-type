import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { switchDatabaseForUser } from '@/lib/db';
import {
  clearDevLoginSession,
  DEV_LOGIN_OTP,
  DEV_LOGIN_PHONE_E164,
  DEV_LOGIN_USER,
  DEV_LOGIN_USER_ID,
  isDevLoginPhone,
  readDevLoginSession,
  writeDevLoginSession,
} from '@/lib/dev-login';
import { INVALID_OTP_ERROR, INVALID_PHONE_ERROR, isValidPhone, normalizePhone } from '@/lib/phone';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useSyncStore } from '@/stores/sync-store';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isConfigured: boolean;
  phoneAuthLoading: boolean;
  phoneAuthError: string | null;
  phoneOtpSent: boolean;
  pendingPhone: string | null;
  initialize: () => Promise<void>;
  signInWithPhone: (phone: string) => Promise<boolean>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<boolean>;
  resetPhoneAuth: () => void;
  signOut: () => Promise<void>;
}

let initialized = false;
let initializePromise: Promise<void> | null = null;
let authSubscription: { unsubscribe: () => void } | null = null;
let lastSyncedUserId: string | null = null;

function syncAfterAuthentication(user: User | null) {
  if (!user) {
    lastSyncedUserId = null;
    return;
  }
  if (lastSyncedUserId === user.id) return;
  lastSyncedUserId = user.id;
  void useSyncStore.getState().triggerFullSync();
}

/**
 * 建立本地开发会话：写标记 → 切库 → 落 state。
 *
 * 必须先切库再暴露 user，与真实登录路径语义一致（settings 页的注释也强调了这一点：
 * 若先暴露用户，下一个渲染周期可能读到上一个用户的库）。
 *
 * 刻意不调用 `syncAfterAuthentication`：本地开发身份没有云端用户，同步既无意义，
 * 又有把真实账号数据拉进开发库的风险。
 */
async function establishDevSession(): Promise<void> {
  writeDevLoginSession();
  await switchDatabaseForUser(DEV_LOGIN_USER_ID);
  useAuthStore.setState({
    user: DEV_LOGIN_USER,
    isAuthenticated: true,
    isLoading: false,
  });
}

async function resolveInitialUser(supabase: NonNullable<ReturnType<typeof createClient>>): Promise<User | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (user) {
    return user;
  }

  if (error) {
    console.warn('Auth initialization fell back to getSession after getUser failed.', error.message);
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.user ?? null;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  isConfigured: false,
  phoneAuthLoading: false,
  phoneAuthError: null,
  phoneOtpSent: false,
  pendingPhone: null,

  initialize: async () => {
    if (initialized) return;
    if (initializePromise) return initializePromise;

    initializePromise = (async () => {
      const configured = isSupabaseConfigured();
      const supabase = createClient();

      // 订阅先于开发会话早退建立：这样开发登出后立刻用真实账号登录，能在同一次页面
      // 生命周期内生效，不需要重置 initialized。
      if (supabase) {
        set({ isConfigured: true });

        if (!authSubscription) {
          const {
            data: { subscription },
          } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
            // 开发会话期间忽略一切真实 auth 事件（INITIAL_SESSION / 无 cookie 的 null
            // session / 旧 cookie 的 SIGNED_IN / TOKEN_REFRESHED），否则本地开发身份会被冲掉。
            // 闸门读的是事件发生时刻的标记位，所以 signOut 清掉标记后真实事件立刻恢复生效。
            if (readDevLoginSession()) return;

            void switchDatabaseForUser(session?.user?.id ?? null).then(() => {
              set({
                user: session?.user ?? null,
                isAuthenticated: !!session?.user,
                isLoading: false,
              });
              syncAfterAuthentication(session?.user ?? null);
            });
          });
          authSubscription = subscription;
        }
      }

      // 开发会话恢复：在触碰 Supabase 之前早退，不走 getUser、不触发云同步。
      if (readDevLoginSession()) {
        await switchDatabaseForUser(DEV_LOGIN_USER_ID);
        set({
          user: DEV_LOGIN_USER,
          isAuthenticated: true,
          isLoading: false,
          isConfigured: configured,
        });
        initialized = true;
        return;
      }

      // 未配置 Supabase 且无开发会话：维持原有纯离线行为。
      if (!supabase) {
        initialized = true;
        set({ isLoading: false, isConfigured: false });
        return;
      }

      const user = await resolveInitialUser(supabase);
      await switchDatabaseForUser(user?.id ?? null);

      set({
        user,
        isAuthenticated: !!user,
        isLoading: false,
      });
      syncAfterAuthentication(user);

      initialized = true;
    })()
      .catch((error) => {
        initialized = false;
        set({ isLoading: false, isConfigured: isSupabaseConfigured() });
        throw error;
      })
      .finally(() => {
        initializePromise = null;
      });

    return initializePromise;
  },

  signInWithPhone: async (phone: string) => {
    // 开发号码判定放在 isValidPhone 之前：固定号码是常量，不该被格式校验挡掉，
    // 且命中时完全跳过 Supabase（不发短信、无需网络）。
    if (isDevLoginPhone(phone)) {
      set({ phoneAuthLoading: false, phoneAuthError: null, phoneOtpSent: true, pendingPhone: DEV_LOGIN_PHONE_E164 });
      return true;
    }

    if (!isValidPhone(phone)) {
      set({ phoneAuthLoading: false, phoneAuthError: INVALID_PHONE_ERROR });
      return false;
    }

    set({ phoneAuthLoading: true, phoneAuthError: null });
    const supabase = createClient();
    if (!supabase) {
      set({ phoneAuthLoading: false, phoneAuthError: 'Auth service not configured' });
      return false;
    }

    const normalized = normalizePhone(phone);
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalized,
      options: { channel: 'sms', shouldCreateUser: true },
    });

    if (error) {
      set({ phoneAuthLoading: false, phoneAuthError: error.message });
      return false;
    }

    set({ phoneAuthLoading: false, phoneOtpSent: true, pendingPhone: normalized });
    return true;
  },

  verifyPhoneOtp: async (phone: string, token: string) => {
    if (isDevLoginPhone(phone)) {
      if (token !== DEV_LOGIN_OTP) {
        set({ phoneAuthLoading: false, phoneAuthError: INVALID_OTP_ERROR });
        return false;
      }

      set({ phoneAuthLoading: true, phoneAuthError: null });
      await establishDevSession();
      set({ phoneAuthLoading: false, phoneOtpSent: false, pendingPhone: null });
      return true;
    }

    set({ phoneAuthLoading: true, phoneAuthError: null });
    const supabase = createClient();
    if (!supabase) {
      set({ phoneAuthLoading: false, phoneAuthError: 'Auth service not configured' });
      return false;
    }

    const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error) {
      set({ phoneAuthLoading: false, phoneAuthError: error.message });
      return false;
    }

    set({ phoneAuthLoading: false, phoneOtpSent: false, pendingPhone: null });
    return true;
  },

  resetPhoneAuth: () => {
    set({ phoneAuthLoading: false, phoneAuthError: null, phoneOtpSent: false, pendingPhone: null });
  },

  signOut: async () => {
    // 本地开发会话没有云端会话，必须在 Supabase 早退之前清掉，否则未配置 Supabase 时
    // 点「退出登录」不会有任何反应（旧实现在这里直接 return）。
    clearDevLoginSession();
    lastSyncedUserId = null;

    const supabase = createClient();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (error) {
        console.warn('Supabase sign-out failed; clearing the local session anyway.', error);
      }
    }

    await switchDatabaseForUser(null);
    set({
      user: null,
      isAuthenticated: false,
      phoneOtpSent: false,
      pendingPhone: null,
      phoneAuthError: null,
    });
  },
}));
