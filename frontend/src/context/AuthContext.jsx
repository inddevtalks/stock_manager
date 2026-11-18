import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(Boolean(getToken()));

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setBooting(false);
      return;
    }
    let active = true;
    api
      .me()
      .then((profile) => {
        if (active) setUser(profile);
      })
      .catch(() => {
        if (active) logout();
      })
      .finally(() => {
        if (active) setBooting(false);
      });
    return () => {
      active = false;
    };
  }, [logout]);

  useEffect(() => {
    const handler = () => {
      setUser(null);
      setBooting(false);
    };
    window.addEventListener("sm:unauthorized", handler);
    return () => window.removeEventListener("sm:unauthorized", handler);
  }, []);

  const login = useCallback(async (email, password) => {
    const result = await api.login({ email, password });
    setToken(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const register = useCallback(async (name, email, password, role = "staff") => {
    const result = await api.register({ name, email, password, role });
    setToken(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const value = useMemo(
    () => ({ user, setUser, booting, login, register, logout }),
    [user, booting, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
