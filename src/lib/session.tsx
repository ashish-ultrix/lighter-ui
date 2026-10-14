"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, tokenStore, type AccountView } from "./api";

export type SessionState = "loading" | "anon" | "needs_onboarding" | "ready";

interface Session {
  state: SessionState;
  account: AccountView | undefined;
  login: (userId: string) => Promise<void>;
  onboard: () => Promise<void>;
  onboarding: boolean;
  logout: () => void;
  /** Surfaced for the login / onboarding UI. */
  error: string | null;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const token = useSyncExternalStore(tokenStore.subscribe, tokenStore.get, () => null);

  const accountQ = useQuery({
    queryKey: ["account", token],
    queryFn: api.account,
    enabled: !!token,
    refetchInterval: 4000,
    retry: false,
  });

  const err = accountQ.error instanceof ApiError ? accountQ.error : null;

  // An expired or unknown token is a signed-out user, not an error to show.
  useEffect(() => {
    if (err?.status === 401) tokenStore.set(null);
  }, [err]);

  const onboardM = useMutation({
    mutationFn: api.onboard,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["account"] }),
  });

  const loginM = useMutation({
    mutationFn: (userId: string) => api.devLogin(userId),
    onSuccess: (r) => tokenStore.set(r.token),
  });

  const logout = useCallback(() => {
    tokenStore.set(null);
    qc.clear();
  }, [qc]);

  let state: SessionState;
  if (!token) state = "anon";
  else if (err?.status === 409) state = "needs_onboarding";
  else if (accountQ.data) state = "ready";
  else state = "loading";

  const value = useMemo<Session>(
    () => ({
      state,
      account: accountQ.data,
      login: async (userId) => void (await loginM.mutateAsync(userId)),
      onboard: async () => void (await onboardM.mutateAsync()),
      onboarding: onboardM.isPending,
      logout,
      error: (loginM.error ?? onboardM.error ?? (err && err.status !== 409 && err.status !== 401 ? err : null))?.message ?? null,
    }),
    [state, accountQ.data, loginM, onboardM, logout, err],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession must be used inside <SessionProvider>");
  return s;
}
