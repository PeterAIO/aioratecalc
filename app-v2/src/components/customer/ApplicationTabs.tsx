"use client";

import { useState } from "react";
import Link from "next/link";
import type { MerchantApplication } from "@/types/merchant";
import type { OnboardingModule } from "@/lib/onboardingModules";
import ModuleChecklist from "@/components/customer/ModuleChecklist";
import CustomerOnboardStep from "@/components/customer/CustomerOnboardStep";
import { DataGroups } from "@/components/customer/MyDataSection";
import styles from "@/app/customer/customer.module.css";
import dataStyles from "@/components/customer/MyDataSection.module.css";

type Props = { app: MerchantApplication; modules: OnboardingModule[] };

// Segmented "Checklist" / "My Data" tabs for a single application. My Data
// starts read-only and switches in-place to the same form used at
// /customer/applications/[id]/edit — so editing never leaves this page.
export default function ApplicationTabs({ app, modules }: Props) {
  const [tab, setTab] = useState<"checklist" | "data">("checklist");
  const [editing, setEditing] = useState(false);

  const hasData = Boolean(app.business || app.ownerContact || app.processing);

  return (
    <>
      <div className={styles.tabsRow}>
        <div className={styles.tabs} data-active={tab} role="tablist">
          <button role="tab" aria-selected={tab === "checklist"} className={styles.tab} onClick={() => setTab("checklist")}>
            Checklist
          </button>
          <button role="tab" aria-selected={tab === "data"} className={styles.tab} onClick={() => { setTab("data"); setEditing(false); }}>
            My Data
          </button>
        </div>
      </div>

      {tab === "checklist" ? (
        <div className={styles.tabPanel}>
          <ModuleChecklist modules={modules} />
        </div>
      ) : (
        <div className={styles.tabPanel}>
          {editing ? (
            <CustomerOnboardStep app={app} />
          ) : (
            <div className={dataStyles.panel}>
              <DataGroups app={app} />
              <button type="button" className={styles.editLink} onClick={() => setEditing(true)}>
                {hasData ? "Edit My Data →" : "Add My Data →"}
              </button>
            </div>
          )}
          {!editing && (
            <p className={styles.tabHint}>
              This is what AIO has on file for this application. It&apos;s reused to autofill other
              AIO services, like payroll and Foodbuy —{" "}
              <Link href="/customer">view across all applications</Link>.
            </p>
          )}
        </div>
      )}
    </>
  );
}
