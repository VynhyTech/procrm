import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { trpc } from "../trpc";

export function SignupPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [searchParams] = useSearchParams();
  // Present when arriving via an org admin's invite claim link — see orgSettings.inviteMember.
  const inviteToken = searchParams.get("inviteToken") ?? undefined;
  const invitedEmail = searchParams.get("email") ?? "";

  const [name, setName] = useState("");
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await trpc.auth.signup.mutate({ email, password, name: name || undefined, inviteToken });
      await refresh();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-border p-6">
        <h1 className="text-lg font-semibold text-foreground">Create your account</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <label className="block text-sm text-foreground-muted">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-foreground-muted">Email</label>
          <input
            type="email"
            required
            readOnly={!!inviteToken}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm disabled:bg-background-secondary"
          />
          {inviteToken && (
            <p className="mt-1 text-xs text-foreground-subtle">
              Locked to your invited email address.
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm text-foreground-muted">Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-foreground-subtle">At least 8 characters</p>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Creating account..." : "Sign up"}
        </button>
        <p className="text-center text-sm text-foreground-muted">
          Already have an account?{" "}
          <Link to="/login" className="text-primary-text">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
