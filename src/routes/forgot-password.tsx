import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AuthShell, fieldClass, labelClass, primaryBtnClass } from "@/components/AuthShell";
import { useAuth } from "@/components/AuthProvider";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — EdgeTrader" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    const { error } = await resetPassword(email);
    setSubmitting(false);
    if (error) setError(error.message);
    else setMessage("If that email exists, a reset link is on its way.");
  };

  return (
    <AuthShell
      title="Forgot password"
      subtitle="We'll email you a secure reset link."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="text-trade-green hover:underline">Back to sign in</Link>
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
          {submitting ? "Sending..." : "Send reset link"}
        </button>
      </form>
    </AuthShell>
  );
}