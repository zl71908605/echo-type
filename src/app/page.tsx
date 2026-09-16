'use client';

import { ArrowRight, BookOpen, Headphones, MessageCircle, Mic, PenTool, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { ChatFab } from '@/components/chat/chat-fab';
import { LandingNav } from '@/components/layout/landing-nav';
import { useI18n } from '@/lib/i18n/use-i18n';
import { detectIOSNativeHost } from '@/lib/tauri';

function getNativeHostSearchParam(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('nativeHost');
}

export default function LandingPage() {
  const isIOSNativeHost = getNativeHostSearchParam() === 'ios' || detectIOSNativeHost();
  const { messages } = useI18n('landing');

  const features = [
    {
      icon: Headphones,
      title: messages.features.listen.title,
      desc: messages.features.listen.description,
      color: 'bg-blue-500',
      href: '/listen',
    },
    {
      icon: Mic,
      title: messages.features.speak.title,
      desc: messages.features.speak.description,
      color: 'bg-green-500',
      href: '/speak',
    },
    {
      icon: BookOpen,
      title: messages.features.read.title,
      desc: messages.features.read.description,
      color: 'bg-amber-500',
      href: '/read',
    },
    {
      icon: PenTool,
      title: messages.features.write.title,
      desc: messages.features.write.description,
      color: 'bg-purple-500',
      href: '/write',
    },
    {
      icon: MessageCircle,
      title: messages.features.aiTutor.title,
      desc: messages.features.aiTutor.description,
      color: 'bg-indigo-500',
      href: '/dashboard',
    },
  ];

  return (
    <div
      className={
        isIOSNativeHost
          ? 'min-h-screen bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_42%,#eef2ff_100%)]'
          : 'min-h-screen bg-[#EEF2FF]'
      }
    >
      <LandingNav />

      <section
        className={
          isIOSNativeHost
            ? 'mx-auto max-w-4xl px-5 pb-10 pt-8'
            : 'max-w-4xl mx-auto text-center px-8 pt-12 sm:pt-20 pb-16'
        }
      >
        {isIOSNativeHost ? (
          <div className="rounded-[32px] border border-white/70 bg-white/82 px-5 py-6 shadow-[0_24px_54px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-500">
              <Sparkles className="h-3.5 w-3.5" />
              {messages.ios.badge}
            </div>
            <h1 className="mt-4 text-[2.5rem] font-bold leading-[1.02] tracking-[-0.05em] text-slate-950 font-[var(--font-poppins)]">
              {messages.ios.title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-500">{messages.ios.description}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-indigo-600 px-5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(79,70,229,0.24)] transition-colors duration-200 hover:bg-indigo-700 cursor-pointer"
              >
                {messages.ios.openDashboard}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/speak"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:bg-slate-50 cursor-pointer"
              >
                {messages.ios.trySpeaking}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-5xl md:text-6xl font-bold text-indigo-900 font-[var(--font-poppins)] leading-tight">
              {messages.web.titleLine1}
              <br />
              <span className="text-indigo-600">{messages.web.titleLine2}</span>
            </h1>
            <p className="mt-6 text-lg text-indigo-600 max-w-2xl mx-auto">{messages.web.description}</p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link
                href="/dashboard"
                className="px-8 py-3 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition-colors duration-200 flex items-center gap-2 cursor-pointer"
              >
                {messages.web.cta}
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </>
        )}
      </section>

      <section className={isIOSNativeHost ? 'mx-auto max-w-6xl px-5 pb-24' : 'max-w-6xl mx-auto px-8 pb-20'}>
        <div
          className={
            isIOSNativeHost ? 'grid grid-cols-1 gap-4 md:grid-cols-2' : 'grid grid-cols-1 md:grid-cols-2 gap-6'
          }
        >
          {features.map((feature, index) => (
            <Link
              key={feature.title}
              href={feature.href}
              className={`block cursor-pointer transition-all duration-200 ${
                isIOSNativeHost
                  ? 'rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] hover:-translate-y-0.5 hover:shadow-[0_24px_52px_rgba(15,23,42,0.10)] backdrop-blur-xl'
                  : 'bg-white/70 backdrop-blur-xl rounded-2xl p-8 border border-indigo-100 hover:shadow-lg hover:-translate-y-0.5'
              } ${index === features.length - 1 && features.length % 2 === 1 ? 'md:col-span-2' : ''}`}
            >
              <div
                className={`${isIOSNativeHost ? 'mb-4 flex h-12 w-12 items-center justify-center rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]' : 'w-12 h-12 rounded-xl flex items-center justify-center mb-4'} ${feature.color}`}
              >
                <feature.icon className="w-6 h-6 text-white" />
              </div>
              <h3
                className={
                  isIOSNativeHost
                    ? 'mb-2 text-lg font-semibold tracking-[-0.02em] text-slate-950 font-[var(--font-poppins)]'
                    : 'text-xl font-semibold text-indigo-900 font-[var(--font-poppins)] mb-2'
                }
              >
                {feature.title}
              </h3>
              <p className={isIOSNativeHost ? 'text-sm leading-6 text-slate-500' : 'text-indigo-600'}>{feature.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <footer
        className={
          isIOSNativeHost
            ? 'border-t border-slate-200/70 py-8 text-center text-sm text-slate-400'
            : 'border-t border-indigo-100 py-8 text-center text-sm text-indigo-400'
        }
      >
        <p>{messages.footer}</p>
      </footer>

      <ChatFab />
    </div>
  );
}
