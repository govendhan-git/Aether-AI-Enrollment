"use client";
import { ClerkProvider } from '@clerk/nextjs';
import { ThemeProvider } from 'next-themes';
import { Provider as ReduxProvider } from 'react-redux';
import { store } from '../store';

export function Providers({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const signInUrl = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in';
  const signUpUrl = process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL || '/sign-up';
  const signInFallbackRedirectUrl = process.env.NEXT_PUBLIC_CLERK_FALLBACK_REDIRECT_URL || '/app';
  const signUpFallbackRedirectUrl = process.env.NEXT_PUBLIC_CLERK_SIGNUP_FALLBACK_REDIRECT_URL || '/app';
  const forceRedirectUrl = process.env.NEXT_PUBLIC_CLERK_FORCE_REDIRECT_URL as string | undefined;
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl={signInUrl}
      signUpUrl={signUpUrl}
      signInFallbackRedirectUrl={signInFallbackRedirectUrl}
      signUpFallbackRedirectUrl={signUpFallbackRedirectUrl}
      {...(forceRedirectUrl ? { forceRedirectUrl } : {})}
    >
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem themes={["light","dark","system"]}>
        <ReduxProvider store={store}>{children}</ReduxProvider>
      </ThemeProvider>
    </ClerkProvider>
  );
}
