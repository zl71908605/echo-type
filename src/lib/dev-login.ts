/**
 * 开发环境登录（dev-only）。
 *
 * 仅当 `NEXT_PUBLIC_ENABLE_DEV_LOGIN === 'true'` 时生效：用固定手机号 + 固定验证码在本地
 * 伪造一个会话，不发真实短信、不访问 Supabase，因此在没有配置 Supabase 的本机也能登进
 * Dashboard。生产构建默认关闭。
 *
 * `NEXT_PUBLIC_*` 在构建期解析并固化进客户端 bundle（实测：生产构建后即使给 `next start`
 * 的运行时环境显式设置该变量，登录页也不会出现开发区块），所以生产包里的行为无法在部署
 * 阶段被误开启。这也意味着改开关必须重启 dev server，且必须写成静态字面量成员访问——
 * 动态取值（如 `process.env[name]`）不会被解析。
 *
 * 本模块只依赖 `@/lib/phone` 与 supabase-js 的 `User` 类型——不要 import supabase client
 * 或任何 store，否则会成环，并破坏 `auth-store.test.ts` 的 `vi.mock` 布局。
 */

import type { User } from '@supabase/supabase-js';
import { normalizePhone } from '@/lib/phone';

export const IS_DEV_LOGIN_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === 'true';

/** 固定开发手机号，用国内 11 位写法，与登录页 placeholder 同风格。 */
export const DEV_LOGIN_PHONE = '13800138000';

/** 归一化后的 E.164 形式；store 与判定函数统一用它比对，避免多份真相。 */
export const DEV_LOGIN_PHONE_E164 = normalizePhone(DEV_LOGIN_PHONE);

/** 固定开发验证码。 */
export const DEV_LOGIN_OTP = '123456';

/** 固定用户 id。刻意不用 UUID，Dexie 库名 `echotype:user:dev-local-user` 一眼可辨，也不会撞真实用户库。 */
export const DEV_LOGIN_USER_ID = 'dev-local-user';

const DEV_LOGIN_STORAGE_KEY = 'echotype_dev_login_session';
const DEV_LOGIN_STORAGE_VALUE = 'v1';

/**
 * 是否命中开发手机号。走 `normalizePhone`，所以 `13800138000` / `138 0013 8000` /
 * `+8613800138000` 都能命中；开关关闭时恒为 `false`。
 */
export function isDevLoginPhone(input: string): boolean {
  return IS_DEV_LOGIN_ENABLED && normalizePhone(input) === DEV_LOGIN_PHONE_E164;
}

/**
 * 开发会话只存一个标记位，用户对象由 `DEV_LOGIN_USER` 推导——存 JSON 只会带来陈旧数据
 * 和一个多余的解析分支。
 *
 * 三个函数都带 `typeof window` 守卫：vitest 跑在 node 环境（没有 localStorage），
 * SSR 期间同样没有。存储不可用（隐私模式）时静默降级为"无会话"。
 */
export function readDevLoginSession(): boolean {
  if (!IS_DEV_LOGIN_ENABLED || typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(DEV_LOGIN_STORAGE_KEY) === DEV_LOGIN_STORAGE_VALUE;
  } catch {
    return false;
  }
}

export function writeDevLoginSession(): void {
  if (!IS_DEV_LOGIN_ENABLED || typeof window === 'undefined') return;
  try {
    localStorage.setItem(DEV_LOGIN_STORAGE_KEY, DEV_LOGIN_STORAGE_VALUE);
  } catch {
    // 存储不可用；本次会话仍然成立，只是刷新后需要重新登录
  }
}

export function clearDevLoginSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(DEV_LOGIN_STORAGE_KEY);
  } catch {
    // 存储不可用，无需处理
  }
}

/**
 * dev-only 的假 `User`。
 *
 * 这里补齐了 supabase-js `User` 的全部必填字段（`id` / `app_metadata` / `user_metadata` /
 * `aud` / `created_at`），因此**不需要 `as User` 断言**——将来 supabase-js 新增必填字段时
 * `pnpm typecheck` 会直接报错，而不是在运行时静默出错。
 *
 * 应用实际只读 `id`（`switchDatabaseForUser`）、`phone` / `user_metadata`（`user-menu.tsx`
 * 与 `landing-nav.tsx` 的昵称、头像、缩写）。`user_metadata.dev_login` 供 UI 将来区分开发身份。
 */
export const DEV_LOGIN_USER: User = {
  id: DEV_LOGIN_USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2024-01-01T00:00:00.000Z',
  app_metadata: { provider: 'phone', providers: ['phone'] },
  user_metadata: { dev_login: true },
  phone: DEV_LOGIN_PHONE_E164,
  phone_confirmed_at: '2024-01-01T00:00:00.000Z',
};
