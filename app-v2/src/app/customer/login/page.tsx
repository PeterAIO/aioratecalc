"use client";

import { useState, useTransition, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { customerLoginAction, requestCustomerLoginAction } from "@/lib/actions/customer";
import styles from "@/styles/auth.module.css";

function CustomerLoginForm() {
  const searchParams = useSearchParams();
  const linkError = searchParams.get("error");
  const [mode, setMode] = useState<"password" | "link">("password");
  const [pending, startTransition] = useTransition();

  const [loginError, setLoginError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devUrl, setDevUrl] = useState<string | null>(null);

  const handlePasswordSubmit = (formData: FormData) => {
    setLoginError(null);
    startTransition(async () => {
      const result = await customerLoginAction(formData);
      if (result) setLoginError(result);
    });
  };

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await requestCustomerLoginAction(email);
      setSent(true);
      setDevUrl(result.devUrl);
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Sign In</h1>
        <p className={styles.subtitle}>
          {mode === "password"
            ? "Sign in to your AIO account."
            : "Enter your email and we’ll send you a link to continue."}
        </p>

        {linkError && !sent && (
          <div className={styles.error}>
            {linkError === "expired" ? "That link expired. Request a new one below." : "That link isn't valid anymore. Request a new one below."}
          </div>
        )}

        {mode === "password" ? (
          <>
            <form action={handlePasswordSubmit}>
              <label className={styles.label}>Email</label>
              <input
                name="email" type="email" required autoComplete="email" placeholder="you@business.com"
                className={styles.input}
              />

              <label className={styles.label}>Password</label>
              <input
                name="password" type="password" required autoComplete="current-password"
                className={`${styles.input} ${loginError ? styles["input--error"] : ""}`}
              />

              {loginError && <div className={styles.error}>{loginError}</div>}

              <button type="submit" disabled={pending} className={styles.button}>
                {pending ? "Signing in…" : "Sign In"}
              </button>
            </form>
            <button type="button" onClick={() => setMode("link")} className={styles.switchLink}>
              Don&apos;t have a password yet? Email me a sign-in link
            </button>
          </>
        ) : sent ? (
          <div>
            <p className={styles.success} style={{ marginBottom: devUrl ? "1rem" : 0 }}>
              If that email has an account, we sent a sign-in link — check your inbox.
            </p>
            {devUrl && (
              <div className={styles.devNote} style={{ marginTop: 0 }}>
                Dev mode (no email configured): <a href={devUrl}>{devUrl}</a>
              </div>
            )}
          </div>
        ) : (
          <>
            <form onSubmit={handleLinkSubmit}>
              <label className={styles.label}>Email</label>
              <input
                type="email" required autoComplete="email" placeholder="you@business.com"
                value={email} onChange={e => setEmail(e.target.value)}
                className={styles.input}
              />
              <button type="submit" disabled={pending} className={styles.button}>
                {pending ? "Sending…" : "Email Me a Link"}
              </button>
            </form>
            <button type="button" onClick={() => setMode("password")} className={styles.switchLink}>
              ← Back to password sign-in
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function CustomerLoginPage() {
  return (
    <Suspense>
      <CustomerLoginForm />
    </Suspense>
  );
}
