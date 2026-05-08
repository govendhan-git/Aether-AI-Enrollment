import '../styles/globals.css';
import type { Metadata } from 'next';
import { Providers } from './providers';
import GlobalProgress from '../components/GlobalProgress';
import GlobalInitialLoader from '../components/GlobalInitialLoader';
import GlobalOverlay from '@/components/GlobalOverlay';
import ThemeHydrator from '../components/ThemeHydrator';
import { Header } from '@/components/header';
import AssistantWidget from '@/components/assistant';

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || 'Enrollment App',
  description: 'AI-orchestrated enrollment platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // ThemeHydrator will apply organization-specific theme class (theme-*) on the client
  const cssVars: Record<string, string> = {};

  return (
  <html suppressHydrationWarning lang="en" style={cssVars as React.CSSProperties}>
      <body>
        <Providers>
          <GlobalInitialLoader />
          <GlobalProgress />
          <GlobalOverlay />
          <ThemeHydrator />
          <Header />
          <main className="container py-8 md:py-12 space-y-6">{children}</main>
          <AssistantWidget />
        </Providers>
      </body>
    </html>
  );
}
