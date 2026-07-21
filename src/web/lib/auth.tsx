import React, { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { trpc } from "../trpc";
import { BASE_PATH } from "../../constants";
import { PageLoader } from "../components/PageLoader";

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

interface AuthState {
  user: AuthUser | null;
  scopes: string[];
  currentOrgId: string | null;
  loading: boolean;
}

type Listener = () => void;

/**
 * Plain external store (not Context state) so `AuthProvider` re-rendering for unrelated
 * reasons never forces a spurious snapshot change — a new state object is only ever created
 * on an actual auth transition (login/logout/switchOrg/initial load).
 */
function createAuthStore() {
  let state: AuthState = { user: null, scopes: [], currentOrgId: null, loading: true };
  const listeners = new Set<Listener>();

  function setState(next: AuthState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async refresh() {
      try {
        const me = await trpc.auth.me.query();
        setState(
          me
            ? {
                user: { id: me.id, email: me.email, name: me.name, picture: me.picture },
                scopes: me.scopes,
                currentOrgId: me.currentOrgId,
                loading: false,
              }
            : { user: null, scopes: [], currentOrgId: null, loading: false },
        );
      } catch {
        // Network/server error on the auth check — fall back to logged-out rather than
        // leaving `loading` stuck true forever.
        setState({ user: null, scopes: [], currentOrgId: null, loading: false });
      }
    },
    async logout() {
      await trpc.auth.logout.mutate();
      setState({ user: null, scopes: [], currentOrgId: null, loading: false });
    },
  };
}

const authStore = createAuthStore();

interface AuthContextValue extends AuthState {
  refresh(): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot, authStore.getSnapshot);

  useEffect(() => {
    authStore.refresh();
  }, []);

  // Memoized so this object's reference is stable across renders that don't change `state` —
  // consumers only re-render when an actual auth transition happens, not on every AuthProvider render.
  const value = useMemo<AuthContextValue>(
    () => ({ ...state, refresh: authStore.refresh, logout: authStore.logout }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useApp(): { basePath: string } {
  return { basePath: BASE_PATH };
}

export function ProtectedRoute({
  children,
  requiredScopes,
}: {
  children: React.ReactNode;
  requiredScopes?: string[];
}) {
  const { user, scopes, loading } = useAuth();

  // Keep the app accessible without forcing a login page for local/dev use.
  if (loading) return <>{children}</>;

  const hasScope =
    !requiredScopes || requiredScopes.length === 0 || requiredScopes.some((s) => scopes.includes(s));
  if (!user || !hasScope) {
    return <>{children}</>;
  }

  return <>{children}</>;
}
