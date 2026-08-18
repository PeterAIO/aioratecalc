"use server";

import { getEffectiveRole } from "@/lib/auth/getEffectiveRole";
import { listProducts } from "@/lib/adapters/hubspot";
import { isPickable } from "@/lib/quoting";
import type { CatalogProduct } from "@/types/merchant";

// AIO's sellable catalog lives in HubSpot and is maintained there. It changes
// rarely (37 records, months between edits), so a module-level TTL cache keeps
// the configurator from fanning out an API call per page load — and, more to
// the point, per keystroke. Per-process and best-effort: a cold lambda just
// refetches, which is exactly the right failure mode for a read-only mirror.
const CATALOG_TTL_MS = 10 * 60 * 1000;

let cache: { products: CatalogProduct[]; fetchedAt: number } | null = null;
let inFlight: Promise<CatalogProduct[]> | null = null;

async function getCatalog(): Promise<CatalogProduct[]> {
  if (cache && Date.now() - cache.fetchedAt < CATALOG_TTL_MS) return cache.products;
  // Collapse concurrent cold-start callers onto one request.
  if (!inFlight) {
    inFlight = listProducts()
      .then(products => {
        cache = { products, fetchedAt: Date.now() };
        return products;
      })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

export type CatalogResult = {
  products: CatalogProduct[];
  /** Everything active, including the tier products the picker hides — the derived platform line needs them. */
  all: CatalogProduct[];
  error: string | null;
};

/**
 * The rep-facing product catalog: active products minus the ones a rep must not
 * quote by hand (see PICKER_EXCLUDED_PRODUCT_NAMES). Returns an error string
 * rather than throwing so a missing HubSpot token degrades the configurator
 * instead of taking down the whole prospect form.
 */
export async function listQuotableProductsAction(): Promise<CatalogResult> {
  const effective = await getEffectiveRole();
  if (!effective) throw new Error("Not authenticated");

  try {
    const all = await getCatalog();
    return { products: all.filter(isPickable), all, error: null };
  } catch (err) {
    return {
      products: [],
      all: [],
      error: err instanceof Error ? err.message : "Could not load the product catalog",
    };
  }
}
