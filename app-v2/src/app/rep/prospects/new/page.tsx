"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createProspectAction, getHubspotCompanyForProspectAction } from "@/lib/actions/prospects";
import { searchTenantCompaniesAction } from "@/lib/actions/applications";
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
} from "@/lib/quoting";
import { fmt$, fmtFrequency, fmtPct2, monthlyEquivalent } from "@/lib/utils";
import type { CatalogProduct, PricingModel, QuoteLine, StatementAnalysis } from "@/types/merchant";
import type { TenantCompany } from "@/lib/adapters/hubspot";
import styles from "./prospects-new.module.css";

const MODELS: PricingModel[] = ["flat-rate", "2-tier", "interchange-plus"];

// A recurring line always shows BOTH figures: the charge as it actually bills
// and the monthly equivalent. AIO's platform fees bill weekly, so "$99/mo" is
// wrong by 4.33x and "$99" alone is ambiguous.
function priceLabel(unitPrice: number, frequency: QuoteLine["billingFrequency"]) {
  if (frequency === "one_time") return `${fmt$(unitPrice)} one-time`;
  return `${fmt$(unitPrice)}/${fmtFrequency(frequency)} (~${fmt$(monthlyEquivalent(unitPrice, frequency))}/mo)`;
}

function NewProspectFlow() {
  const searchParams = useSearchParams();
  const hubspotCompanyId = searchParams.get("hubspotCompanyId");

  const [merchantName, setMerchantName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [avgTicket, setAvgTicket]       = useState("");
  const [monthlyVolume, setMonthlyVolume] = useState("");
  const [targetMargin, setTargetMargin] = useState(0.008);
  const [pricingModel, setPricingModel] = useState<PricingModel>("2-tier");
  const [linkUrl, setLinkUrl]           = useState<string | null>(null);
  const [linkWarning, setLinkWarning]   = useState<string | null>(null);
  const [copied, setCopied]             = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // Phase F — deep link from the HubSpot Company record. Fetched server-side
  // via the server action; failure here must never block the form, only show
  // a non-blocking notice, so it's kept separate from `error` (which blocks
  // submit).
  const [hubspotCompany, setHubspotCompany]   = useState<TenantCompany | null>(null);
  const [hubspotNotice, setHubspotNotice]     = useState<string | null>(null);

  useEffect(() => {
    if (!hubspotCompanyId) return;
    let cancelled = false;
    getHubspotCompanyForProspectAction(hubspotCompanyId)
      .then(res => {
        if (cancelled) return;
        if (res.company) {
          setHubspotCompany(res.company);
          setMerchantName(prev => prev || res.company!.name);
          if (res.company.email) setContactEmail(prev => prev || res.company!.email!);
        }
        if (res.error) setHubspotNotice(res.error);
      })
      .catch(e => { if (!cancelled) setHubspotNotice(e instanceof Error ? e.message : "Could not reach HubSpot"); });
    return () => { cancelled = true; };
  }, [hubspotCompanyId]);

  // HubSpot deprecated classic CRM cards, so there's no "start from HubSpot"
  // button anymore — the flow inverts: start here, find the company. This is
  // a second way to set the SAME `hubspotCompany` state the deep link sets;
  // everything downstream (prefill, badge, submit) is shared.
  const [hubspotQuery, setHubspotQuery]         = useState("");
  const [hubspotResults, setHubspotResults]     = useState<TenantCompany[]>([]);
  const [hubspotSearching, setHubspotSearching] = useState(false);
  const [hubspotSearchError, setHubspotSearchError] = useState<string | null>(null);

  useEffect(() => {
    const q = hubspotQuery.trim();
    if (q.length < 2) { setHubspotResults([]); setHubspotSearching(false); setHubspotSearchError(null); return; }
    setHubspotSearching(true);
    let cancelled = false;
    const t = setTimeout(() => {
      searchTenantCompaniesAction(q)
        .then(r => { if (!cancelled) { setHubspotResults(r); setHubspotSearchError(null); } })
        .catch(e => { if (!cancelled) { setHubspotResults([]); setHubspotSearchError(e instanceof Error ? e.message : "Could not reach HubSpot"); } })
        .finally(() => { if (!cancelled) setHubspotSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [hubspotQuery]);

  const selectHubspotCompany = (company: TenantCompany) => {
    setHubspotCompany(company);
    setMerchantName(prev => prev || company.name);
    if (company.email) setContactEmail(prev => prev || company.email!);
    setHubspotQuery("");
    setHubspotResults([]);
  };

  const clearHubspotCompany = () => {
    setHubspotCompany(null);
    setHubspotNotice(null);
  };

  // Optional statement upload — the rep path through the same /api/analyze
  // route the proposal wizard uses. When it succeeds the analysis rides along
  // on the application, so the customer opens the link to a prepared quote.
  const [file, setFile]             = useState<File | null>(null);
  const [analysis, setAnalysis]     = useState<StatementAnalysis | null>(null);
  const [analyzing, setAnalyzing]   = useState(false);
  const [dragOver, setDragOver]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Product configurator. The catalog is read from HubSpot server-side and
  // cached there, so this is one call per mount, not one per keystroke.
  const [catalog, setCatalog]         = useState<CatalogProduct[]>([]);
  const [fullCatalog, setFullCatalog] = useState<CatalogProduct[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [qty, setQty]                 = useState<Record<string, number>>({});
  const [channels, setChannels]       = useState<string[]>([]);

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
  // This is a PREVIEW. The same derivation runs again server-side inside
  // createProspectAction, against the live catalog, and that result is what
  // gets persisted — the browser only ever sends the picks.
  const pickedLines = useMemo(
    () => catalog.filter(p => (qty[p.hubspotProductId] ?? 0) > 0).map(p => toQuoteLine(p, qty[p.hubspotProductId])),
    [catalog, qty]
  );
  const breakdown = useMemo(() => deriveOrderPoints(pickedLines, channels), [pickedLines, channels]);
  const tier      = useMemo(
    () => resolvePlatformTier(breakdown.orderPoints.total, fullCatalog, pickedLines),
    [breakdown.orderPoints.total, fullCatalog, pickedLines]
  );
  const tierLine   = tier.line;
  const quoteLines = useMemo(() => (tierLine ? [tierLine, ...pickedLines] : pickedLines), [tierLine, pickedLines]);
  const totals     = useMemo(() => quoteTotals(quoteLines), [quoteLines]);
  // A tier is owed but the catalog didn't yield it: the biggest recurring line
  // on the quote would go missing. Blocks the save rather than quietly
  // shipping a tier-less quote — the server refuses it too.
  const tierUnresolved = tier.status === "unresolved";

  const setQtyFor = (id: string, next: number) =>
    setQty(prev => ({ ...prev, [id]: Math.max(0, next) }));

  const toggleChannel = (id: string) =>
    setChannels(prev => (prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]));

  const handleFile = (f: File) => {
    setFile(f);
    setAnalysis(null);
    setError(null);
    setAnalyzing(true);
    const r = new FileReader();
    r.onload = async e => {
      try {
        const fileData = (e.target!.result as string).split(",")[1];
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileData, mediaType: f.type }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Analysis failed");
        setAnalysis(data.analysis as StatementAnalysis);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Analysis failed");
        setFile(null);
      }
      setAnalyzing(false);
    };
    r.readAsDataURL(f);
  };

  const submit = async () => {
    if (!merchantName || !contactEmail) {
      setError("Business name and contact email are required.");
      return;
    }
    const ticket = parseFloat(avgTicket) || 0;
    const volume = parseFloat(monthlyVolume) || 0;
    if ((ticket > 0) !== (volume > 0)) {
      setError("Enter both average ticket and monthly volume, or neither.");
      return;
    }
    if (tier.status === "unresolved") {
      setError(`This quote needs the "${tier.tierName}" platform product, which isn't in the HubSpot catalog. Fix the catalog before sending it.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { linkUrl, warning } = await createProspectAction({
        merchantName, contactEmail, targetMargin, pricingModel,
        quoteConfig: ticket > 0 && volume > 0 ? { avgTicket: ticket, monthlyVolume: volume } : null,
        analysis,
        // Only the picks cross the wire — prices and the tier are re-derived
        // server-side against the live catalog.
        picks: pickedLines.map(l => ({ hubspotProductId: l.hubspotProductId, qty: l.qty })),
        channels,
        hubspotCompanyId: hubspotCompany?.id ?? null,
      });
      setLinkUrl(linkUrl);
      setLinkWarning(warning);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create prospect");
    }
    setSaving(false);
  };

  const reset = () => {
    setMerchantName(""); setContactEmail(""); setTargetMargin(0.008); setPricingModel("2-tier");
    setAvgTicket(""); setMonthlyVolume(""); setFile(null); setAnalysis(null);
    setQty({}); setChannels([]);
    setLinkUrl(null); setLinkWarning(null); setCopied(false); setError(null);
    setHubspotCompany(null); setHubspotNotice(null);
    setHubspotQuery(""); setHubspotResults([]); setHubspotSearchError(null);
  };

  // Matches the server's gate (hasQuoteBasis): a statement with no readable
  // volume is not a quote, so don't promise the customer one.
  const hasQuote =
    (analysis?.totalVolume ?? 0) > 0 || (parseFloat(avgTicket) > 0 && parseFloat(monthlyVolume) > 0);

  if (linkUrl) {
    return (
      <div className={styles.successWrap}>
        <div className={styles.successMark}>✓</div>
        <h1 className={styles.successTitle}>Prospect Created</h1>
        <p className={styles.successBody}>
          {hasQuote ? (
            <>
              Share this link with <strong>{merchantName}</strong> — their quote is already
              prepared, so they see it the moment they open it.
            </>
          ) : (
            <>
              Share this link with <strong>{merchantName}</strong> — they&apos;ll upload their own
              statement and get an instant quote, no account needed.
            </>
          )}
        </p>
        {linkWarning && <div className={styles.error}>{linkWarning}</div>}
        <div className={`${styles.panel} ${styles.linkRow}`}>
          <code className={styles.linkCode}>{linkUrl}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(linkUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className={styles.btnCopy}
            data-copied={copied}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <button onClick={reset} className={styles.btnGhost}>
          Create Another
        </button>
      </div>
    );
  }

  return (
    <div className={styles.main}>
      <h1 className={styles.headerTitle}>Send Customer a Quote Link</h1>
      <p className={styles.headerSubtitle}>
        Set a margin target, then either prepare the quote yourself — with their ticket size and volume,
        or their statement — or send the link bare and let them upload it. Either way they see a quote at
        exactly this margin, with no cost breakdown and no account required.
      </p>

      {hubspotCompany && (
        <p className={styles.hubspotBadge}>
          Linked to HubSpot company: <strong>{hubspotCompany.name}</strong> ({hubspotCompany.id})
          <button type="button" className={styles.hubspotBadgeClear} onClick={clearHubspotCompany} aria-label="Remove HubSpot link">
            ×
          </button>
        </p>
      )}
      {!hubspotCompany && hubspotNotice && (
        <div className={styles.error}>
          Couldn&apos;t load the linked HubSpot company ({hubspotNotice}) — continuing unlinked.
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.field}>
          <label className={styles.label}>Business Name</label>
          <input value={merchantName} onChange={e => setMerchantName(e.target.value)} placeholder="Joe's Pizza" className={styles.input} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Customer Contact Email</label>
          <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="owner@business.com" className={styles.input} />
        </div>

        {!hubspotCompany && (
          <div className={styles.field}>
            <label className={styles.label}>Link HubSpot Company (optional)</label>
            <input
              type="search"
              value={hubspotQuery}
              onChange={e => setHubspotQuery(e.target.value)}
              placeholder="Search HubSpot companies…"
              className={styles.input}
            />
            {hubspotSearchError && (
              <div className={styles.error}>
                Couldn&apos;t search HubSpot ({hubspotSearchError}) — you can still send this quote unlinked.
              </div>
            )}
            {!hubspotSearchError && hubspotQuery.trim().length >= 2 && (
              <div className={styles.hubspotResults}>
                {hubspotSearching && <div className={styles.hubspotResultMeta}>Searching…</div>}
                {!hubspotSearching && hubspotResults.length === 0 && (
                  <div className={styles.hubspotResultMeta}>No matching companies.</div>
                )}
                {hubspotResults.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={styles.hubspotResultRow}
                    onClick={() => selectHubspotCompany(c)}
                  >
                    <span className={styles.hubspotResultName}>{c.name}</span>
                    <span className={styles.hubspotResultMeta}>{c.id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Prepare the Quote (optional)</h2>
          <p className={styles.sectionNote}>
            Give us either the numbers or the statement and the customer opens the link straight to their
            quote. Leave both blank and they&apos;ll be asked to upload a statement first.
          </p>
        </div>

        <div className={styles.configRow}>
          <div className={styles.field}>
            <label className={styles.label}>Average Ticket</label>
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={avgTicket} onChange={e => setAvgTicket(e.target.value)}
              placeholder="35.00" className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Monthly Volume</label>
            <input
              type="number" min="0" step="100" inputMode="decimal"
              value={monthlyVolume} onChange={e => setMonthlyVolume(e.target.value)}
              placeholder="100000" className={styles.input}
            />
          </div>
        </div>

        <label className={styles.label}>Statement (optional — overrides the numbers above)</label>
        <div
          className={styles.dropzone}
          data-state={analyzing ? "busy" : analysis ? "done" : dragOver ? "dragging" : undefined}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => { if (!analyzing) fileRef.current?.click(); }}
        >
          <input
            ref={fileRef} type="file" accept=".pdf,image/*" className={styles.fileInput}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {analyzing ? (
            <p className={styles.dropzoneTitle}>Analyzing {file?.name}…</p>
          ) : analysis ? (
            <>
              <p className={styles.dropzoneTitle} data-state="done">✓ {file?.name}</p>
              <p className={styles.dropzoneSubtitle}>
                {analysis.merchantName || "Statement"} · read successfully · click to replace
              </p>
            </>
          ) : (
            <>
              <p className={styles.dropzoneTitle}>Drop their statement here or click to browse</p>
              <p className={styles.dropzoneSubtitle}>PDF or image · any processor format</p>
            </>
          )}
        </div>
      </div>

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
              const n = qty[p.hubspotProductId] ?? 0;
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

      <div className={styles.panel}>
        <label className={styles.label}>Pricing Model</label>
        <div className={styles.modelRow}>
          {MODELS.map(m => (
            <button key={m} onClick={() => setPricingModel(m)} className={styles.modelPill} data-active={pricingModel === m}>
              {m.replace("-", " ")}
            </button>
          ))}
        </div>
        <div className={styles.marginRow}>
          <span className={styles.marginLabel}>Margin Target</span>
          <span className={styles.marginValue}>{fmtPct2(targetMargin)}</span>
        </div>
        <input
          type="range" min="0.001" max="0.04" step="0.0005"
          value={targetMargin}
          onChange={e => setTargetMargin(parseFloat(e.target.value))}
        />
      </div>

      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      <button onClick={submit} disabled={saving || analyzing || tierUnresolved} className={styles.btnPrimary}>
        {saving ? "Creating…" : hasQuote ? "Create Quote Link →" : "Create Link →"}
      </button>
    </div>
  );
}

export default function NewProspectPage() {
  return (
    <Suspense>
      <NewProspectFlow />
    </Suspense>
  );
}
