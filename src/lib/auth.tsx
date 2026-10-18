import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { clearPendingScan } from './card-qr';
export interface AuthUser {
  id: string;
  email: string;
  full_name?: string;
}
interface SessionResult {
  user: AuthUser | null;
  confirmationRequired?: boolean;
}
interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    fullName: string,
    next?: string,
  ) => Promise<{ confirmationRequired: boolean }>;
  logout: () => Promise<void>;
  recover: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  google: (next?: string) => void;
  reload: () => Promise<void>;
}
const AuthContext = createContext<AuthState | null>(null);
let refreshFlight: Promise<Response> | null = null;
let sessionVersion = 0;
const SESSION_ENDED = 'loyalty:session-ended';
const SESSION_CHANNEL = 'loyalty-session';
const RENEW_INTERVAL = 4 * 60_000;
class SessionActionError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly sessionCleared = false,
  ) {
    super(message);
  }
}
async function sessionRequest(
  action: string,
  fields: Record<string, string> = {},
) {
  return fetch('/api/session', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...fields }),
  });
}
async function sessionAction(
  action: string,
  fields: Record<string, string> = {},
): Promise<SessionResult> {
  const response = await sessionRequest(action, fields);
  const payload = await response.json();
  if (!response.ok)
    throw new SessionActionError(
      response.status,
      payload.error?.message ?? 'No se pudo completar el acceso.',
      response.headers.get('X-Session-Cleared') === '1',
    );
  return payload.data;
}
// Serializes cookie rotation and logout across tabs on secure browsers.
function withSessionLock<T>(action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks)
    return navigator.locks.request('loyalty-session', action);
  return action();
}
function sessionEnded(explicitLogout = false) {
  sessionVersion += 1;
  if (typeof window !== 'undefined')
    window.dispatchEvent(new Event(SESSION_ENDED));
  if (explicitLogout && typeof window !== 'undefined') {
    clearPendingScan();
    window.dispatchEvent(new Event('loyalty:logout'));
  }
}
async function refresh(): Promise<Response> {
  refreshFlight ??= withSessionLock(() => sessionRequest('refresh')).finally(
    () => {
      refreshFlight = null;
    },
  );
  // Each caller owns its response body, even when the request was shared.
  return (await refreshFlight).clone();
}
export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const version = sessionVersion;
  const retryInput = input instanceof Request ? input.clone() : input;
  const response = await fetch(input, { ...init, credentials: 'same-origin' });
  if (response.status !== 401 || version !== sessionVersion) return response;
  const renewed = await refresh();
  if (renewed.status === 401) sessionEnded();
  if (!renewed.ok) return renewed;
  const retried = await fetch(retryInput, {
    ...init,
    credentials: 'same-origin',
  });
  if (retried.status === 401) sessionEnded();
  return retried;
}
async function ensureProfile(user: AuthUser) {
  const current = await authFetch('/api/v1/me');
  if (current.status === 404) {
    const result = await authFetch('/api/v1/profiles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        full_name: user.full_name || user.email.split('@')[0],
      }),
    });
    if (!result.ok) {
      const body = await result.json();
      throw new Error(body.error?.message ?? 'No se pudo crear tu perfil.');
    }
  } else if (!current.ok) {
    const body = await current.json();
    throw new Error(body.error?.message ?? 'No se pudo consultar tu perfil.');
  }
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const userId = useRef<string | null>(null);
  const [user, setUserState] = useState<AuthUser | null>(null);
  const setUser = useCallback(
    (value: AuthUser | null) => {
      if (userId.current !== value?.id) {
        queryClient.clear();
        userId.current = value?.id ?? null;
      }
      setUserState(value);
    },
    [queryClient],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const reloadFlight = useRef<Promise<void> | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const endSession = useCallback(() => {
    generation.current += 1;
    setUser(null);
    setError(null);
    setLoading(false);
  }, [setUser]);
  const restore = useCallback(
    (renew = false): Promise<void> => {
      if (reloadFlight.current) return reloadFlight.current;
      const currentGeneration = generation.current;
      const current = () => generation.current === currentGeneration;
      if (!userId.current) setLoading(true);
      const work = async () => {
        try {
          const response =
            renew && userId.current
              ? await refresh()
              : await authFetch('/api/session');
          if (!current()) return;
          if (response.status === 401) {
            endSession();
            return;
          }
          const result = await response.json();
          if (!current()) return;
          if (!response.ok)
            throw new Error(
              result.error?.message ?? 'No se pudo consultar tu sesión.',
            );
          // First provision the profile before enabling dependent queries.
          // A provisioning failure still preserves the verified identity.
          try {
            if (result.data.user) await ensureProfile(result.data.user);
          } finally {
            if (current()) setUser(result.data.user);
          }
          if (current()) setError(null);
        } catch (e) {
          if (current())
            setError(
              e instanceof Error
                ? e.message
                : 'No se pudo consultar tu sesión.',
            );
        } finally {
          if (current()) setLoading(false);
        }
      };
      const flight = work().finally(() => {
        if (reloadFlight.current === flight) reloadFlight.current = null;
      });
      reloadFlight.current = flight;
      return flight;
    },
    [setUser, endSession],
  );
  const reload = useCallback(() => restore(), [restore]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    const schedule = () => {
      if (disposed) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.visibilityState === 'visible')
          void restore(true).finally(schedule);
        else schedule();
      }, RENEW_INTERVAL);
    };
    const resume = () => {
      if (document.visibilityState === 'visible')
        void restore().finally(schedule);
    };
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener(SESSION_ENDED, endSession);
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel(SESSION_CHANNEL);
      channel.current.onmessage = (event) => {
        if (event.data === 'logout') sessionEnded(true);
      };
    }
    void restore().finally(schedule);
    return () => {
      disposed = true;
      reloadFlight.current = null;
      generation.current += 1;
      clearTimeout(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener(SESSION_ENDED, endSession);
      channel.current?.close();
      channel.current = null;
    };
  }, [restore, endSession]);
  const login = async (email: string, password: string) => {
    const result = await sessionAction('login', { email, password });
    if (result.user) {
      generation.current += 1;
      try {
        await ensureProfile(result.user);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'No se pudo consultar tu perfil.',
        );
        return;
      } finally {
        setUser(result.user);
      }
    }
    setError(null);
  };
  const signup = async (
    email: string,
    password: string,
    fullName: string,
    next = '/app',
  ) => {
    const result = await sessionAction('signup', {
      email,
      password,
      full_name: fullName,
      next,
    });
    if (result.user) {
      generation.current += 1;
      try {
        await ensureProfile(result.user);
        setError(null);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'No se pudo consultar tu perfil.',
        );
      } finally {
        setUser(result.user);
      }
    }
    return { confirmationRequired: result.confirmationRequired ?? false };
  };
  const logout = async () => {
    // Wait for an existing rotation even where Web Locks are unavailable.
    await refreshFlight?.catch(() => undefined);
    try {
      await withSessionLock(() => sessionAction('logout'));
    } catch (error) {
      // The server clears cookies even when provider revocation fails.
      // A transport failure has no such guarantee; leave a retryable session.
      if (error instanceof SessionActionError && error.sessionCleared) {
        sessionEnded(true);
        channel.current?.postMessage('logout');
      }
      throw error;
    }
    sessionEnded(true);
    channel.current?.postMessage('logout');
  };
  const recover = async (email: string) => {
    await sessionAction('recover', { email });
  };
  const updatePassword = async (password: string) => {
    await sessionAction('password', { password });
  };
  const google = (next = '/app') => {
    window.location.assign(
      `/api/session/google?next=${encodeURIComponent(next)}`,
    );
  };
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        signup,
        logout,
        recover,
        updatePassword,
        google,
        reload,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider es obligatorio.');
  return context;
}
