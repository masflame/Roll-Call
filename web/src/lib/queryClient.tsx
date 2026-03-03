import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as RQ from '@tanstack/react-query';

// Default query client with sensible defaults for this app
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000, // 10 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

// Defensive logging & fallback to help diagnose runtime issues where
// some consumer sees `defaultQueryOptions is not a function`.
try {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('QueryClient instance:', {
      hasDefaultQueryOptions: typeof (queryClient as any).defaultQueryOptions === 'function',
      keys: Object.keys(queryClient as any),
    });
  }

  // If for some reason `defaultQueryOptions` is missing (shouldn't be), provide
  // a safe fallback to avoid the app completely crashing while we debug.
  if (typeof (queryClient as any).defaultQueryOptions !== 'function') {
    // eslint-disable-next-line no-console
    console.warn('QueryClient missing defaultQueryOptions; adding fallback wrapper');
    (queryClient as any).defaultQueryOptions = (opts: any) => ({ ...opts, _defaulted: false });
  }

  // Expose to window for debugging in the browser console so we can inspect
  // whether a different react-query copy or a wrong object is being used.
  try {
    // @ts-ignore
    window.__RC_QUERYCLIENT__ = queryClient;
    // @ts-ignore
    window.__RC_REACT_QUERY__ = RQ;
  } catch (e) {
    // ignore in non-browser envs
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error('Error during QueryClient sanity checks', e);
}

export function AppQueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export default queryClient;
