import type { MerchantApplication } from "./merchant";

export type AdapterResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface ProcessorAdapter<TExternal = unknown> {
  name: string;
  toExternal(app: MerchantApplication): TExternal;
  fromExternal(record: TExternal): Partial<MerchantApplication>;
  push(app: MerchantApplication): Promise<AdapterResult<TExternal>>;
  pull(externalId: string): Promise<AdapterResult<Partial<MerchantApplication>>>;
}
