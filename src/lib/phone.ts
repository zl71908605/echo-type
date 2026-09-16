/**
 * 手机号归一化与校验。
 *
 * 当前只支持中国大陆号码（`+86`）。若要支持多国，把 `PHONE_COUNTRY_CODE`
 * 换成国家码选择器，并让 `isValidPhone` 按国家码分支。
 */

export const PHONE_COUNTRY_CODE = '+86';

/** store 在本地校验失败时写入的错误哨兵，由登录页映射为本地化文案。 */
export const INVALID_PHONE_ERROR = 'invalid_phone';

/**
 * 验证码错误哨兵（目前只有开发登录会写入）。取值刻意保留 `invalid` 子串：即使登录页的
 * 精确匹配分支被改动，`getLocalizedError` 的兜底子串规则仍会映射到 `errorInvalidOtp`。
 */
export const INVALID_OTP_ERROR = 'invalid_otp';

/**
 * Supabase 要求 E.164 格式，但用户的输入习惯各不相同：
 * `13800138000`、`013800138000`、`138 0013 8000`、`+86 138 0013 8000`
 * 都应归一化为 `+8613800138000`。
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  const national = digits
    .replace(/^0+/, '') // 长途冠码
    .replace(/^86(?=\d{11}$)/, ''); // 用户已自带的国家码
  return `${PHONE_COUNTRY_CODE}${national}`;
}

/** 归一化后按中国大陆号段校验（`1[3-9]` 开头共 11 位）。 */
export function isValidPhone(input: string): boolean {
  return /^\+861[3-9]\d{9}$/.test(normalizePhone(input));
}
