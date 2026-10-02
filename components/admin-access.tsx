"use client";

import { useEffect, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LockKeyhole, LoaderCircle } from "lucide-react";
import { AdminDesk } from "./admin-desk";

type Configuration = {
  supabaseUrl: string | null;
  publishableKey: string | null;
  localTokenAllowed: boolean;
};
type Access = {
  kind: "supabase" | "local-token";
  userId: string;
  token: string;
};

/** Operator sessions remain in this page's memory; guest creation has no sign-in. */
export function AdminAccess({
  configuration,
}: {
  configuration: Configuration;
}) {
  const [access, setAccess] = useState<Access | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localToken, setLocalToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const client = useRef<SupabaseClient | null>(null);
  const acceptSession = useRef(false);
  const attempt = useRef(0);
  const configured = Boolean(
    configuration.supabaseUrl && configuration.publishableKey,
  );

  useEffect(() => {
    if (!configuration.supabaseUrl || !configuration.publishableKey) return;
    const authClient = createClient(
      configuration.supabaseUrl,
      configuration.publishableKey,
      {
        auth: {
          persistSession: false,
          detectSessionInUrl: false,
          autoRefreshToken: true,
        },
      },
    );
    client.current = authClient;
    const {
      data: { subscription },
    } = authClient.auth.onAuthStateChange((_event, session) => {
      if (!acceptSession.current) return;
      setAccess(
        session
          ? {
              kind: "supabase",
              userId: session.user.id,
              token: session.access_token,
            }
          : null,
      );
    });
    return () => {
      acceptSession.current = false;
      attempt.current++;
      subscription.unsubscribe();
      void authClient.auth.stopAutoRefresh();
      client.current = null;
    };
  }, [configuration.supabaseUrl, configuration.publishableKey]);

  async function signIn() {
    if (!client.current || busy) return;
    const currentAttempt = ++attempt.current;
    setBusy(true);
    setError("");
    setNotice("");
    acceptSession.current = true;
    try {
      const result = await client.current.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (currentAttempt !== attempt.current) return;
      if (result.error || !result.data.session)
        throw new Error(
          "Sign-in failed. Check your operator email and password.",
        );
      setAccess({
        kind: "supabase",
        userId: result.data.session.user.id,
        token: result.data.session.access_token,
      });
      void client.current.auth.startAutoRefresh();
    } catch (cause) {
      if (currentAttempt !== attempt.current) return;
      acceptSession.current = false;
      setAccess(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "The sign-in service could not be reached.",
      );
    } finally {
      if (currentAttempt === attempt.current) {
        setPassword("");
        setBusy(false);
      }
    }
  }

  async function signOut(
    message = "You are signed out of the production desk.",
  ) {
    const hadSupabaseSession = access?.kind === "supabase";
    const currentAttempt = ++attempt.current;
    acceptSession.current = false;
    setAccess(null);
    setPassword("");
    setLocalToken("");
    setBusy(Boolean(client.current && hadSupabaseSession));
    setError("");
    setNotice(message);
    if (client.current && hadSupabaseSession) {
      const authClient = client.current;
      try {
        await authClient.auth.stopAutoRefresh();
        const result = await authClient.auth.signOut({ scope: "local" });
        if (result.error && currentAttempt === attempt.current)
          setNotice(
            `${message} The sign-in service could not confirm session revocation; contact the studio owner if this device is shared.`,
          );
      } catch {
        if (currentAttempt === attempt.current)
          setNotice(
            `${message} The sign-in service could not confirm session revocation; contact the studio owner if this device is shared.`,
          );
      } finally {
        if (currentAttempt === attempt.current) setBusy(false);
      }
    }
  }

  if (access)
    return (
      <AdminDesk
        key={`${access.kind}:${access.userId}`}
        accessToken={access.token}
        onSignOut={() => void signOut()}
        onSessionEnded={(message) => void signOut(message)}
      />
    );

  return (
    <section className="prose-card" aria-labelledby="operator-access-title">
      <LockKeyhole size={22} aria-hidden="true" />
      <h2 id="operator-access-title">Operator access</h2>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="inline-warning" role="alert">
          {error}
        </p>
      )}
      {configured ? (
        <>
          <p>
            Sign in with the operator account provided by the studio owner.
            Access is checked against the studio’s active team before any order
            is shown.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void signIn();
            }}
          >
            <label className="text-field">
              Operator email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className="text-field">
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
            </label>
            <button
              className="button"
              disabled={busy || !email.trim() || !password}
            >
              {busy && (
                <LoaderCircle className="spin" size={16} aria-hidden="true" />
              )}
              Sign in to production desk
            </button>
          </form>
          <p className="fine-print">
            This visit stays in memory. Reloading or closing the page requires a
            new sign-in. Contact the studio owner for account or password help.
          </p>
        </>
      ) : (
        <p>
          Individual operator sign-in is not configured yet. The studio owner
          must connect authentication and grant an active operator account
          before orders can be reviewed.
        </p>
      )}
      {configuration.localTokenAllowed && (
        <details open={!configured}>
          <summary>Local development access</summary>
          <p>
            This access method is restricted to the configured local development
            server.
          </p>
          <form
            className="setup-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (busy || !localToken) return;
              acceptSession.current = false;
              setAccess({
                kind: "local-token",
                userId: "local",
                token: localToken,
              });
              setLocalToken("");
              setError("");
              setNotice("");
            }}
          >
            <label className="text-field">
              Local administrator token
              <input
                type="password"
                autoComplete="off"
                disabled={busy}
                value={localToken}
                onChange={(event) => setLocalToken(event.target.value)}
                required
              />
            </label>
            <button className="button" disabled={busy || !localToken}>
              Open local production desk
            </button>
          </form>
        </details>
      )}
    </section>
  );
}
