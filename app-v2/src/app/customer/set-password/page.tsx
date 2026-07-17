"use client";

import { useState, useTransition, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setCustomerPasswordAction } from "@/lib/actions/customer";
import styles from "@/styles/auth.module.css";

function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/customer";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await setCustomerPasswordAction(password);
        router.push(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save password");
      }
    });
  };

  return (
    <div className={styles.page}>
      <form onSubmit={handleSubmit} className={styles.card}>
        <h1 className={styles.title}>Set a Password</h1>
        <p className={styles.subtitle}>
          Skip the email link next time — set a password so you can sign in directly.
        </p>

        <label className={styles.label}>New Password</label>
        <input
          type="password" required autoComplete="new-password" minLength={8}
          value={password} onChange={e => setPassword(e.target.value)}
          className={styles.input}
        />

        <label className={styles.label}>Confirm Password</label>
        <input
          type="password" required autoComplete="new-password" minLength={8}
          value={confirm} onChange={e => setConfirm(e.target.value)}
          className={`${styles.input} ${error ? styles["input--error"] : ""}`}
        />

        {error && <div className={styles.error}>{error}</div>}

        <button type="submit" disabled={pending} className={styles.button}>
          {pending ? "Saving…" : "Save Password"}
        </button>
        <button type="button" onClick={() => router.push(next)} className={styles.switchLink}>
          Skip for now
        </button>
      </form>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordForm />
    </Suspense>
  );
}
