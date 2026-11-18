import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";

const WorkspaceContext = createContext(null);

const FALLBACK = { company_name: "My Company", currency: "INR", currency_symbol: "₹" };

export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(FALLBACK);

  const refresh = useCallback(async () => {
    try {
      const data = await api.settings();
      setSettings(data);
    } catch {
      /* keep fallback */
    }
  }, []);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  const value = useMemo(
    () => ({
      settings,
      setSettings,
      refresh,
      companyName: settings.company_name || "My Company",
      currencySymbol: settings.currency_symbol || "₹",
    }),
    [settings, refresh]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
