'use client';

import { LogIn } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { LogoMark } from '@/components/brand/logo';
import { BRAND } from '@/lib/brand';
import { useAuthStore } from '@/stores/auth-store';
import { useLanguageStore } from '@/stores/language-store';

export function LandingNav() {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const zh = useLanguageStore((state) => state.interfaceLanguage) === 'zh';
  const initializeLanguage = useLanguageStore((state) => state.initialize);

  // landing 不在 (app) 路由组内，没有 I18nProvider 触发语言检测，
  // 不初始化的话品牌名会一直停留在默认的英文。
  useEffect(() => {
    initializeLanguage();
  }, [initializeLanguage]);

  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || '';
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const initials = displayName
    ? displayName
        .split(/\s+/)
        .map((p: string) => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'SU';

  return (
    <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-4 sm:px-8">
      <div className="flex items-center gap-2.5">
        <LogoMark size={32} />
        <span className="text-xl font-bold text-indigo-900 font-[var(--font-brand)]">
          {zh ? BRAND.nameZh : BRAND.nameEn}
        </span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        {isLoading ? (
          <div className="w-20 h-10" />
        ) : isAuthenticated ? (
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 text-indigo-600 font-medium border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 rounded-xl transition-all duration-200 cursor-pointer text-sm sm:text-base"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-medium">
                {initials}
              </div>
            )}
            <span className="hidden sm:inline">{displayName}</span>
          </Link>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 text-indigo-600 font-medium border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 rounded-xl transition-all duration-200 cursor-pointer text-sm sm:text-base"
          >
            <LogIn className="w-4 h-4" />
            Sign In
          </Link>
        )}
        <Link
          href="/dashboard"
          className="px-4 sm:px-6 py-2 sm:py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors duration-200 cursor-pointer text-sm sm:text-base"
        >
          Start Learning
        </Link>
      </div>
    </nav>
  );
}
