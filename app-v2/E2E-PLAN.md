# E2E Implementation Plan

Gap analysis of the current app against `E2E.md`, turned into phased work. Updated 2026-08-17
after three rounds of clarification:

1. **Statement upload stays, as a dual path.** Either the rep uploads the statement themselves
   and *then* sends the link (customer sees a prepared quote), or the rep sends the link with no
   statement and the customer uploads it (quote generated from their upload). Both paths converge
   on the same customer quote view.
2. **Admin portal needs a real identity.** Feedback: admins can't tell they're in an admin
   portal. Root cause is structural: `/admin` redirects to `/rep`, so admins see the rep UI with
   only minor additions (a Rep column, a Leads tab, extra Settings items).
3. **Billing = HubSpot subscriptions.** Investigated against the live HubSpot portal
   (244508708). Findings below materially change Phases C, E, and G.

---

## Verified findings from the live HubSpot portal

Checked directly against HubSpot on 2026-08-17 (product catalog, 91 subscriptions, 793 invoices).

### ⚠️ Platform fees bill WEEKLY, not monthly

This is the highest-impact finding and it contradicts the natural reading of the products export.
The catalog's `Unit price` is the **per-billing-cycle** price, and for the flagship platform
products that cycle is **weekly**:

| Product | Unit price | `recurringbillingfrequency` | Effective monthly |
| --- | --- | --- | --- |
| AIO Platform (1 to 5 Order Points) | $99 | **weekly** | ~$428.67 |
| AIO Platform (6 + Order Points) | $199 | **weekly** | ~$861.67 |
| AIO Platform - Food Truck | $75 | **weekly** | ~$325 |
| AIO Marketing Platform | $49 | **weekly** | ~$212 |
| Payroll - AIO Platform (Per Person) | $2 | **weekly** | ~$8.67 |
| AIO - Automated Review Manager | $39 | monthly | $39 |
| AIO Marketing Add Spend | $99 | monthly | $99 |

Confirmed four independent ways: the product's `recurringbillingfrequency`; the subscription's
`hs_recurring_billing_frequency`; `hs_mrr` equal to price × 52/12 (e.g. $99 → $428.67); and the
actual invoice stream — Crema Coffee has 17 invoices of exactly $99, one every Friday, 7 days
apart. Invoice due dates are ~1 day after issue.

**Consequence:** a quoting tool that renders "$99/month" is wrong by 4.33×. Every quote line must
carry its billing frequency, and the UI should show both the per-cycle charge and the
monthly-equivalent so reps and customers can compare against a statement's monthly figures.

*(Note: this contradicts the "subs generate monthly invoices" assumption — worth a sanity check
with whoever runs billing, but the invoice data is unambiguous.)*

### Subscriptions and invoices ARE creatable via API — the constraint is the payment method

*(Correction: an earlier draft of this plan claimed subscriptions and invoices were read-only.
That was wrong — it was based on the write access of the OAuth connection used to investigate,
not on the REST API's actual capability.)*

Both objects support creation, currently documented as BETA:

- `POST /crm/v3/objects/subscriptions` — needs `crm.objects.subscriptions.write`
- `POST /crm/v3/objects/invoices` — needs `crm.objects.invoices.write`

The documented subscription flow is: create line items → create the subscription → associate the
line items (`PUT /crm/v4/objects/subscriptions/{id}/associations/line_item/{lineItemId}`,
`associationTypeId: 301`) → `PATCH` `hs_invoice_creation: "on"` to make it billable → associate
the contact/company (typeId 295). Prerequisite: the account uses HubSpot payments or Stripe
(AIO uses HubSpot payments). Note the limitation that **line items belong to exactly one parent
object**, so subscription line items are separate instances from any deal or quote line items —
if we want both a CRM deal and a billing subscription, each needs its own set.

**The real constraint is the payment method, and it requires a hosted customer step.** There is
no API to attach raw bank details — HubSpot stores a payment method only after the buyer
authorizes one through a HubSpot-hosted checkout (payment link, invoice payment page, or quote
with payments enabled). HubSpot's docs: for a bank debit method, "a subscription record will be
created once the payment is authorized and submitted," and automatic charges use "the payment
method they originally purchased with, or … the stored payment method."

AIO's live subscriptions confirm exactly this shape:

| Property | Value on AIO's subscriptions |
| --- | --- |
| `hs_collection_process` | `automatic_payments` (all sampled) |
| `hs_invoice_creation` | `on` |
| `hs_payment_method` | `ACH - 1117`, `ACH - 3515`, … (bank debit, last 4) |
| `hs_payments_source_app_id` | **`quote`** (all sampled) |
| `hs_payment_method_source_at_creation` | **`checkout`** (all sampled) |

The one sampled subscription **without** an `hs_payment_method` is the one sitting at status
`unpaid` — confirmation that the ACH authorization is the load-bearing step, not the record
creation.

### …and the quote checkout is the vehicle that produces them

Every sampled subscription was born from a **quote** (`hs_payments_source_app_id: quote`) with the
payment method captured **at checkout**. That is not incidental — it's the only path that yields
AIO's auto-debit model. HubSpot's docs warn that for a seller-created subscription, "if a buyer
agrees to store their payment method when paying for the subscription you are setting up, the
future subscription charges won't be charged automatically"; automatic charging requires a method
stored *before* the subscription exists. API-creating a subscription and then asking for bank
details would therefore land in manual-collection territory rather than reproducing the weekly
auto-ACH that all 91 live subscriptions run on.

Quotes are creatable via API (`POST /crm/v3/objects/quotes`, `hs_template_type: CPQ_QUOTE`,
requiring line-item + contact + deal associations, published by setting `hs_status` to
`APPROVAL_NOT_NEEDED`/`APPROVED`). The properties that make the handoff work:

| Property | Role |
| --- | --- |
| `hs_billing_enabled` | "Enable billing to automatically create invoices and subscriptions" — the flag that makes the quote spawn the subscription |
| `hs_payment_enabled` | "Indicates if payment can be collected via the quote link" |
| `hs_store_payment_method_at_checkout` | stores the ACH method for future automatic charges |
| `hs_quote_link` | **the public hosted quote URL — the port-out target** |
| `hs_payment_status` / `hs_payment_date` | read back to detect completion |
| `hs_quote_auth_method` | buyer auth on the shared link |

So the architectural conclusion: **EasyOB owns quote building; HubSpot owns quote checkout.**
EasyOB creates the deal, line items, and a payment-and-billing-enabled quote, then redirects the
customer to `hs_quote_link` to enter bank details. HubSpot creates the subscription and its
weekly invoices itself. This reproduces the exact mechanism behind every existing AIO
subscription, and keeps the same posture as Adyen and Check — the partner collects the sensitive
credentials on their own page.

### Processing revenue does not flow through HubSpot billing

The two `AIO Payment Processing` products ("AIO Processing Two Tiered Rate", "AIO Tier
Processing") carry a **$0** unit price — they're placeholder line items, not billed amounts.
Processing margin is collected through Adyen (out of settlement); platform, hardware, and
services are billed through HubSpot. **AIO revenue has two separate sources**, which Phase G
must reconcile.

### The product catalog is the hardware catalog

37 products, already maintained in HubSpot, with a taxonomy in `hs_product_type`:
`inventory` (hardware, one-time), `Software` (recurring), `Service` (installation/training,
mostly one-time), `AIO Payment Processing` ($0 placeholders). This removes the need for an
EasyOB-side catalog table. Filtering to `hs_status = active` and excluding
"AIO Platform fee TEST - do not use" leaves **33 quotable products** — verified by running
`listProducts()` against the live portal.

**Catalog data hygiene (fix in HubSpot, not in code):**

- Four products carry **no `hs_product_type`** — "Customer Facing Display", "Small TV (32in to
  43in)", "TV Installation", "CAMP Invoice". They'd fall out of any type-grouped configurator.
  The first three are plainly hardware/hardware/service; set them. The configurator should still
  render an "Uncategorized" bucket rather than silently hiding untyped products.
- **"AIO Pre Auth" ($0.50, `Service`, one-time)** is really a per-transaction fee, so quoting it
  as a single $0.50 line is meaningless. Either exclude it from the picker or model it alongside
  the processing rate rather than as a quote line.
- Several names carry trailing whitespace ("POS Unit ", "Thermal Printer ") — `listProducts()`
  trims, but the underlying records are worth tidying.
- Decide which products reps may quote at all: "CAMP Invoice" and the $0 processing placeholders
  probably shouldn't appear in a rep-facing picker.

---

## Current state (what already matches E2E.md)

- Rep rate quoting with margin slider, server-side pillowed margins ✅
- Statement analysis via Claude (rep upload path `/rep/proposals/new` AND customer upload path
  `/lead/[token]`) ✅
- Customer account creation via magic link (`request-access` → `verify` → `set-password`) ✅
- Onboarding checklist framework (`getOnboardingModules`) with Adyen (in testing) and
  CheckHQ (sandbox) ✅
- Admin sees all accounts + tenant linkage (read-only HubSpot) ✅

## Gaps, phased

### Phase A — Quote flow spine (dual statement path + customer quote view + accept)

The single biggest reshape. Today the customer link *always* demands a statement upload before
showing anything, and there is no config-driven quote, no prepared-quote presentation, and no
explicit accept.

- **Quote config on the application.** Add `quoteConfig: { avgTicket, monthlyVolume } | null` to
  `MerchantApplication` (+ column in `merchant_applications`). These are the E2E.md "configs".
  When a statement analysis exists, its numbers take precedence; the config is the no-statement
  base and also what "quoted volume/ticket" is later compared against (Phase G).
- **Prospect form gains configs + optional statement.** `/rep/prospects/new` grows ticket-size and
  monthly-volume inputs and an *optional* statement upload (reusing the `/api/analyze` path). If
  the rep uploads, the analysis is attached before the link is ever sent.
- **Pricing without a statement.** A thin path in `pricing.ts` that derives a quote from
  `quoteConfig` (volume, ticket, default CP/CNP split) when `analysis` is null. Interchange
  assumptions come from the PRICING-QUESTIONS-FOR-STEVE answers — these are load-bearing here
  since there's no statement to anchor them.
- **Customer link branches.** `/lead/[token]`: if the application already has a quote (rep
  uploaded a statement or set configs) → render the quote view; else → today's upload flow, which
  on completion lands on the same quote view.
- **Customer quote view.** Token-gated page presenting the full quote (rate now; hardware and
  subscription lines once Phase C lands). Data crosses the boundary only as an extended
  `CustomerSafeQuote` — no margin, no cost, enforced server-side as today.
- **Explicit accept.** "Accept & create account" button on the quote view → records acceptance,
  advances stage, and flows into the existing magic-link account creation → checklist. New
  `DealStage` values: `quote_sent`, `quote_accepted`.

Verify: rep-upload path (statement → link → customer sees prepared quote → accept → account →
checklist) and customer-upload path (link → upload → quote → accept) both work end to end.

### Phase B — Admin portal identity (feedback-driven, independent, cheap — do early)

- **Stop redirecting `/admin` → `/rep`.** Give `/admin` its own dashboard: org-wide metrics
  (pipeline totals, per-rep breakdown, leads), then the all-accounts table. The rep view stays
  what a rep sees.
- **Unmistakable admin chrome.** Admin routes get a visibly distinct shell: an "Admin" badge in
  the nav (next to the wordmark and user name), a distinct accent/header treatment, and the nav
  sub-label reading "Admin Console" instead of "Rate Calculator".
- **Nav reflects the role.** Admin nav links: Dashboard (`/admin`), Accounts, Leads, Users,
  Settings (processors/tiers + margin padding) — instead of the rep nav plus a dropdown.
- Later phases hang admin-only views here (quoted-vs-actual, Phase G).

Verify: log in as admin → land on `/admin`, visibly admin-branded; log in as rep → unchanged.

### Phase C — Product & hardware quoting (sourced from HubSpot, not a local catalog)

Revised: the catalog already exists in HubSpot and is actively maintained there. Building a
parallel `hardware_items` table would immediately drift.

- **Read the catalog from HubSpot.** Extend `hubspot.ts` with `listProducts()` reading
  `name, price, hs_product_type, recurringbillingfrequency, hs_status`, filtered to active and
  excluding the TEST product. Cache it (it changes rarely) rather than fetching per page load.
- **Quote lines on the application.** `quoteLines: Array<{ hubspotProductId, name, qty,
  unitPrice, billingFrequency: "one_time" | "weekly" | "monthly" | …, productType }>`. **Snapshot
  price and frequency at quote time** — HubSpot's own model does the same (line items capture the
  product at time of sale and don't retroactively change).
- **Frequency-aware totals.** Compute three separate totals — one-time (hardware + install),
  recurring per-cycle, and normalized monthly-equivalent — and label them unambiguously. Do not
  sum across frequencies.
- **Rep configurator** grouped by `hs_product_type` (Hardware / Software / Service);
  **customer display** on the quote view (Phase A), showing rate + hardware + subscription
  together as E2E.md step 3's "full quote".

Verify: a quote containing AIO Platform (1-5) + a POS Unit renders "$99/week (~$429/mo)" and
"$749 one-time" as distinct lines, never added together.

### Phase D — Email the quote link (Resend)

- Verify a sending domain in Resend; replace `onboarding@resend.dev`; set `RESEND_API_KEY`.
- Auto-send a branded quote email from `createProspectAction` (and a "resend link" action on the
  account detail). Reuses `email.ts`; add a quote-link template alongside the magic-link one.

Verify: creating a prospect emails the customer; the copy-link UI remains as fallback.

### Phase E — Missing checklist modules

Additions to `getOnboardingModules` (the framework needs no redesign; `coming_soon` status
already exists for stubs).

**Billing (through HubSpot)** — now well-specified by the findings above. Same hosted posture as
Adyen and Check: EasyOB creates the records, the partner collects the payment credentials.

**The shape: EasyOB builds the quote, HubSpot takes the checkout.** EasyOB never sees bank
details; it hands the customer to HubSpot's hosted quote page and reads the result back.

> **Not a parallel copy — one quote, two audiences.** The tempting version is "EasyOB quotes, and
> also mirrors an identical quote into HubSpot so reps can see it." Don't build that: two records
> for one deal drift the moment anyone edits either side, and only one of them can be the thing
> the customer actually pays. Instead the **HubSpot quote is the billing vehicle**, and rep
> visibility comes free because it lives on the deal in the CRM. Create it early as a **draft** so
> reps see it while the deal is still being worked, then publish that same quote on acceptance to
> get the checkout link. HubSpot's own lifecycle (`draft` → `approval_not_needed`/`approved` →
> `accepted`) maps onto this exactly, and publishing updates the linked deal's amount and line
> items automatically.
>
> Sync is **one-way, EasyOB → HubSpot**, while the quote is a draft: the rep edits in EasyOB, and
> EasyOB patches the HubSpot quote and its line items on explicit save (not per keystroke). Once
> published, EasyOB stops editing and HubSpot becomes the source of truth — the customer may
> already have paid against it. Don't attempt bidirectional sync.
>
> **The processing rate can't be a line item.** The catalog's "AIO Processing Two Tiered Rate" is
> $0, because processing margin is collected via Adyen, not billed by HubSpot. So the quote's line
> items carry only what HubSpot actually bills (platform, hardware, services), and the quoted rate
> goes onto **deal properties** — which is what the existing `pushToHubSpot` stub already writes
> (`proposed_effective_rate`, `current_processor`, `current_monthly_fees`, …). Optionally include
> the $0 processing product as a line item so the quote document reads completely.
>
> **Reuse an existing deal when there is one.** Once Phase F lands, a merchant may arrive from a
> HubSpot Company that already has an open deal; attach the quote to it rather than creating a
> duplicate. Only create a deal when the application has no `hubspotDealId`.

1. On quote acceptance, EasyOB creates a **deal**, then **line items** from `quoteLines`
   (each carrying the product's own `hs_recurring_billing_period`/frequency — weekly for platform
   fees, one-time for hardware and installation, which can live on the same quote).
2. Creates a **quote** (`hs_template_type: CPQ_QUOTE`) with
   `hs_billing_enabled: true` (this is what makes HubSpot create the subscription),
   `hs_payment_enabled: true`, `hs_store_payment_method_at_checkout: true`, ACH among the allowed
   methods, and `hs_collection_process` matching today's `automatic_payments`. Associate line
   items, contact, and deal, then publish by setting `hs_status` to `APPROVAL_NOT_NEEDED`.
3. **Port out:** read `hs_quote_link` and send the customer there — the checklist module's CTA is
   a redirect to that URL, exactly like the Adyen and Check "continue" routes. The customer enters
   their bank details on HubSpot's page.
4. HubSpot creates the **subscription** (with the ACH method stored, so it auto-debits) and issues
   its invoices on its own cycle. EasyOB creates neither.
5. Status is derived by **reading back**: `hs_payment_status`/`hs_payment_date` on the quote, and
   once it exists, the subscription's `hs_status` (`scheduled` → authorized, awaiting first cycle;
   `active` → billing). Cache the snapshot on the application, mirroring `checkIds.onboardStatus`,
   so list views don't fan out one API call per account.
6. Store `hubspotIds: { dealId, quoteId, quoteLink, subscriptionId, status, statusAt }` alongside
   `adyenIds` / `checkIds`. Treat `hs_quote_link` as re-readable rather than permanently
   stored-and-reserved — re-fetch it if a stored one stops working, the same caution Adyen and
   Check links needed.

Note the quote link is a public URL — check `hs_quote_auth_method` so the setting matches how AIO
shares quotes today.

#### Who owns the quote, and keeping EasyOB in step

Authority **hands off at publish**, it isn't split:

| Phase | Source of truth | Direction |
| --- | --- | --- |
| Draft (rep still building) | **EasyOB** | EasyOB → HubSpot on save |
| Published onward (customer can pay; billing changes happen in the CRM) | **HubSpot** | HubSpot → EasyOB on sync |

So yes — once published, the live quote and everything downstream of it (subscription, invoices,
tier changes, pauses) live in HubSpot, because that's where AIO's billing operation actually runs.
EasyOB is the origination tool and thereafter a reader.

**The thing a sync must never do is overwrite `quoteLines`.** E2E.md's admin view asks for both
"what they are paying us" *and* "what we originally quoted them for" — those are two different
records, and a sync that refreshes the quote in place destroys the second one:

- `quoteLines` + `quoteConfig` — **frozen at publish.** What we quoted. Never touched by sync.
- `hubspotIds` + a billing snapshot (subscription status, MRR, invoice totals) — **refreshed.**
  What they're billed today.

The gap between them *is* the Phase G comparison, so keeping them separate is what makes that
view possible at all.

**Sync mechanism — nightly, plus on-view for the urgent case.** A nightly Vercel Cron route
(`/api/cron/hubspot-sync`) reconciles all accounts: quote payment status, subscription
status/MRR, invoice totals. Pull only what changed by filtering the search API on
`hs_lastmodifieddate` since the last run rather than fanning out one request per account — 91
subscriptions today, and this only grows.

Nightly alone isn't enough for one moment: the customer finishing checkout. If the onboarding
checklist still reads "pending" until the next morning, that generates support calls. Cover it the
way the codebase already covers Check — refresh that single record when it's viewed
(`getMyApplicationWithPayrollSyncAction` is the working precedent: re-read server-side by id,
skip if already terminal, swallow failures so a partner outage can't break the page). HubSpot
webhooks are the later upgrade if nightly + on-view proves too coarse; don't start there.

#### Private app scopes

Per HubSpot's Quotes API guide, publishing a quote **requires** `crm.objects.quotes.read/write`,
`crm.objects.deals.read`, `crm.objects.line_items.read/write`, and `crm.objects.contacts.read` —
a quote cannot be published without line-item, deal, **and contact** associations (type IDs 67,
64, 69; plus 702 for a signer if e-sign is on).

| Scope | Why |
| --- | --- |
| `crm.objects.quotes.read` / `.write` | create + publish the quote, read `hs_quote_link` |
| `crm.objects.deals.read` / `.write` | quotes must associate a deal; we create it |
| `crm.objects.line_items.read` / `.write` | the quote's goods and services |
| `crm.objects.contacts.read` / `.write` | **required association**; write to create the merchant contact when absent |
| `e-commerce` | **required by the Products API** — without it the catalog read fails |
| `crm.objects.subscriptions.read` | read back subscription status for the module |
| `crm.objects.invoices.read` | invoice history for the admin revenue view (Phase G) |
| `crm.objects.companies.read` | already used by the shipped tenant-linkage code (`searchTenantCompanies`) and Phase F |

Not needed: `crm.objects.subscriptions.write` and `crm.objects.invoices.write` (HubSpot creates
both from the quote checkout); all `crm.schemas.*.write`, which grant editing **property
definitions**, not records; and the `deals.sensitive` / `deals.highly_sensitive` scopes. Trim
those — this token lives in an env var in a web app, so least privilege matters.

**Resolved: two apps, two tokens.** Billing lives in its own private app, so `hubspot.ts` picks
headers per call — `HUBSPOT_PRIVATE_APP_TOKEN` for the general CRM app (companies behind tenant
linkage, deal sync) and `HUBSPOT_BILLING_PRIVATE_APP_TOKEN` for products, quotes, line items,
subscriptions and invoices. The split is the point: billing needs write scopes, and a single
shared token would hand those to the sync path too. The scope table above therefore applies to
the **billing** app; the general app only needs companies read plus its existing deal scopes.

**Schedule a demo** — HubSpot Meetings scheduler link/embed. Trivial; do first.

**Foodbuy** — no public API assumed; realistically an enrollment-interest form + internal handoff
(email/HubSpot task). Confirm scope. Ship as `coming_soon` until defined.

### Phase F — "Push to EasyOB" from HubSpot

- Deep link on the HubSpot Company record (custom property/CRM card) →
  `/rep/prospects/new?hubspotCompanyId={id}`.
- Prospect form prefills name/contact from the Company (read via existing `hubspot.ts` client)
  and stores the company id on the application from day one (today `tenantLink` is attached
  manually and late).
- Requires `HUBSPOT_PRIVATE_APP_TOKEN` actually configured (currently empty) with
  companies-read scope.

### Phase G — Actuals pipeline + quoted-vs-actual

Reprioritized: originally filed as "only matters post-go-live", but this is a first-class admin
requirement, not a trailing nice-to-have. It's also **independent of Phases A–E** — it reads live
Adyen and HubSpot data for merchants already processing, so it can be built in parallel with the
quoting work rather than queued behind it. The only real gate is having the reports scheduled and
a report user created in the Adyen Customer Area.

"What they're paying us" has **two sources** that must be combined.

#### Adyen actuals — monthly volume and average ticket per client

The admin ask ("what their actual size and volume is") reduces to gross volume and transaction
count per client per month; average ticket is volume ÷ count. Every client sits under **one shared
POS merchant account** and is distinguished by its **store** (`prod-{tenantNumber}`), so the store
is the attribution dimension.

**Source: the Aggregate Settlement Details Report.** It's summarized by merchant account, **store**,
payment method, and day of sale, and carries both totals and **transaction counts** — exactly the
two numbers needed, already aggregated. Roll day-of-sale up to calendar month.

Rejected alternatives, and why they'd be wrong here:

- *Transfers API per balance account* — amounts arriving in a merchant's balance account are
  **post-split (net of AIO's commission)**, so any average ticket derived from them is understated.
  Wrong basis for a customer-facing "your actual volume" number.
- *Transaction-level Settlement Details Report* — correct but heavy; the aggregate report already
  carries count and sum.
- *Aggregating `AUTHORISATION` webhooks ourselves* — means rebuilding refund/chargeback handling
  that settled reporting already accounts for. Settled data is also the honest basis for comparing
  against the merchant's own statement.

**Second source: the Balance Platform Accounting Report**, where splits appear as `platformPayment`
lines per balance account — that's AIO's own commission per client, i.e. the processing half of
"what they are paying us". (The HubSpot half comes from Phase E's sync.)

**Retrieval.** Schedule the reports in the Adyen Customer Area; Adyen then sends a
`REPORT_AVAILABLE` webhook whose `pspReference` is the filename and whose `reason` is the download
URL. Fetch it with a **Report Service user** credential (Merchant Report Download role — created
under Developers → API credentials, user type "Report user"), basic auth or API key, sending
`Accept-Encoding: gzip`. Reports are CSV.

**⚠️ Join on the store reference, not the stored store ID.** `applyTenantNumber` degrades to
handoff mode when the POS env config is absent, and accounts predating business-line capture have
their store created manually by the OB team — in both cases a store exists in Adyen while
`adyenIds.storeId` is null in EasyOB. The durable key is `prod-{tenantNumber}`. Stores in the
report that match no application should be **surfaced in the admin view, not silently dropped** —
those are accounts onboarded outside EasyOB, and quietly discarding them would make the totals
lie.

**Storage.** A `merchant_monthly_actuals` table keyed on (tenant number, month) holding gross
volume, transaction count, and AIO commission — aggregated at ingest rather than storing
transaction rows. Keep the upsert idempotent on that key so reprocessing a report is safe.

New env: `ADYEN_REPORT_USER` / `ADYEN_REPORT_PASSWORD` (or a report API key).

- **Processing revenue** = the commission column above, cross-checked against actual volume ×
  contracted margin (`proposal.proposedRates`, already stored) — a divergence there is itself a
  finding worth showing.
- **Platform/hardware revenue** — read from HubSpot: subscription `hs_mrr` for recurring, plus
  paid invoices for one-time hardware and services. No new pipeline needed — the Phase E nightly
  sync already collects this.
- **Admin comparison view** (in the Phase B admin portal): quoted volume/ticket (`quoteConfig` /
  statement analysis) vs. trailing actuals, variance %, and a combined revenue column broken out
  by source — E2E.md's "what they are paying us" and "how true were their reported numbers".

This view only works if the frozen-vs-synced split from Phase E holds: `quoteLines`/`quoteConfig`
are what we quoted and must never be overwritten by the sync, while the billing snapshot is what
they pay now. Comparing the two is the whole feature.

## Open decisions needed before the relevant phase

| Decision | Blocks |
| --- | --- |
| Confirm weekly billing is intended for all platform tiers (contradicts the "monthly invoices" assumption) | Phase C — every quote's headline number |
| Which products a rep may quote, and whether prices are ever overridable per deal | Phase C |
| Foodbuy scope (form + handoff vs. something deeper) | Phase E (Foodbuy module) |
| Whether EasyOB-created quotes should reuse AIO's existing quote template, and which quote owner/sender they carry | Phase E |
| Buyer authentication on the shared quote link (`hs_quote_auth_method`) — match however AIO shares quotes today | Phase E |
| Interchange/CP-split assumptions for statement-less quotes (PRICING-QUESTIONS follow-up) | Phase A pricing path |
| Resend sending domain | Phase D |
| Schedule the Aggregate Settlement Details + Balance Platform Accounting reports in the Adyen CA, and create a Report Service user | Phase G — nothing can be ingested until these exist |
| How to attribute stores created manually by the OB team (no `storeId` in EasyOB) — confirm `prod-{tenant}` is always the reference used | Phase G |
| HubSpot token provisioning + scopes (line items, deals, quotes write; subs/invoices read) | Phases E, F, G |
