import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  ApiError,
  api,
  getAuthSessionGeneration,
  registerUnauthorizedHandler,
  setAuthToken,
} from "./api";
import { clearStoredToken, getStoredToken, setStoredToken, WEB_STORAGE_WARNING } from "./storage";
import type { BarberRole, BarberUser } from "./types";

export type AuthStatus = "restoring" | "signed_out" | "authenticated" | "restore_error";

export type BarberContextValue = {
  user: BarberUser | null;
  token: string | null;
  authReady: boolean;
  authStatus: AuthStatus;
  busy: boolean;
  authError: string | null;
  storageError: string | null;
  storageNotice: string | null;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retryRestore: () => Promise<void>;
  retryStorageCleanup: () => Promise<void>;
  clearAuthError: () => void;
  refreshMe: () => Promise<BarberUser | null>;
  hasRole: (...roles: BarberRole[]) => boolean;
};

const BarberContext = createContext<BarberContextValue | null>(null);

function normalizeUser(value: any): BarberUser {
  const role = value?.role as BarberRole;
  if (!value || !["client", "barber", "admin"].includes(role)) {
    throw new ApiError("O servidor retornou um perfil de usuário inválido.", { code: "invalid_user" });
  }
  return {
    id: Number(value.id),
    name: String(value.name ?? ""),
    email: String(value.email ?? ""),
    phone: value.phone == null ? null : String(value.phone),
    role,
    status: value.status ?? "active",
    platform_admin: Boolean(value.platform_admin),
  };
}

function describeStorageError(error: unknown, action: string): string {
  const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
  return `${action}${detail} Tente novamente para concluir a limpeza local.`;
}

export function BarberProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<BarberUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("restoring");
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  const tokenRef = useRef<string | null>(null);
  const userRef = useRef<BarberUser | null>(null);
  const sessionGenerationRef = useRef(0);
  const pendingStorageCleanupRef = useRef<{ expectedToken?: string } | null>(null);

  const updateToken = useCallback((nextToken: string | null) => {
    tokenRef.current = nextToken;
    setToken(nextToken);
  }, []);

  const updateUser = useCallback((nextUser: BarberUser | null) => {
    userRef.current = nextUser;
    setUser(nextUser);
  }, []);

  const clearSession = useCallback(
    async (options: { expectedToken?: string; expectedGeneration?: number } = {}): Promise<boolean> => {
      if (options.expectedGeneration !== undefined && sessionGenerationRef.current !== options.expectedGeneration) {
        return false;
      }
      if (options.expectedToken !== undefined && tokenRef.current !== options.expectedToken) {
        return false;
      }

      const cleanupGeneration = ++sessionGenerationRef.current;
      const tokenToClear = options.expectedToken ?? tokenRef.current ?? undefined;

      // Invalidate the in-memory session before awaiting SecureStore. This is
      // intentionally repeated in finally so a storage failure cannot keep the
      // React tree authenticated.
      setAuthToken(null);
      updateToken(null);
      updateUser(null);
      setAuthStatus("signed_out");
      setAuthReady(true);
      setAuthError(null);
      setStorageError(null);

      let cleanupError: unknown = null;
      try {
        await clearStoredToken(tokenToClear);
      } catch (error) {
        cleanupError = error;
      } finally {
        if (sessionGenerationRef.current === cleanupGeneration) {
          updateToken(null);
          updateUser(null);
          setAuthStatus("signed_out");
          setAuthReady(true);
          if (cleanupError) {
            pendingStorageCleanupRef.current = { expectedToken: tokenToClear };
            const message = describeStorageError(
              cleanupError,
              "A sessão foi encerrada, mas não foi possível remover o token armazenado.",
            );
            setStorageError(message);
            setAuthError(message);
          } else {
            pendingStorageCleanupRef.current = null;
          }
        }
      }
      return cleanupError === null;
    },
    [updateToken, updateUser],
  );

  const handleUnauthorized = useCallback(
    async (capturedToken: string, capturedApiGeneration: number) => {
      // The API already compares its request snapshot, but this second check
      // prevents an async handler from clearing a newer login.
      if (
        tokenRef.current !== capturedToken ||
        getAuthSessionGeneration() !== capturedApiGeneration
      ) {
        return;
      }
      const generation = sessionGenerationRef.current;
      await clearSession({ expectedToken: capturedToken, expectedGeneration: generation });
    },
    [clearSession],
  );

  const hydrate = useCallback(async () => {
    const generation = ++sessionGenerationRef.current;
    setAuthReady(false);
    setAuthStatus("restoring");
    setAuthError(null);
    setStorageError(null);
    setBusy(false);
    setAuthToken(null);
    updateToken(null);
    updateUser(null);

    let stored: string | null;
    try {
      stored = await getStoredToken();
    } catch (error) {
      if (sessionGenerationRef.current !== generation) return;
      const message = describeStorageError(error, "Não foi possível ler o token armazenado para restaurar a sessão.");
      setAuthStatus("restore_error");
      setAuthReady(true);
      setAuthError(message);
      return;
    }

    if (sessionGenerationRef.current !== generation) return;
    if (!stored) {
      setAuthStatus("signed_out");
      setAuthReady(true);
      return;
    }

    setAuthToken(stored);
    updateToken(stored);
    try {
      const result = await api.me();
      if (sessionGenerationRef.current !== generation || tokenRef.current !== stored) return;
      updateUser(normalizeUser(result.user));
      setAuthStatus("authenticated");
      setAuthReady(true);
    } catch (error) {
      if (sessionGenerationRef.current !== generation) return;
      if (error instanceof ApiError && error.status === 401) {
        await clearSession({ expectedToken: stored, expectedGeneration: generation });
        return;
      }
      const message = error instanceof Error ? error.message : "Não foi possível restaurar a sessão.";
      setAuthStatus("restore_error");
      setAuthReady(true);
      setAuthError(message);
    }
  }, [clearSession, updateToken, updateUser]);

  const refreshMe = useCallback(async (): Promise<BarberUser | null> => {
    const generation = sessionGenerationRef.current;
    const tokenAtStart = tokenRef.current;
    if (!tokenAtStart || !userRef.current) return null;
    try {
      const result = await api.me();
      if (sessionGenerationRef.current !== generation || tokenRef.current !== tokenAtStart) return null;
      const nextUser = normalizeUser(result.user);
      updateUser(nextUser);
      return nextUser;
    } catch (error) {
      if (sessionGenerationRef.current !== generation) return null;
      if (error instanceof ApiError && error.status === 401) {
        await clearSession({ expectedToken: tokenAtStart, expectedGeneration: generation });
      } else if (error instanceof ApiError && (error.code === "network_error" || error.code === "timeout")) {
        setAuthError(error.message);
      }
      return null;
    }
  }, [clearSession, updateUser]);

  useEffect(() => {
    registerUnauthorizedHandler(handleUnauthorized);
    void hydrate();
    return () => {
      registerUnauthorizedHandler(null);
    };
  }, [handleUnauthorized, hydrate]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const generation = ++sessionGenerationRef.current;
      setBusy(true);
      setAuthError(null);
      setStorageError(null);
      setAuthStatus("signed_out");
      setAuthToken(null);
      updateToken(null);
      updateUser(null);
      try {
        const result = await api.login(identifier.trim(), password);
        const nextUser = normalizeUser(result.user);
        if (!result.token) throw new ApiError("O servidor não retornou um token de sessão.", { code: "invalid_token" });
        if (sessionGenerationRef.current !== generation) return;

        try {
          await setStoredToken(result.token);
        } catch (error) {
          if (sessionGenerationRef.current === generation) {
            const message = describeStorageError(error, "Não foi possível guardar o token da sessão.");
            setAuthError(message);
            setStorageError(message);
            setAuthStatus("signed_out");
            setAuthReady(true);
          }
          throw error;
        }

        if (sessionGenerationRef.current !== generation) {
          await clearStoredToken(result.token).catch(() => undefined);
          return;
        }
        setAuthToken(result.token);
        updateToken(result.token);
        updateUser(nextUser);
        setAuthStatus("authenticated");
        setAuthReady(true);
      } catch (error) {
        if (sessionGenerationRef.current === generation) {
          setAuthError(error instanceof Error ? error.message : "Não foi possível entrar.");
          setAuthStatus("signed_out");
          setAuthReady(true);
        }
        throw error;
      } finally {
        if (sessionGenerationRef.current === generation) setBusy(false);
      }
    },
    [updateToken, updateUser],
  );

  const logout = useCallback(async () => {
    const generation = ++sessionGenerationRef.current;
    const oldToken = tokenRef.current;
    setBusy(true);
    let remoteError: unknown = null;
    try {
      if (oldToken) await api.logout();
    } catch (error) {
      remoteError = error;
    } finally {
      const cleared = await clearSession({ expectedToken: oldToken ?? undefined, expectedGeneration: generation });
      if (sessionGenerationRef.current === generation + 1) {
        if (remoteError && cleared) {
          setAuthError("A sessão local foi encerrada, mas o servidor não confirmou o encerramento remoto.");
        }
        setBusy(false);
      }
    }
  }, [clearSession]);

  const retryStorageCleanup = useCallback(async () => {
    const pending = pendingStorageCleanupRef.current;
    if (!pending) return;
    const generation = ++sessionGenerationRef.current;
    setBusy(true);
    try {
      await clearStoredToken(pending.expectedToken);
      if (sessionGenerationRef.current !== generation) return;
      pendingStorageCleanupRef.current = null;
      setStorageError(null);
      setAuthError(null);
    } catch (error) {
      if (sessionGenerationRef.current === generation) {
        const message = describeStorageError(error, "Ainda não foi possível remover o token armazenado.");
        setStorageError(message);
        setAuthError(message);
      }
    } finally {
      if (sessionGenerationRef.current === generation) setBusy(false);
    }
  }, []);

  const value = useMemo<BarberContextValue>(
    () => ({
      user,
      token,
      authReady,
      authStatus,
      busy,
      authError,
      storageError,
      storageNotice: typeof window !== "undefined" && user ? WEB_STORAGE_WARNING : null,
      login,
      logout,
      retryRestore: hydrate,
      retryStorageCleanup,
      clearAuthError: () => setAuthError(null),
      refreshMe,
      hasRole: (...roles) => (user ? roles.includes(user.role) : false),
    }),
    [user, token, authReady, authStatus, busy, authError, storageError, login, logout, hydrate, retryStorageCleanup, refreshMe],
  );

  return <BarberContext.Provider value={value}>{children}</BarberContext.Provider>;
}

export function useBarber(): BarberContextValue {
  const context = useContext(BarberContext);
  if (!context) throw new Error("useBarber deve ser usado dentro de BarberProvider");
  return context;
}

export { BarberContext };
