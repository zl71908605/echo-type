import type { Metadata, Viewport } from 'next';
import { AuthBootstrap } from '@/components/auth/auth-bootstrap';
import { TooltipProvider } from '@/components/ui/tooltip';
import { I18nProvider } from '@/lib/i18n/provider';
import './globals.css';

export const metadata: Metadata = {
  title: '小步 StepUp — 通过听、说、读、写学习英语',
  description: '在沉浸式练习中掌握英语：听力训练、跟读评分、实时纠错打字练习，并支持导入你自己的内容。',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // 默认界面语言为中文（见 language-store 的 DEFAULT_INTERFACE_LANGUAGE）。
    // I18nProvider 挂载后会按用户选择覆写 document.documentElement.lang。
    <html lang="zh">
      <body className="font-sans antialiased bg-slate-50 text-slate-900">
        <TooltipProvider>
          <I18nProvider>
            <AuthBootstrap />
            {children}
          </I18nProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
