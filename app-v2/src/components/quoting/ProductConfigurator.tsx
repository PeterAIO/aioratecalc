"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { listQuotableProductsAction } from "@/lib/actions/catalog";
import {
  FOOD_TRUCK_PLATFORM_NAME,
  ORDER_POINT_CHANNELS,
  PLATFORM_TIER_BOUNDARY,
  deriveOrderPoints,
  groupProducts,
  quoteTotals,
  resolvePlatformTier,
  toQuoteLine,
  type PlatformTierResult,
} from "@/lib/quoting";
import { fmt$, fmtFrequency, monthlyEquivalent } from "@/lib/utils";
import type { CatalogProduct, OrderPoints, QuoteLine, QuoteTotals } from "@/types/merchant";
import styles from "./ProductConfigurator.module.css";

/** What the rep picked. Prices and the derived tier are the server's business. */
export type ProductPick = { hubspotProductId: string; qty: number };

/**
 * Everything downstream of the picks, recomputed here for the live preview.
 * DISPLAY ONLY — the same derivation runs again server-side against the live
 * catalog, and that result is what gets persisted. The parent gets it so it can
 * gate its own submit (notably on `tier.status === "unresolved"`).
 */
export type ConfiguredQuote = {
  quoteLines: QuoteLine[];
  orderPoints: OrderPoints;
  tier: PlatformTierResult;
  totals: QuoteTotals;
};

type Props = {
  picks: ProductPick[];
  channels: string[];
  onPicksChange: (picks: ProductPick[]) => void;
  onChannelsChange: (channels: string[]) => void;
  onDerivedChange: (quote: ConfiguredQuote) => void;
};

// A recurring line always shows BOTH figures: the charge as it actually bills
// and the monthly equivalent. AIO's platform fees bill weekly, so "$99/mo" is
// wrong by 4.33x and "$99" alone is ambiguous.
function priceLabel(unitPrice: number, frequency: QuoteLine["billingFrequency"]) {
  if (frequency === "one_time") return `${fmt$(unitPrice)} one-time`;
  return `${fmt$(unitPrice)}/${fmtFrequency(frequency)} (~${fmt$(monthlyEquivalent(unitPrice, frequency))}/mo)`;
}

export default function ProductConfigurator({
  picks, channels, onPicksChange, onChannelsChange, onDerivedChange,
}: Props) {
  // The catalog is read from HubSpot server-side and cached there, so this is
  // one call per mount, not one per keystroke. It lives in here rather than in
  // the page because every caller needs exactly the same call, and the derived
  // platform tier needs the unfiltered `all` list that only this fetch returns.
  const [catalog, setCatalog]         = useState<CatalogProduct[]>([]);
  const [fullCatalog, setFullCatalog] = useState<CatalogProduct[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    listQuotableProductsAction()
      .then(res => { setCatalog(res.products); setFullCatalog(res.all); setCatalogError(res.error); })
      .catch(e => setCatalogError(e instanceof Error ? e.message : "Could not load the product catalog"))
      .finally(() => setCatalogLoading(false));
  }, []);

  const groups = useMemo(() => groupProducts(catalog), [catalog]);

  // Everything downstream of the picker is derived, never separately stored:
  // the order-point count comes from the lines, and the platform tier comes
  // from the count. The rep changes quantities; the tier follows.
  //
  // This is a PREVIEW. The same derivation runs again server-side, against the
  // live catalog, and that result is what gets persisted — the browser only
  // ever sends the picks.
  const pickedLines = useMemo(() => {
    const byId = new Map(catalog.map(p => [p.hubspotProductId, p]));
    return picks.flatMap(pick => {
      const product = byId.get(pick.hubspotProductId);
      return product && pick.qty > 0 ? [toQuoteLine(product, pick.qty)] : [];
    });
  }, [catalog, picks]);
  const breakdown = useMemo(() => deriveOrderPoints(pickedLines, channels), [pickedLines, channels]);
  const tier      = useMemo(
    () => resolvePlatformTier(breakdown.orderPoints.total, fullCatalog, pickedLines),
    [breakdown.orderPoints.total, fullCatalog, pickedLines]
  );
  const tierLine   = tier.line;
  const quoteLines = useMemo(() => (tierLine ? [tierLine, ...pickedLines] : pickedLines), [tierLine, pickedLines]);
  const totals     = useMemo(() => quoteTotals(quoteLines), [quoteLines]);

  // Held in a ref so a caller passing an inline arrow can't turn the push of
  // derived state back up into a render loop.
  const emit = useRef(onDerivedChange);
  useEffect(() => { emit.current = onDerivedChange; });
  useEffect(() => {
    emit.current({ quoteLines, orderPoints: breakdown.orderPoints, tier, totals });
  }, [quoteLines, breakdown.orderPoints, tier, totals]);

  // Picks are kept in catalog order, so the lines the server is asked to price
  // arrive in the same order the rep sees them listed.
  const qtyOf = (id: string) => picks.find(p => p.hubspotProductId === id)?.qty ?? 0;

  const setQtyFor = (id: string, next: number) => {
    const qty = Math.max(0, next);
    const wanted = new Map(picks.map(p => [p.hubspotProductId, p.qty]));
    if (qty > 0) wanted.set(id, qty);
    else wanted.delete(id);
    onPicksChange(
      catalog
        .filter(p => wanted.has(p.hubspotProductId))
        .map(p => ({ hubspotProductId: p.hubspotProductId, qty: wanted.get(p.hubspotProductId)! }))
    );
  };

  const toggleChannel = (id: string) =>
    onChannelsChange(channels.includes(id) ? channels.filter(c => c !== id) : [...channels, id]);

  return (
    <>
      <div className={styles.panel}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Products &amp; Hardware</h2>
          <p className={styles.sectionNote}>
            Priced from the live AIO catalog and snapshotted onto the quote, so a later catalog
            change never moves what this customer was quoted. The platform fee isn&apos;t in the
            list — it follows the ordering-point count below.
          </p>
        </div>

        {catalogLoading && <p className={styles.sectionNote}>Loading catalog…</p>}
        {catalogError && (
          <div className={styles.error}>
            Product catalog unavailable ({catalogError}). You can still send the rate quote — add
            hardware later.
          </div>
        )}

        {groups.map(group => (
          <div key={group.type} className={styles.group}>
            <div className={styles.groupTitle}>{group.label}</div>
            {group.products.map(p => {
              const n = qtyOf(p.hubspotProductId);
              return (
                <div key={p.hubspotProductId} className={styles.productRow} data-picked={n > 0}>
                  <div className={styles.productMain}>
                    <div className={styles.productName}>{p.name}</div>
                    <div className={styles.productPrice}>{priceLabel(p.price, p.billingFrequency)}</div>
                  </div>
                  <div className={styles.stepper}>
                    <button
                      type="button" className={styles.stepBtn} disabled={n === 0}
                      onClick={() => setQtyFor(p.hubspotProductId, n - 1)}
                      aria-label={`Remove one ${p.name}`}
                    >−</button>
                    <span className={styles.stepQty}>{n}</span>
                    <button
                      type="button" className={styles.stepBtn}
                      onClick={() => setQtyFor(p.hubspotProductId, n + 1)}
                      aria-label={`Add one ${p.name}`}
                    >+</button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className={styles.panel}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Ordering Points</h2>
          <p className={styles.sectionNote}>
            Every place an order can be placed. Hardware is counted from the lines above; these
            channels never appear on a hardware list, so they have to be declared here.
          </p>
        </div>

        <div className={styles.channelGrid}>
          {ORDER_POINT_CHANNELS.map(c => (
            <label key={c.id} className={styles.channel} data-on={channels.includes(c.id)}>
              <input
                type="checkbox" checked={channels.includes(c.id)}
                onChange={() => toggleChannel(c.id)} className={styles.channelBox}
              />
              <span className={styles.channelLabel}>{c.label}</span>
              {c.note && <span className={styles.channelNote}>{c.note}</span>}
            </label>
          ))}
        </div>

        <div className={styles.countRow}>
          <span className={styles.countLabel}>Ordering points</span>
          <span className={styles.countValue}>{breakdown.orderPoints.total}</span>
        </div>

        {tierLine ? (
          <div className={styles.tierBox} data-tier={breakdown.orderPoints.total > PLATFORM_TIER_BOUNDARY ? "large" : "small"}>
            <div className={styles.tierName}>{tierLine.name}</div>
            <div className={styles.tierPrice}>{priceLabel(tierLine.unitPrice, tierLine.billingFrequency)}</div>
            <div className={styles.tierNote}>
              {breakdown.orderPoints.total} ordering point{breakdown.orderPoints.total === 1 ? "" : "s"} →{" "}
              {breakdown.orderPoints.total > PLATFORM_TIER_BOUNDARY
                ? `6+ tier. One point fewer would price at the 1–${PLATFORM_TIER_BOUNDARY} tier.`
                : `1–${PLATFORM_TIER_BOUNDARY} tier. One more point moves this to the 6+ tier.`}
            </div>
          </div>
        ) : tier.status === "none_needed" ? (
          <p className={styles.sectionNote}>
            No platform fee yet — add hardware or a channel and the tier is selected automatically.
          </p>
        ) : tier.status === "food_truck" ? (
          <p className={styles.sectionNote}>
            {FOOD_TRUCK_PLATFORM_NAME} quoted, so the order-point tier isn&apos;t applied.
          </p>
        ) : (
          <div className={styles.error}>
            <strong>Platform fee missing.</strong> {breakdown.orderPoints.total} ordering points
            require &ldquo;{tier.tierName}&rdquo;, which isn&apos;t in the HubSpot catalog (renamed,
            archived, or the catalog didn&apos;t load). This quote can&apos;t be sent until that&apos;s
            fixed — sending it would quote no platform fee at all.
          </div>
        )}

        {breakdown.needsReview.map(r => (
          <div key={r.name} className={styles.reviewNote}>
            <strong>Needs review:</strong> {r.name} ×{r.qty} — {r.reason} Counted as 0 for now.
          </div>
        ))}
        {breakdown.unclassified.length > 0 && (
          <div className={styles.reviewNote}>
            <strong>Unclassified hardware:</strong>{" "}
            {breakdown.unclassified.map(u => `${u.name} ×${u.qty}`).join(", ")} — not in the
            ordering-point rules, counted as 0. Check before sending.
          </div>
        )}
      </div>

      {quoteLines.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Quote Totals</h2>
            <p className={styles.sectionNote}>
              Kept apart on purpose — one-time and recurring charges are different units and are
              never added together.
            </p>
          </div>
          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>Due once (hardware &amp; setup)</span>
            <span className={styles.totalValue}>{fmt$(totals.oneTime)}</span>
          </div>
          {totals.recurring.map(r => (
            <div key={r.frequency} className={styles.totalRow}>
              <span className={styles.totalLabel}>Recurring, per {fmtFrequency(r.frequency)}</span>
              <span className={styles.totalValue}>{fmt$(r.amount)}/{fmtFrequency(r.frequency)}</span>
            </div>
          ))}
          <div className={styles.totalRow} data-emphasis="true">
            <span className={styles.totalLabel}>All recurring, monthly equivalent</span>
            <span className={styles.totalValue}>{fmt$(totals.monthlyEquivalent)}/mo</span>
          </div>
        </div>
      )}
    </>
  );
}
