import Link from "next/link";
import type { OnboardingModule, ModuleStatus } from "@/lib/onboardingModules";
import styles from "./ModuleChecklist.module.css";

const STATUS_LABELS: Record<ModuleStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  complete: "Complete",
  coming_soon: "Coming Soon",
};

export default function ModuleChecklist({ modules }: { modules: OnboardingModule[] }) {
  const isExternal = (href: string) => /^https?:\/\//.test(href);

  return (
    <div className={styles.list}>
      {modules.map(m => {
        const isPlaceholder = m.status === "coming_soon";
        return (
          <div key={m.key} className={`${styles.row} ${isPlaceholder ? styles["row--placeholder"] : ""}`}>
            <div>
              <div className={styles.labelRow}>
                <span className={styles.label}>{m.label}</span>
                <span className={`${styles.status} ${styles[`status--${m.status}`]}`}>
                  {STATUS_LABELS[m.status]}
                </span>
              </div>
              <div className={styles.description}>{m.description}</div>
            </div>
            {m.href && !isPlaceholder && (
              <Link
                href={m.href}
                target={isExternal(m.href) ? "_blank" : undefined}
                rel={isExternal(m.href) ? "noopener noreferrer" : undefined}
                className={styles.cta}
              >
                {m.ctaLabel || "Continue"}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
