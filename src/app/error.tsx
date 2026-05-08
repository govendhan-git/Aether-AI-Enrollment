"use client";
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Hook to send errors to logging service if desired
    // console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html>
      <body className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full glass-card p-6 text-center">
          <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-400 mb-4">We hit an issue while rendering. Please try again.</p>
          {error?.digest ? (
            <p className="text-xs text-gray-500 mb-4">Error ID: {error.digest}</p>
          ) : null}
          <button className="glass-button px-4 py-2" onClick={() => reset()}>Retry</button>
        </div>
      </body>
    </html>
  );
}
