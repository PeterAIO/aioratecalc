"use client";

import { useState, useTransition } from "react";
import { loginAction } from "@/lib/actions/auth";
import styles from "@/styles/auth.module.css";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await loginAction(formData);
      if (result) setError(result);
    });
  };

  return (
    <div className={styles.page}>
      <form action={handleSubmit} className={styles.card}>
        <div className={styles.mark}>
          <span className={styles.markLetter}>A</span>
        </div>
        <h1 className={styles.title}>Sign In</h1>
        <p className={styles.subtitle}>AIO Rate Calculator</p>

        <label className={styles.label}>Email</label>
        <input
          name="email" type="email" required autoComplete="email" placeholder="you@aioapp.com"
          className={styles.input}
        />

        <label className={styles.label}>Password</label>
        <input
          name="password" type="password" required autoComplete="current-password"
          className={`${styles.input} ${error ? styles["input--error"] : ""}`}
        />

        {error && <div className={styles.error}>{error}</div>}

        <button type="submit" disabled={pending} className={styles.button}>
          {pending ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}
