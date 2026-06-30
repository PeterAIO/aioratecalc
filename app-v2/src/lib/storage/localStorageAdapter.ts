"use client";

import type { IStorage } from "./storageInterface";
import type { MerchantApplication, CustomerSubmission, AppSettings, DealStage } from "@/types/merchant";

const APPS_KEY      = "aio_applications";
const SUBS_KEY      = "aio_submissions";
const SETTINGS_KEY  = "clearrate:settings";
const ADYEN_KEY     = "clearrate:adyen_config";

const defaultSettings: AppSettings = { processors: [] };

function migrateOldRecord(raw: Record<string, unknown>): MerchantApplication {
  // Old format has flat business/owner/processing/banking/agreement/analysis/proposal
  const oldBiz     = (raw.business  as Record<string, string> | undefined) || {};
  const oldOwner   = (raw.owner     as Record<string, string> | undefined) || {};
  const oldProc    = (raw.processing as Record<string, string> | undefined) || {};
  const oldAgreement = (raw.agreement as Record<string, unknown> | undefined) || {};

  const app: MerchantApplication = {
    id:          String(raw.id || Date.now()),
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
    merchantLinkToken:  null,
    merchantLinkSentAt: null,
    merchantLinkExpiry: null,
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
  async listApplications(): Promise<MerchantApplication[]> {
    if (typeof window === "undefined") return [];
    try {
      const raw = JSON.parse(localStorage.getItem(APPS_KEY) || "[]") as Record<string, unknown>[];
      return raw.map(r => isNewFormat(r) ? (r as unknown as MerchantApplication) : migrateOldRecord(r));
    } catch {
      return [];
    }
  }

  async getApplication(id: string): Promise<MerchantApplication | null> {
    const all = await this.listApplications();
    return all.find(a => a.id === id) || null;
  }

  async saveApplication(app: MerchantApplication): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      const all = await this.listApplications();
      const idx = all.findIndex(a => a.id === app.id);
      if (idx >= 0) {
        all[idx] = app;
      } else {
        all.unshift(app);
      }
      localStorage.setItem(APPS_KEY, JSON.stringify(all.slice(0, 500)));
    } catch {}
  }

  async deleteApplication(id: string): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      const all = await this.listApplications();
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

  async saveSettings(s: AppSettings): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      const { adyenConfig, ...rest } = s;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
      if (adyenConfig) {
        localStorage.setItem(ADYEN_KEY, JSON.stringify(adyenConfig));
      }
    } catch {}
  }

  async listSubmissions(): Promise<CustomerSubmission[]> {
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
      const all = await this.listSubmissions();
      all.unshift(s);
      localStorage.setItem(SUBS_KEY, JSON.stringify(all.slice(0, 500)));
    } catch {}
  }
}

export const storage = new LocalStorageAdapter();
