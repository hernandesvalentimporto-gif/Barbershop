import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { ApiError, api, registerUnauthorizedHandler, setAuthToken } from "./api";
import { clearStoredToken, getStoredToken, setStoredToken, WEB_STORAGE_WARNING } from "./storage";
import type { BarberRole, BarberUser } from "./types";

export type BarberContextValue = {
  user: BarberUser | null;
  token: string | null;
  authReady: boolean;
  busy: boolean;
  authError: string | null;
  storageNotice: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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
    role,
    status: value.status ?? "active",
  };
}

export function BarberProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<BarberUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const clearSession = useCallback(async () => {
    setAuthToken(null);
    await clearStoredToken();
    setToken(null);
    setUser(null);
  }, []);

  const refreshMe = useCallback(async (): Promise<BarberUser | null> => {
    try {
      const result = await api.me();
      const nextUser = normalizeUser(result.user);
      setUser(nextUser);
      return nextUser;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await clearSession();
      else if (error instanceof ApiError && error.code === "network_error") setAuthError(error.message);
      return null;
    }
  }, [clearSession]);

  useEffect(() => {
    registerUnauthorizedHandler(clearSession);
    let mounted = true;
    (async () => {
      const stored = await getStoredToken();
      if (!mounted) return;
      if (!stored) {
        setAuthReady(true);
        return;
      }
      setAuthToken(stored);
      setToken(stored);
      await refreshMe();
      if (mounted) setAuthReady(true);
    })().catch(() => {
      if (mounted) setAuthReady(true);
    });
    return () => {
      mounted = false;
      registerUnauthorizedHandler(null);
    };
  }, [refreshMe, clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    setBusy(true);
    setAuthError(null);
    try {
      const result = await api.login(email.trim(), password);
      const nextUser = normalizeUser(result.user);
      if (!result.token) throw new ApiError("O servidor não retornou um token de sessão.", { code: "invalid_token" });
      await setStoredToken(result.token);
      setAuthToken(result.token);
      setToken(result.token);
      setUser(nextUser);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Não foi possível entrar.");
      throw error;
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setBusy(true);
    try {
      if (token) await api.logout();
    } catch {
      // A sessão local must still be removed if the server is unreachable.
    } finally {
      await clearSession();
      setAuthError(null);
      setBusy(false);
    }
  }, [clearSession, token]);

  const value = useMemo<BarberContextValue>(
    () => ({
      user,
      token,
      authReady,
      busy,
      authError,
      storageNotice: typeof window !== "undefined" && user ? WEB_STORAGE_WARNING : null,
      login,
      logout,
      clearAuthError: () => setAuthError(null),
      refreshMe,
      hasRole: (...roles) => (user ? roles.includes(user.role) : false),
    }),
    [user, token, authReady, busy, authError, login, logout, refreshMe],
  );

  return <BarberContext.Provider value={value}>{children}</BarberContext.Provider>;
}

export function useBarber(): BarberContextValue {
  const context = useContext(BarberContext);
  if (!context) throw new Error("useBarber deve ser usado dentro de BarberProvider");
  return context;
}

export { BarberContext };
