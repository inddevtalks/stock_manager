import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken } from "../lib/api";

const AuthContext = createContext(null);

const SESSION_USER_KEY = "sm_user_cache";

function getCachedUser() {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_KEY) || localStorage.getItem(SESSION_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCachedUser(user) {
  try {
    if (user) {
      sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(SESSION_USER_KEY);
      localStorage.removeItem(SESSION_USER_KEY);
    }
  } catch {
    // storage edge-case
  }
}

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(() =>
    getToken() ? getCachedUser() : null
  );
  const [booting, setBooting] = useState(Boolean(getToken() && !getCachedUser()));

  const setUser = useCallback((u) => {
    setCachedUser(u);
    setUserState(u);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setCachedUser(null);
    setUserState(null);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setBooting(false);
      return;
    }
    const cached = getCachedUser();
    if (!cached) setBooting(true);

    let active = true;

    // Safety timer: unblock boot screen after 6s regardless of network latency
    const timer = setTimeout(() => {
      if (active) setBooting(false);
    }, 6000);

    api
      .me()
      .then((profile) => {
        if (active) setUser(profile);
      })
      .catch((err) => {
        // Only log out if explicitly rejected by auth (not network timeout or temporary 5xx)
        if (active && (!getToken() || err.message?.includes("Not authenticated"))) {
          logout();
        }
      })
      .finally(() => {
        if (active) setBooting(false);
        clearTimeout(timer);
      });

    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = () => {
      setCachedUser(null);
      setUserState(null);
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
  }, [setUser]);

  const register = useCallback(async (name, email, password, role = "staff") => {
    const result = await api.register({ name, email, password, role });
    setToken(result.token);
    setUser(result.user);
    return result.user;
  }, [setUser]);

  const value = useMemo(
    () => ({ user, setUser, booting, login, register, logout }),
    [user, setUser, booting, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
