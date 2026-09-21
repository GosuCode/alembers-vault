import { useState } from "react";
import { signInWithEmail } from "../../lib/admin";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    setStatus("sending");
    setError("");
    const result = await signInWithEmail(email.trim());
    if (result.error) {
      setError(result.error);
      setStatus("idle");
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
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
          className="rounded-md border border-ink/70 bg-white px-4 py-2.5 text-sm text-ink pop-sm transition placeholder:text-pencil/70 focus:border-accent focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={status === "sending"}
        className="rounded-md border border-ink/80 bg-accent px-5 py-2.5 text-sm font-semibold text-white pop-sm transition hover:-translate-y-0.5 hover:bg-accent-dark disabled:opacity-60"
      >
        {status === "sending" ? "sending…" : "send magic link"}
      </button>
      {error && <p className="text-sm text-accent-dark">{error}</p>}
    </form>
  );
}
