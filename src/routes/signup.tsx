import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthShell, fieldClass, labelClass, primaryBtnClass } from "@/components/AuthShell";
import { useAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account — EdgeTrader" }] }),
  component: SignupPage,
});

function SignupPage() {
  const { signUp, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/", replace: true });
  }, [user, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const { error } = await signUp(email, password);
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMessage("Check your email to confirm your account before signing in.");
  };

  return (
    <AuthShell
      title="Create account"
      subtitle="Start trading with an AI-powered edge."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-trade-green hover:underline">Sign in</Link>
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
          <label className={labelClass} htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="new-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} className={fieldClass}
            placeholder="At least 6 characters" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="confirm">Confirm password</label>
          <input id="confirm" type="password" autoComplete="new-password" required value={confirm}
            onChange={(e) => setConfirm(e.target.value)} className={fieldClass}
            placeholder="••••••••" />
        </div>

        {error && (
          <div className="rounded-md border border-trade-red/30 bg-trade-red/10 px-3 py-2 text-xs text-trade-red font-data">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-md border border-trade-green/30 bg-trade-green/10 px-3 py-2 text-xs text-trade-green font-data">
            {message}
          </div>
        )}

        <button type="submit" disabled={submitting} className={primaryBtnClass}>
          {submitting ? "Creating account..." : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}