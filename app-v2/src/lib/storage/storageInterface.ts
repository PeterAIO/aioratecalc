import type { MerchantApplication, CustomerSubmission, AppSettings } from "@/types/merchant";

export interface IStorage {
  listApplications(): Promise<MerchantApplication[]>;
  getApplication(id: string): Promise<MerchantApplication | null>;
  saveApplication(app: MerchantApplication): Promise<void>;
  deleteApplication(id: string): Promise<void>;
  getSettings(): Promise<AppSettings>;
  saveSettings(s: AppSettings): Promise<void>;
  listSubmissions(): Promise<CustomerSubmission[]>;
  saveSubmission(s: CustomerSubmission): Promise<void>;
}
