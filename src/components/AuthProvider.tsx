import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { isDemoMode, exitDemoMode, useDemoMode, DEMO_USER } from "@/lib/demoMode";

interface AuthResult {
  error: AuthError | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const demo = useDemoMode();

  useEffect(() => {
    // Listener first to avoid missing events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
    });
    return { error };
  };

  const signOut = async () => {
    if (isDemoMode()) {
      exitDemoMode();
      return;
    }
    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/reset-password`
        : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return { error };
  };

  const effectiveUser = user ?? (demo ? DEMO_USER : null);
  return (
    <AuthContext.Provider value={{ user: effectiveUser, session, loading, signIn, signUp, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}