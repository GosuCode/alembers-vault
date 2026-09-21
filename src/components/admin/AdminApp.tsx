import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getAuthClient, isAdmin, signOut } from "../../lib/admin";
import LoginForm from "./LoginForm";
import Overview from "./Overview";
import Visitors from "./Visitors";

type Tab = "overview" | "visitors";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "overview" },
  { id: "visitors", label: "visitors" },
];

export default function AdminApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    const supabase = getAuthClient();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setAdmin(false);
      return;
    }
    let active = true;
    isAdmin().then((ok) => {
      if (active) setAdmin(ok);
    });
    return () => {
      active = false;
    };
  }, [session]);

  if (!ready) {
    return <p className="font-hand text-2xl text-pencil">unlocking the drawer…</p>;
  }

  if (!session) {
    return (
      <div className="max-w-md">
        <p className="mb-5 text-sm text-pencil">
          Sign in with your admin email — we&apos;ll send a one-time magic link.
        </p>
        <LoginForm />
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="rounded-lg border border-ink/60 bg-marker/60 p-6">
        <p className="font-hand text-2xl">not on the guest list</p>
        <p className="mt-2 text-sm text-pencil">
          Signed in as <strong>{session.user.email}</strong>, but this account
          isn&apos;t an admin. Ask the owner to add it to <code>public.admins</code>.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-4 rounded-md border border-ink/70 bg-white px-4 py-1.5 font-hand text-lg leading-tight transition hover:bg-marker"
        >
          sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={[
                "rounded-md border px-4 py-1.5 font-hand text-lg leading-tight transition",
                tab === id
                  ? "border-ink/80 bg-accent text-white"
                  : "border-ink/70 bg-white hover:bg-marker",
              ].join(" ")}
              aria-current={tab === id ? "page" : undefined}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm text-pencil">
          <span>{session.user.email}</span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-md border border-ink/70 bg-white px-3 py-1 font-hand text-base leading-tight transition hover:bg-marker"
          >
            sign out
          </button>
        </div>
      </div>

      {tab === "overview" ? <Overview /> : <Visitors />}
    </div>
  );
}
