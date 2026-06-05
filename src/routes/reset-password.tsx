import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthShell, fieldClass, labelClass, primaryBtnClass } from "@/components/AuthShell";
import { supabase } from "@/lib/supabaseClient";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set new password — EdgeTrader" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMessage("Password updated. Redirecting...");
    setTimeout(() => navigate({ to: "/", replace: true }), 1200);
  };

  return (
    <AuthShell
      title="Set new password"
      subtitle="Choose a strong password for your account."
      footer={
        <>
          <Link to="/login" className="text-trade-green hover:underline">Back to sign in</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="password">New password</label>
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
          {submitting ? "Updating..." : "Update password"}
        </button>
      </form>
    </AuthShell>
  );
}