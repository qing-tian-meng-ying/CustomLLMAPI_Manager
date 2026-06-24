import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import { DevInspector } from '@/components/dev-inspector';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'AI API Gateway',
    template: '%s | AI API Gateway',
  },
  description: '统一大模型 API 分发与调用记录平台',
  keywords: ['AI', 'API Gateway', 'OpenAI', 'Claude', 'DeepSeek', 'LLM'],
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="en">
      <body className="antialiased">
        {isDev && <DevInspector />}
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
