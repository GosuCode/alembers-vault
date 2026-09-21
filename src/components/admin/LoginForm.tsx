import { useState } from "react";
import { signInWithEmail, signInWithPassword } from "../../lib/admin";

const inputClass =
  "rounded-md border border-ink/70 bg-white px-4 py-2.5 text-sm text-ink pop-sm transition placeholder:text-pencil/70 focus:border-accent focus:outline-none";

export default function LoginForm() {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const result =
      mode === "password"
        ? await signInWithPassword(email.trim(), password)
        : await signInWithEmail(email.trim());

    setBusy(false);
    if (result.error) {
      setError(
        /rate limit/i.test(result.error)
          ? "Supabase's email limit is hit. Use the password, or try the link again in an hour."
          : result.error,
      );
      return;
    }
    if (mode === "magic") setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-ink/60 bg-marker/60 p-6">
        <p className="font-hand text-2xl">check your inbox ✉</p>
        <p className="mt-2 text-sm text-pencil">
          A magic link is on its way to <strong>{email}</strong>. Open it on this
          device to sign in.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="font-hand text-lg leading-none text-pencil">
          admin email
        </span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className={inputClass}
        />
      </label>

      {mode === "password" && (
        <label className="flex flex-col gap-1.5">
          <span className="font-hand text-lg leading-none text-pencil">
            password
          </span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
        </label>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-md border border-ink/80 bg-accent px-5 py-2.5 text-sm font-semibold text-white pop-sm transition hover:-translate-y-0.5 hover:bg-accent-dark disabled:opacity-60"
      >
        {busy
          ? "working…"
          : mode === "password"
            ? "sign in"
            : "send magic link"}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode((current) => (current === "password" ? "magic" : "password"));
          setError("");
        }}
        className="self-start font-hand text-lg text-accent transition hover:text-accent-dark"
      >
        {mode === "password"
          ? "use a magic link instead →"
          : "← use a password instead"}
      </button>

      {error && <p className="text-sm text-accent-dark">{error}</p>}
    </form>
  );
}
