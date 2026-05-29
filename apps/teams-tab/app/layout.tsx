import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '../src/components/AppShell';

export const metadata: Metadata = {
  title: '掼蛋平台',
  description: 'Microsoft Teams Guandan Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
