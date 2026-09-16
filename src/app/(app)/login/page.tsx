'use client';

import { ArrowLeft, ArrowRight, Loader2, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { IOS_PAGE_CONTAINER_CLASS, IOS_SECTION_CARD_CLASS } from '@/components/shared/ios-native-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DEV_LOGIN_OTP, DEV_LOGIN_PHONE, IS_DEV_LOGIN_ENABLED } from '@/lib/dev-login';
import { useI18n } from '@/lib/i18n/use-i18n';
import { INVALID_OTP_ERROR, INVALID_PHONE_ERROR, PHONE_COUNTRY_CODE } from '@/lib/phone';
import { detectIOSNativeHost } from '@/lib/tauri';
import { useAuthStore } from '@/stores/auth-store';

/** 与 Supabase 对同一手机号的发送冷却保持一致，避免重发按钮直接撞上限流。 */
const RESEND_COOLDOWN_SECONDS = 60;

export default function LoginPage() {
  const isIOSNativeHost = detectIOSNativeHost();
  const {
    signInWithPhone,
    verifyPhoneOtp,
    resetPhoneAuth,
    isAuthenticated,
    phoneAuthLoading,
    phoneAuthError,
    phoneOtpSent,
    pendingPhone,
  } = useAuthStore();
  const router = useRouter();
  const { t } = useI18n('login');

  const [phone, setPhone] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [resendCooldown, setResendCooldown] = useState(0);

  const getLocalizedError = (error: string | null): string => {
    if (!error) return t('authFailed');
    if (error === INVALID_PHONE_ERROR) return t('errorInvalidPhone');
    if (error === INVALID_OTP_ERROR) return t('errorInvalidOtp');
    const lower = error.toLowerCase();
    if (lower.includes('rate limit') || lower.includes('too many')) return t('errorRateLimit');
    if (lower.includes('disabled') || lower.includes('not configured') || lower.includes('unsupported')) {
      return t('errorSmsUnavailable');
    }
    if (lower.includes('phone') && lower.includes('invalid')) return t('errorInvalidPhone');
    if (lower.includes('invalid') || lower.includes('expired')) return t('errorInvalidOtp');
    if (lower.includes('sms') || lower.includes('sending')) return t('errorSendingSms');
    return t('authFailed');
  };

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    return () => resetPhoneAuth();
  }, [resetPhoneAuth]);

  useEffect(() => {
    if (phoneOtpSent) setResendCooldown(RESEND_COOLDOWN_SECONDS);
  }, [phoneOtpSent]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    void signInWithPhone(phone);
  };

  const handleResend = () => {
    if (!pendingPhone || resendCooldown > 0) return;
    setOtpDigits(['', '', '', '', '', '']);
    void signInWithPhone(pendingPhone);
    otpInputRefs.current[0]?.focus();
  };

  const submitOtp = (digits: string[]) => {
    verifyPhoneOtp(pendingPhone!, digits.join('')).then((ok) => {
      if (ok) router.replace('/dashboard');
    });
  };

  /** 开发环境：一键填入固定凭据。验证码步骤没有提交按钮（靠 6 格填满自动提交），所以要显式触发。 */
  const handleFillDevCredentials = () => {
    if (phoneOtpSent) {
      const digits = DEV_LOGIN_OTP.split('');
      setOtpDigits(digits);
      submitOtp(digits);
      return;
    }
    setPhone(DEV_LOGIN_PHONE);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').slice(0, 6).split('');
      const newDigits = [...otpDigits];
      for (let i = 0; i < pasted.length; i++) {
        if (index + i < 6) newDigits[index + i] = pasted[i];
      }
      setOtpDigits(newDigits);
      const nextIndex = Math.min(index + pasted.length, 5);
      otpInputRefs.current[nextIndex]?.focus();

      if (newDigits.every((d) => d !== '')) {
        submitOtp(newDigits);
      }
      return;
    }

    const digit = value.replace(/\D/g, '');
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);

    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    if (newDigits.every((d) => d !== '')) {
      submitOtp(newDigits);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleBack = () => {
    resetPhoneAuth();
    setOtpDigits(['', '', '', '', '', '']);
  };

  return (
    <div
      className={
        isIOSNativeHost
          ? `${IOS_PAGE_CONTAINER_CLASS} flex min-h-[calc(100vh-4rem)] items-center justify-center`
          : 'flex min-h-[calc(100vh-4rem)] items-center justify-center px-4'
      }
    >
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-200/50">
            <span className="text-2xl font-bold text-white">E</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {phoneOtpSent ? t('checkPhone') : t('title')}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {phoneOtpSent ? (
              <>
                {t('otpSentTo')} <span className="font-medium text-slate-700">{pendingPhone}</span>
              </>
            ) : (
              t('subtitle')
            )}
          </p>
          {phoneOtpSent && <p className="mt-1 text-xs text-slate-400">{t('otpHint')}</p>}
        </div>

        <div
          className={
            isIOSNativeHost
              ? `${IOS_SECTION_CARD_CLASS} w-full p-6`
              : 'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'
          }
        >
          {phoneAuthError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {getLocalizedError(phoneAuthError)}
            </div>
          )}

          {phoneOtpSent ? (
            <div className="space-y-5">
              <div className="flex justify-center gap-2">
                {otpDigits.map((digit, i) => (
                  <input
                    key={`otp-${i}`}
                    ref={(el) => {
                      otpInputRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="h-12 w-11 rounded-lg border border-slate-200 bg-slate-50 text-center text-lg font-semibold text-slate-900 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    disabled={phoneAuthLoading}
                  />
                ))}
              </div>

              {phoneAuthLoading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('verifying')}
                </div>
              ) : null}

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t('back')}
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={phoneAuthLoading || resendCooldown > 0}
                  className="text-indigo-600 hover:text-indigo-700 font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
                >
                  {resendCooldown > 0 ? t('resendIn', { seconds: resendCooldown }) : t('resendCode')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <form onSubmit={handlePhoneSubmit} className="space-y-3">
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('phoneLabel')}
                  </label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <span className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">
                      {PHONE_COUNTRY_CODE}
                    </span>
                    <Input
                      id="phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      aria-label="Phone"
                      data-testid="login-phone-input"
                      placeholder={t('phonePlaceholder')}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, ''))}
                      className="pl-[4.5rem] h-11"
                      required
                      disabled={phoneAuthLoading}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium cursor-pointer"
                  disabled={phoneAuthLoading || !phone.trim()}
                  data-testid="login-phone-submit"
                >
                  {phoneAuthLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('sendingCode')}
                    </>
                  ) : (
                    <>
                      {t('continueWithPhone')}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                <Link href="/dashboard" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
                  {t('continueWithout')}
                </Link>
              </div>
            </div>
          )}

          {IS_DEV_LOGIN_ENABLED && (
            <div
              data-testid="dev-login-hint"
              className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800"
            >
              <p className="font-semibold">{t('devLoginTitle')}</p>
              <p className="mt-1">{t('devLoginHint', { phone: DEV_LOGIN_PHONE, code: DEV_LOGIN_OTP })}</p>
              <button
                type="button"
                onClick={handleFillDevCredentials}
                className="mt-2 font-medium text-amber-900 underline underline-offset-2 cursor-pointer"
              >
                {t('devLoginFill')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
