import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthShell, fieldClass, labelClass, primaryBtnClass } from "@/components/AuthShell";
import { useAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — EdgeTrader" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/", replace: true });
  }, [user, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) setError(error.message);
    else navigate({ to: "/", replace: true });
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access your trading dashboard."
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/signup" className="text-trade-green hover:underline">Sign up</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} className={fieldClass}
            placeholder="you@edge.trader" />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className={labelClass} htmlFor="password">Password</label>
            <Link to="/forgot-password" className="text-xs text-trade-blue hover:underline">
              Forgot?
            </Link>
          </div>
          <input id="password" type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} className={fieldClass}
            placeholder="••••••••" />
        </div>

        {error && (
          <div className="rounded-md border border-trade-red/30 bg-trade-red/10 px-3 py-2 text-xs text-trade-red font-data">
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting} className={primaryBtnClass}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}