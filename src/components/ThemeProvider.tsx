import { supabase, checkSupabaseHealth } from "@/lib/supabaseClient";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface ThemeContextValue {
  theme: "dark";
  supabaseReady: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: "dark" });

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dark");
    return () => {
      root.classList.remove("dark");
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: "dark" }}>
      {children}
    </ThemeContext.Provider>
  );
}
