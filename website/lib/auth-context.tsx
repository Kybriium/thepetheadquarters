"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User, RegisterRequest } from "@/types/auth";
import { endpoints } from "@/config/endpoints";
import { apiClient, ApiError } from "@/lib/api-client";
import { track } from "@/lib/analytics";

// login() returns one of two shapes:
//   - {kind:"ok"} when the user is fully signed in (cookies set, user state populated)
//   - {kind:"challenge", challengeToken} when 2FA is enabled and the
//     caller must follow up with completeMfaLogin(challengeToken, code)
export type LoginResult =
  | { kind: "ok" }
  | { kind: "challenge"; challengeToken: string };

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  isStaff: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  // Step 2 of login when 2FA is on. `code` may be either a 6-digit
  // TOTP or a backup code; the backend tries TOTP first.
  completeMfaLogin: (challengeToken: string, code: string) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (updated: User) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      // First try to refresh the session (sets new access cookie if refresh cookie exists)
      const refreshRes = await fetch(endpoints.auth.refresh, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!refreshRes.ok) {
        setUser(null);
        return;
      }

      const data = await refreshRes.json();
      if (data.status === "success" && data.data) {
        setUser(data.data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    fetchUser().finally(() => setIsLoading(false));
  }, [fetchUser]);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const res = await apiClient.post<{
        status: string;
        data: User | { requires_2fa: true; challenge_token: string };
        code?: string;
      }>(endpoints.auth.login, { email, password });
      if (res.status === "error") {
        throw new ApiError(401, res.code || "auth.invalid_credentials");
      }
      // 2FA path: backend says "give me a code before I issue cookies".
      // Don't set user state — the session isn't real yet.
      if (
        typeof res.data === "object" &&
        res.data !== null &&
        "requires_2fa" in res.data &&
        res.data.requires_2fa === true
      ) {
        return { kind: "challenge", challengeToken: res.data.challenge_token };
      }
      setUser(res.data as User);
      track("login");
      return { kind: "ok" };
    },
    [],
  );

  const completeMfaLogin = useCallback(
    async (challengeToken: string, code: string) => {
      const res = await apiClient.post<{ status: string; data: User; code?: string }>(
        endpoints.auth.mfaLogin,
        { challenge_token: challengeToken, code },
      );
      if (res.status === "error") {
        throw new ApiError(401, res.code || "auth.mfa_invalid_code");
      }
      setUser(res.data);
      track("login");
    },
    [],
  );

  const register = useCallback(
    async (data: RegisterRequest) => {
      const res = await apiClient.post<{ status: string; data: User; code?: string }>(
        endpoints.auth.register,
        data,
      );
      if (res.status === "error") {
        throw new ApiError(400, res.code || "auth.registration_failed");
      }
      setUser(res.data);
      track("signup");
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.post(endpoints.auth.logout, {});
    } catch {
      // Clear local state even if API call fails
    }
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    await fetchUser();
  }, [fetchUser]);

  const updateUser = useCallback((updated: User) => {
    setUser(updated);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      isEmailVerified: user?.is_email_verified ?? false,
      isStaff: user?.is_staff ?? false,
      login,
      completeMfaLogin,
      register,
      logout,
      refreshUser,
      updateUser,
    }),
    [user, isLoading, login, completeMfaLogin, register, logout, refreshUser, updateUser],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}
