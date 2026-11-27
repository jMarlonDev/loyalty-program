import { useEffect, useState } from 'react';

export type AuthProviderKind = 'local' | 'supabase';
let cached: AuthProviderKind | null = null;

/** Reads the server auth mode; 'supabase' until known or on failure. */
export function useAuthProvider(): AuthProviderKind {
  const [kind, setKind] = useState<AuthProviderKind>(cached ?? 'supabase');
  useEffect(() => {
    if (cached) return;
    let live = true;
    fetch('/api/public-config', { credentials: 'omit' })
      .then((r) => r.json())
      .then((p) => {
        if (!live) return;
        cached = p?.data?.authProvider === 'local' ? 'local' : 'supabase';
        setKind(cached);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return kind;
}
export function resetAuthProviderCache() {
  cached = null;
}
