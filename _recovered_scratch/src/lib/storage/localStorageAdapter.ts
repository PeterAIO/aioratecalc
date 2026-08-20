"use client";

import type { IStorage, StorageScope } from "./storageInterface";
import type { MerchantApplication, CustomerSubmission, AppSettings, DealStage, Processor } from "@/types/merchant";

const APPS_KEY      = "aio_applications";
const SUBS_KEY      = "aio_submissions";
const SETTINGS_KEY  = "clearrate:settings";
const ADYEN_KEY     = "clearrate:adyen_config";

// TEMP-NO-AUTH: LocalStorageAdapter predates real auth (task 3) and gets
// removed entirely once the storage layer swaps to Postgres (task 5). Until
// then, client call sites pass one of these fixed scopes instead of a real
// session-derived one.
export const LOCAL_DEV_REP_SCOPE: StorageScope = { userId: "local-dev-rep", role: "rep" };
export const LOCAL_DEV_ADMIN_SCOPE: StorageScope = { userId: "local-dev-admin", role: "admin" };

export const DEFAULT_PROCESSOR: Processor = {
  id: "adyen", name: "Adyen (AIO)", isDefault: true,
  tiers: [{
    id: "adyen-standard", name: "Standard", isDefault: true,
    processingBps: 0.0010, perTxnFee: 0.12, schemeBps: 0.0005, monthlyFee: 0,
  }],
};

const defaultSettings: AppSettings = { processors: [DEFAULT_PROCESSOR] };

function migrateOldRecord(raw: Record<string, unknown>): MerchantApplication {
  // Old format has flat business/owner/processing/banking/agreement/analysis/proposal
  const oldBiz     = (raw.business  as Record<string, string> | undefined) || {};
  const oldOwner   = (raw.owner     as Record<string, string> | undefined) || {};
  const oldProc    = (raw.processing as Record<string, string> | undefined) || {};
  const oldAgreement = (raw.agreement as Record<string, unknown> | undefined) || {};

  const app: MerchantApplication = {
    id:          String(raw.id || Date.now()),
    ownerUserId: String(raw.ownerUserId || "legacy-unassigned"),
    createdAt:   String(raw.submittedAt || raw.createdAt || new Date().toISOString()),
    updatedAt:   String(raw.submittedAt || raw.updatedAt || new Date().toISOString()),
    stage:       "proposal_sent" as DealStage,
    hubspotDealId: null,
    adyenIds:    raw.adyen
      ? {
          legalEntityId:    (raw.adyen as Record<string, string>).orgId || null,
          merchantAccountId: (raw.adyen as Record<string, string>).merchantId || null,
          environment:      ((raw.adyen as Record<string, string>).environment || "test") as "test" | "live",
        }
      : null,
    adyenOnboardingUrl: null,
    targetMargin: null,
    pricingModel: null,
    customerLinkToken: null,
    customerLinkPurpose: null,
    customerLinkSentAt: null,
    customerLinkExpiresAt: null,
    analysis: (raw.analysis as MerchantApplication["analysis"]) || null,
    proposal: (raw.proposal as MerchantApplication["proposal"]) || null,
    business: oldBiz.legalName || oldBiz.dba
      ? {
          legalName:       oldBiz.legalName || "",
          dba:             oldBiz.dba || "",
          bizType:         (oldBiz.bizType || "llc") as NonNullable<MerchantApplication["business"]>["bizType"],
          address:         oldBiz.address || "",
          city:            oldBiz.city || "",
          state:           oldBiz.state || "",
          zip:             oldBiz.zip || "",
          phone:           oldBiz.phone || "",
          website:         oldBiz.website || "",
          yearsInBusiness: oldBiz.yearsInBusiness || "",
          annualRevenue:   oldBiz.annualRevenue || "",
        }
      : null,
    ownerContact: oldOwner.firstName || oldOwner.email
      ? {
          firstName: oldOwner.firstName || "",
          lastName:  oldOwner.lastName  || "",
          title:     oldOwner.title     || "Owner",
          email:     oldOwner.email     || "",
          phone:     oldOwner.phone     || "",
        }
      : null,
    processing: oldProc.monthlyVolume
      ? {
          monthlyVolume:        oldProc.monthlyVolume || "",
          avgTicket:            oldProc.avgTicket || "",
          cardPresentPct:       oldProc.cardPresentPct || "",
          mcc:                  oldProc.mcc || "",
          businessDescription:  oldProc.businessDescription || "",
          previouslyTerminated: (oldProc.previouslyTerminated || "no") as "yes" | "no",
          bankruptcy:           (oldProc.bankruptcy || "no") as "yes" | "no",
          currentProcessor:     oldProc.currentProcessor || "",
        }
      : null,
    agreement: oldAgreement.sigName
      ? {
          sigName:                    String(oldAgreement.sigName),
          sigDate:                    String(oldAgreement.sigDate || ""),
          termsAccepted:              true,
          electronicConsentAccepted:  true,
        }
      : null,
  };
  return app;
}

function isNewFormat(raw: Record<string, unknown>): boolean {
  return typeof raw.stage === "string" && typeof raw.createdAt === "string" && "ownerContact" in raw;
}

export class LocalStorageAdapter implements IStorage {
  private async listAll(): Promise<MerchantApplication[]> {
    if (typeof window === "undefined") return [];
    try {
      const raw = JSON.parse(localStorage.getItem(APPS_KEY) || "[]") as Record<string, unknown>[];
      return raw.map(r => isNewFormat(r) ? (r as unknown as MerchantApplication) : migrateOldRecord(r));
    } catch {
      return [];
    }
  }

  async listApplications(scope: StorageScope): Promise<MerchantApplication[]> {
    const all = await this.listAll();
    return scope.role === "admin" ? all : all.filter(a => a.ownerUserId === scope.userId);
  }

  async getApplication(scope: StorageScope, id: string): Promise<MerchantApplication | null> {
    const all = await this.listApplications(scope);
    return all.find(a => a.id === id) || null;
  }

  async saveApplication(scope: StorageScope, app: MerchantApplication): Promise<void> {
    if (typeof window === "undefined") return;
    if (scope.role !== "admin" && app.ownerUserId !== scope.userId) return;
    try {
      const all = await this.listAll();
      const idx = all.findIndex(a => a.id === app.id);
      if (idx >= 0) {
        all[idx] = app;
      } else {
        all.unshift(app);
      }
      localStorage.setItem(APPS_KEY, JSON.stringify(all.slice(0, 500)));
    } catch {}
  }

  async deleteApplication(scope: StorageScope, id: string): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      const all = await this.listAll();
      const target = all.find(a => a.id === id);
      if (!target) return;
      if (scope.role !== "admin" && target.ownerUserId !== scope.userId) return;
      localStorage.setItem(APPS_KEY, JSON.stringify(all.filter(a => a.id !== id)));
    } catch {}
  }

  async getSettings(): Promise<AppSettings> {
    if (typeof window === "undefined") return defaultSettings;
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const settings = raw ? JSON.parse(raw) : { ...defaultSettings };
      // Merge adyen config from its own key
      const adyenRaw = localStorage.getItem(ADYEN_KEY);
      if (adyenRaw) {
        settings.adyenConfig = JSON.parse(adyenRaw);
      }
      return settings;
    } catch {
      return defaultSettings;
    }
  }

  async saveSettings(_scope: StorageScope, s: AppSettings): Promise<void> {
    // AppSettings (processors/adyenConfig) stays rep-editable — the admin-only
    // pillow/margin policy lives in a separate table (margin_policy), not here.
    if (typeof window === "undefined") return;
    try {
      const { adyenConfig, ...rest } = s;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
      if (adyenConfig) {
        localStorage.setItem(ADYEN_KEY, JSON.stringify(adyenConfig));
      }
    } catch {}
  }

  async listSubmissions(_scope: StorageScope): Promise<CustomerSubmission[]> {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(SUBS_KEY) || "[]");
    } catch {
      return [];
    }
  }

  async saveSubmission(s: CustomerSubmission): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      const all = await this.listSubmissions(LOCAL_DEV_ADMIN_SCOPE);
      all.unshift(s);
      localStorage.setItem(SUBS_KEY, JSON.stringify(all.slice(0, 500)));
    } catch {}
  }
}

export const storage = new LocalStorageAdapter();
