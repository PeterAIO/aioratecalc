# Phase E — O-4: how a paid quote links to its subscription, and whether a live payment test is needed

**Verdict: NO PAYMENT TEST IS NEEDED. O-4 is answered from existing production data.**

The quote → subscription linkage is **HubSpot v4 association `associationTypeId` 304**, verified
against **45 of the 46** paid quotes in the live portal (the 46th had no recurring line items, so had
nothing to make a subscription from). Details in §1. The investigation also turned up a **defect in
the spec's status matrix** (§1.5) and closed **O-3, O-5, O-15, O-17** and half of **O-1** for free
(§1.8).

Because the answer is already in production data, the recommendation is to **close O-4 and skip the
payment entirely** (§2.1). A separate, **$0**, already-planned publish-only run remains (§2.2).
§3 documents the payment procedure anyway, for completeness — and notes that **a test company is not
a sandbox** (§3.0): it changes whose record is touched, not what is reversible. §4 establishes that
there is **no non-real-money way** to do this at all.

Companion to `PHASE-E-SPEC.md` (open question **O-4**, §4, §7.2, §8) and `E2E-PLAN.md:476-483`.

Everything below is labelled by provenance:

- **VERIFIED** — read directly from the live HubSpot portal (account `244508708`) on **2026-08-20**,
  read-only, via `HUBSPOT_BILLING_PRIVATE_APP_TOKEN`. Only `GET`s and `/search` (read-only `POST`)
  were issued. **No object was created, modified, published, voided, deleted or paid.** The probe
  scripts were throwaway `scripts/_tmp-o4-probe*.ts` files loading config through `loadEnvConfig`
  (the `E2E-PLAN.md:73-83` convention) and have been deleted.
- **DOCUMENTED** — HubSpot's own docs, with URL.
- **INFERRED** — my reading, not stated anywhere. Treat as a guess.

---

## 1. The answer to O-4

### 1.1 The linkage

**VERIFIED.** A paid quote is joined to the subscription HubSpot created from its checkout by a
**HUBSPOT_DEFINED v4 association, `associationTypeId` 304 (quote → subscription)**, reverse **303
(subscription → quote)**. There is no property-based join and no need to go via the deal.

```
GET /crm/v4/objects/quotes/{quoteId}/associations/subscriptions
  → results[].toObjectId               = subscription id
  → results[].associationTypes[].typeId = 304   (HUBSPOT_DEFINED, unlabeled)

GET /crm/v4/objects/subscriptions/{subId}/associations/quotes
  → typeId 303
```

Confirmed against the label registry and against real records:

| Pair | typeId | Label |
| --- | --- | --- |
| quote → subscription | **304** | — |
| subscription → quote | **303** | — |
| subscription → deal | **299** | — |
| deal → subscription | **300** | — |
| subscription → contact | 295 | — |
| subscription → company | 297 | — |
| subscription → invoice | 623 | — |
| invoice → subscription | 622 | — |
| subscription → line item | 301 / 564 | "Current Line Item" / "Upcoming Line Item" |
| quote → invoice | 408 | — |
| quote → payment | 398 | — |
| subscription → payment | 394 | — |
| **deal → company** | **341** / **5** | — / "Primary" |
| **deal → contact** | **3** | — |

The last two rows also close **O-17** (`PHASE-E-SPEC.md:796`) — no separate probe needed.

### 1.2 Evidence base

**VERIFIED.** 46 quotes in the portal have `hs_payment_status = PAID`.

- **45 of 46** carry at least one subscription via association 304.
- The 1 exception (`303941810923`, "The Healthy Spot - Stockton - New Deal", `hs_quote_amount` $0.50,
  `hs_tcv` $0.50) has **no recurring line items at all**, so there was nothing for HubSpot to turn
  into a subscription. That is not a broken linkage; it is a quote with only one-time charges.
- Every quote-born subscription reads `hs_payments_source_app_id: quote`,
  `hs_payment_method_source_at_creation: checkout`, `hs_object_source: PAYMENTS`,
  `hs_collection_process: automatic_payments`, `hs_invoice_creation: on`, and a populated
  `hs_payment_method` (`"ACH - 1117"`, `"ACH - 3515"`, …).
- Negative control found in the data: subscription `830633855731` has
  `hs_payments_source_app_id: billing`, `hs_payment_method_source_at_creation: first_invoice`,
  `hs_payment_method: null`, `hs_status: unpaid`, and **no quote association** — i.e. a subscription
  created by hand in the billing tool rather than by a quote checkout. The 304 association is
  therefore specific to the checkout path, not incidental.

Portal-wide subscription provenance (`hs_payments_source_app_id`, 91 subscriptions):
`quote` **49** · `billing` **30** · `sales_checkout` **12** · `migration` 0 · `test` **0**.

### 1.3 A quote can produce MORE THAN ONE subscription — the spec's signature is wrong

**VERIFIED.** Two paid quotes produced **two** subscriptions each, split by billing frequency:

| Quote | Subscriptions | Frequencies |
| --- | --- | --- |
| `319507926725` ("Franko & Friends") | `831465970381`, `831524603624` | weekly, monthly |
| `319505053431` | `822642025203`, `822671680201` | weekly, monthly |

**INFERRED** (consistent with all 47 observed subscriptions, not documented): HubSpot creates **one
subscription per distinct `recurringbillingfrequency`** on the quote. AIO's catalog mixes weekly
platform/payroll lines with monthly add-ons (`E2E-PLAN.md:193-201`), so a mixed quote will routinely
produce two.

**Consequence for `PHASE-E-SPEC.md:241`:**

```ts
// WRONG — cannot represent a mixed-frequency quote
export async function findSubscriptionForDeal(dealId: string): Promise<SubscriptionSnapshot | null>;
```

Replace with a quote-keyed, plural read:

```ts
/** Subscriptions HubSpot created from this quote's checkout, via association 304. */
export async function findSubscriptionsForQuote(quoteId: string): Promise<SubscriptionSnapshot[]>;
```

and make `HubspotIds` hold `subscriptionIds: string[] | null` plus a rolled-up
`subscriptionStatus` (see §1.6), not the single `subscriptionId` / `subscriptionStatus` pair at
`PHASE-E-SPEC.md:418-421`. Keying on the **quote** rather than the deal is also strictly better:
`E2E-PLAN.md:442-444` anticipates reusing a pre-existing deal, and a reused deal can carry
subscriptions from earlier quotes — "deal-associated subscriptions, newest wins", the fallback
assumption recorded at `PHASE-E-SPEC.md:793`, would attach the wrong one. Association 304 has no
such ambiguity.

### 1.4 `hs_payment_status` values, and which one means paid

**VERIFIED** (property definition, `GET /crm/v3/properties/quotes/hs_payment_status`):

```
hs_payment_status  enumeration / calculation_equation
  options: PENDING | PROCESSING | PAID | PAYMENT_NOT_ENABLED
  calculated: true
  modificationMetadata: { readOnlyValue: true }
```

`PAID` is the paid state. `readOnlyValue: true` confirms it can never be written — no "mark as paid"
via this property.

Distribution across the 129 `hs_status: ACCEPTED` quotes: `PAID` 46, `PENDING` 56,
`PAYMENT_NOT_ENABLED` 27. `PROCESSING` was not observed on any record (**INFERRED**: it is a
short-lived state between authorization and settlement, or is card-only).

### 1.5 ⚠️ The ordering is the opposite of what the spec assumes — this is the biggest finding

**VERIFIED.** The subscription exists **days before** the quote flips to `PAID`.

- Subscription `hs_createdate` lands within **~1–9 minutes** of the buyer completing checkout
  (measured against `hs_accepted_date` for the quotes where signing and paying happened in one
  sitting: 0.02 h – 0.15 h, median ~2 min).
- Quote `hs_payment_date` / `hs_payment_status: PAID` lands **median 5.70 days later**
  (n = 47 quote/subscription pairs: min ≈ 0, p25 **5.58 d**, median **5.70 d**, p75 **5.91 d**,
  max **6.71 d**).
- `hs_payment_date` clusters hard at 12:00–13:00 UTC (24 records at hour 12, 13 at hour 13) — a daily
  ACH settlement batch, not a real-time signal. **DOCUMENTED** corroboration: bank-debit settlement
  is 5–10 business days (https://knowledge.hubspot.com/payments/manage-payments).

Worked example (`320752211680`, "Shinka"): quote created 2026-08-05 · e-signed 2026-08-11T17:27 ·
subscription `832030411508` created 2026-08-14T22:02 · `hs_payment_status: PAID` /
`hs_payment_date` 2026-08-20T12:22. Six days between the customer being done and the quote saying so.

**What this breaks.** `PHASE-E-SPEC.md:626-630` gates the Billing module on `hs_payment_status`:

| Spec condition | What the customer would actually see |
| --- | --- |
| `paymentStatus ∈ {null, PENDING}` → `in_progress`, CTA "Review & Pay" | **For ~6 days after they already paid.** They are invited to pay again. |
| `paymentStatus = PAID` → `complete` | Only after the ACH batch clears. |

The on-view refresh (`PHASE-E-SPEC.md:704-731`) cannot fix this, because there is nothing stale to
refresh — the quote genuinely is not `PAID` yet. This is precisely the support-call scenario
`E2E-PLAN.md:536-541` set out to avoid, and the spec as written walks into it.

**Recommended fix (design change, no test required).** Derive `billingModule` completion from the
**subscription**, not the quote's payment status:

| Condition (cached snapshot) | status | CTA |
| --- | --- | --- |
| no `quoteId`, or `publishedAt` null | `not_started` | none |
| published, no subscription, `paymentStatus ∈ {null, PENDING, PROCESSING}` | `in_progress` | "Review & Pay" |
| ≥1 subscription with a non-null `hs_payment_method` | **`complete`** | none — "Billing is set up. Your first charge is scheduled for {hs_recurring_billing_start_date}." |
| subscription `hs_status = active` | `complete` | none — "Billing is active." |
| `paymentStatus = PAID` but zero subscriptions | `complete` | none — one-time-charge-only quote (the `303941810923` case) |
| `paymentStatus = PAYMENT_NOT_ENABLED` | `in_progress` + `console.error` | none — build defect, as the spec already says |

`hs_payment_status: PAID` stays worth caching (it is the "the money actually moved" signal, and Phase
G will want it) but it must not be the completion gate.

**Do NOT use `hs_status: ACCEPTED` as the completion gate either.** **VERIFIED:** of 129 `ACCEPTED`
quotes, **52 are `ACCEPTED` + `PENDING` + zero subscriptions** — merchants who e-signed and then
never completed the payment step (`hs_quote_esign_status: SIGNED`, no `hs_payment_method` anywhere).
`ACCEPTED` means *signed*, not *paid*. Examples: `322225252083` (Seecha, $99.50, signed 2026-08-13,
still no subscription), `321900432079` ("TEST COMPANY / Deal-2", $3,607.50, signed 2026-08-12,
no subscription).

### 1.6 Which subscription property to cache

**VERIFIED** (`GET /crm/v3/properties/subscriptions`). `hs_status` options:
`active | past_due | unpaid | canceled | expired | scheduled | paused`. Portal distribution today:
`active` 28 · `paused` 16 · `canceled` 19 · `unpaid` 15 · `scheduled` 12 · `expired` 1 · `past_due` 0.

Cache, per subscription:

| Property | Why |
| --- | --- |
| `hs_status` | the module gate. Note **`paused` and `canceled` are common here** (35 of 91) — real billing-ops states, so the module must render them, not fall through to a default |
| `hs_payment_method` | e.g. `"ACH - 1117"`. **Non-null is the "the buyer authorized at checkout" proof** (§1.5) |
| `hs_recurring_billing_frequency` | `weekly` vs `monthly` — the thing that splits one quote into two subscriptions |
| `hs_recurring_billing_start_date` | what to tell the customer ("first charge on …"). Can be up to 60 days out — see §3.3 |
| `hs_mrr` | HubSpot's own weekly × 52/12 figure; keeps EasyOB from re-deriving it |
| `hs_next_payment_due_date`, `hs_last_payment_status`, `hs_number_of_completed_payments`, `hs_total_collected_amount` | Phase G quoted-vs-actual. `hs_last_payment_status` options: `succeeded \| failed \| partially_refunded \| refunded \| processing` |

Roll-up rule for a single `subscriptionStatus` on the application (**INFERRED**, a presentation
choice): worst-of, ordered `canceled > unpaid > past_due > paused > expired > scheduled > active`, so
one broken subscription on a mixed-frequency quote cannot be hidden by a healthy sibling.

### 1.7 Immediate or eventually consistent? Both — poll, don't rely on read-after-write

**VERIFIED.** Two different clocks:

| Signal | Latency after the customer finishes checkout |
| --- | --- |
| subscription created + association 304 present | **~1–9 minutes** |
| quote `hs_payment_status: PAID`, `hs_payment_date` | **~5.6–6.0 days** (daily ~12:00 UTC batch) |

So the spec's two-mechanism design (nightly cron + on-view refresh,
`PHASE-E-SPEC.md:677-731`) is right, with two adjustments:

1. **The on-view refresh is the load-bearing one for the customer**, because the subscription appears
   within minutes. Keep the 60-second TTL. Its no-op condition
   (`PHASE-E-SPEC.md:718`, "returns immediately unless `publishedAt` is set and
   (`paymentStatus !== "PAID"` or `subscriptionId` is null)") happens to be correct for this ordering
   — but restate it as "…unless `publishedAt` is set and (no subscription is cached, or every cached
   subscription is `scheduled`, or `paymentStatus !== PAID`)".
2. **The nightly cron's 3-day stateless window (`PHASE-E-SPEC.md:693-697`) is too short.** ACH
   settlement takes 5.6–6.0 days, so a quote's flip to `PAID` can land more than 3 days after the last
   thing that touched it. Widen `LOOKBACK_DAYS` to **10** for the quote sweep. Cost is negligible:
   **VERIFIED** — `hs_lastmodifieddate >= now-3d` on subscriptions returns **17** records portal-wide,
   so a 10-day window is still one or two pages.
   Both `hs_lastmodifieddate` and, unusually, the *calculated* `hs_payment_status` are filterable in
   the Search API (**VERIFIED** — `hs_payment_status EQ PAID` returned `total: 46`), which gives the
   cron a cheap exact query rather than a scan.

### 1.8 Free answers to other open questions, collected on the way

| Q | Answer (**VERIFIED**) |
| --- | --- |
| **O-3** — the ACH payment-method property | **`hs_allowed_payment_methods`**, `enumeration/checkbox`, options `ACH \| CREDIT_OR_DEBIT_CARD \| SEPA \| BACS \| PADS`. Live value on all 46 paid quotes: **`ACH`**. A sibling `hs_allowed_commerce_payment_methods` also reads `ACH` (its schema options list is empty); **INFERRED** it is derived — write `hs_allowed_payment_methods` only |
| **O-15** — HubSpot Payments or Stripe? | **Stripe, via HubSpot's "bring your own Stripe" integration.** `hs_payment_type: BYO_STRIPE` on **46/46** paid quotes; enum is `HUBSPOT \| STRIPE \| BYO_STRIPE`. No longer a doubt — it is settled fact, and it is what makes §2 expensive |
| **O-1** — `hs_sender_email` | It is the **deal's rep**, per-quote, not a shared mailbox: `joe@`, `brian@`, `elizabeth.phillips@`, `shomik@`, `omar@`, `bilal@`, `cole.davis@`, `loni@`, `jason@`, `jp@`, `ryan@`, `kyle@`, `sean@` `aioapp.com`. **Recommendation:** send the owning rep's `users.email`. Still needs Steve's sign-off on the *template* half of O-1 |
| **O-5** — the real pipeline | Two deal pipelines. `default` = **"Sales "**, 19 stages: `3262845631` Sales Accepted · `appointmentscheduled` Appointment Scheduled · `2717103849` Discovery Meeting · `stage_0` Demo Meeting · `3634617027` Quote Sent · `3891166952` Signing Delayed · `3814929108` Signed Awaiting Features · `2767738593` Signed/Awaiting Payment Info · `closedwon` · `2992070353` Onboarding · `3888148172` Onboarding Delayed · `2986384064` Configuration · `2986384063` Deployment/Training · `3888148173` Deployment/Training Delayed · `3888148174` Non-Start · `3452539597` Deal Active · `3060460231` Cancelled Before Live · `3069369052` Churned · `closedlost`. Second pipeline `2329370331` "Onboarding" = Stage 1–7 |
| **`pushToHubSpot` is broken a second, independent way** | `STAGE_MAP` (`src/lib/adapters/hubspot.ts:8-20`) maps to `qualifiedtobuy`, `presentationscheduled`, `decisionmakerboughtin`, `contractsent` — **none of these exist in this portal**. Only `appointmentscheduled`, `closedwon`, `closedlost` are real stage ids. So even after `PHASE-E-SPEC.md` §5.2's phantom-property filter lands, 8 of the 11 mapped stages would still 400 on an invalid `dealstage` enum value. §5.2 item 2 must be done *with* the ids above, not after |
| **O-8** — does expiry kill the link? | **No, not for an already-accepted quote.** `320752211680` has `hs_expiration_date` 2026-08-12, `hs_expired: false`, and took payment on **2026-08-20** — 8 days past expiry. `320525591262`: expiry 2026-08-15, paid 2026-08-19. **INFERRED**: expiry gates *acceptance*, not post-acceptance settlement. Whether an unaccepted expired link still resolves is still unknown |
| Quote-link shape | `hs_domain` is **`customers.aioapp.com`** on every quote; `hs_quote_link` = `https://customers.aioapp.com/{hs_slug}`. `hs_quote_auth_method: public_access` throughout, confirming `PHASE-E-SPEC.md:637-668` — re-servable, not one-time-use |
| Scope gap | Payment objects (`0-101`) **403** for the billing token: *"requires one of [commerce-payments-read, commerce-payments-access]"* / `crm.schemas.commercepayments.read`. EasyOB can see the quote→payment association **ids** (398) but cannot read the payment records. Phase E does not need them; **Phase G's revenue view might**, so log it now rather than discovering it later |

### 1.9 What is still NOT established, and what it would take

| Unknown | Why it is not worth a live payment |
| --- | --- |
| The exact HubSpot-side sequence between "buyer clicks Pay" and "subscription exists" | We can measure the outcome (§1.5) but not observe the intermediate `PROCESSING` state. Nothing in EasyOB branches on it |
| Whether `PROCESSING` ever appears on an ACH quote | Zero records in the portal carry it. **Design defensively**: treat any unrecognised `hs_payment_status` as `in_progress` |
| Whether a **draft** quote's predictable slug already resolves (**O-10**) | A read-only question about a URL, not a payment. The spec's answer — never surface `quoteLink` while `publishedAt` is null — is correct regardless |
| Whether HubSpot ever rotates a slug | Not observable without waiting. Self-heals via §8.1's nightly re-read |
| Whether an EasyOB-*API*-created quote behaves identically to a UI-created one at checkout | This is the only genuine residual risk, and it is a **publish** question, not a **payment** question. See §2.1 |

---

## 2. Do we still need any live write at all?

Two separable questions, and they have different answers.

### 2.1 The payment half: **NO.** Do not pay anything.

O-4's every sub-question is answered above from 46 real paid quotes. A live payment would tell us
nothing we do not already know, and it would cost real money and leave permanent records (§3).

**Recommendation: close O-4 as resolved. Delete the "Checkout to `PAID` and subscription creation"
row from `PHASE-E-SPEC.md:778`'s table and the payment half of step 12
(`PHASE-E-SPEC.md:836`).** The spec's own instinct — *"Verify the read-back path against an existing
paid subscription instead of manufacturing one"* — was right; this document is that verification,
performed.

The existence of a sanctioned test company does not change this. It lowers the *cost* of a test; it
does not create a *reason* for one. The single thing a live payment would add over §1 is confirmation
that an **API-created** quote's checkout behaves like the 46 **UI-created** ones — and if that is
worth buying, buy it as part of §2.2's $0 publish run plus a later real customer, not by paying a
test quote.

### 2.2 The publish half: still one **unpaid** live write, already scoped by the spec

`PHASE-E-SPEC.md:777` and step 12 already call for one human-run *create → associate → publish →
read `hs_quote_link`* run against a throwaway deal. That is unchanged and unaffected by this
document. It costs **$0** and creates no payment. Its blast radius:

- **DOCUMENTED** — a published quote can be **voided in the HubSpot UI** on draft, published or
  expired quotes; "the quote will remain in your account but can't be edited. The quote link URL will
  be deactivated" (https://knowledge.hubspot.com/quotes/manage-quotes).
- **VERIFIED** — this already happened. The prior spike's quote `323124010738`
  ("EASYOB SPIKE — DELETE ME 2026-08-18 (billing)", `hs_quote_amount` $1.00, sender
  `easyob-spike-test@aioapp.com`, link `https://customers.aioapp.com/d4jg465s3md`) now reads
  `hs_status: VOID` / `hs_quote_status: VOID`, modified 2026-08-18T22:05 — ~10 minutes after creation.
  Someone voided it by hand and it worked.
- **DOCUMENTED** — deleting it is *not* an option: "Deleted quotes that have online payments or
  e-signature enabled can't be restored", and only draft quotes are restorable
  (https://knowledge.hubspot.com/quotes/manage-quotes). Combined with the spike's own finding that a
  published quote 400s `PUBLISHED_QUOTE_CANNOT_BE_DELETED` (`E2E-PLAN.md:490`), the realistic
  end-state of a published test quote is **VOID and permanent**, not gone.

So: publishing a test quote is a one-way door that a human can *neuter* (void, link dead) but not
*erase*. That is exactly the posture `PHASE-E-SPEC.md` §6 already builds for. **Set
`hs_allowed_payment_methods` on any such test quote, but never send its link to anyone**, and void it
immediately after reading `hs_quote_link`.

Run it against the sanctioned test company (§3.0.1) rather than a fresh throwaway deal — the prior
spike left an orphaned `VOID` quote with no associations at all because its deal and contact were
deleted afterwards, and there is no need to create a second one.

---

## 3. If someone insists on a live payment anyway — the minimum-blast-radius procedure

I recommend against this (§2.1). Documented here because the request asked for it, and because the
recipe below is *already this company's own practice*, which is worth knowing regardless.

### 3.0 ⚠️ A test company is not a sandbox — read this before anything else

AIO has a test company it uses for this kind of work, and the procedure below is written around it.
But be precise about what that buys:

| A test company changes… | A test company does NOT change… |
| --- | --- |
| **Whose** record gets touched — no real merchant's CRM record, contact or deal is affected | That the portal is `accountType: STANDARD` — **live production** |
| The reputational/support risk of a real customer seeing a stray quote or a cancellation email | That the money is **real money**, moving over **real ACH** |
| How embarrassing a mistake is | That HubSpot creates a **real subscription** and **real invoices** |
| — | That a published quote can be **voided but never unpublished or deleted** (§2.2, §5.2) |
| — | That the **payment record and paid invoice are permanent** (§5.2) |
| — | That HubSpot **emails the buyer contact** on subscription cancellation (§3.5) |
| — | That there is **no test mode** to fall back on (§4) |

Everything in §5 applies unchanged when the target is the test company. Do not let "we have a test
company" read as "this is a sandbox" — §4.5 is explicit that a sandbox cannot do this at all, which
is exactly why a live test company is the only option and exactly why it is not free.

### 3.0.1 Candidate test-company records — **the user must confirm which one is sanctioned**

**VERIFIED** (read-only company/deal/contact search). I am listing what exists; **I have not picked
one and nothing here should be acted on until a human confirms the sanctioned record.**

Companies whose name matches "test" (21 total; the plausible ones):

| Company id | Name | Lifecycle | Created |
| --- | --- | --- | --- |
| **`334295287484`** | **"TEST COMPANY"** | opportunity | 2026-07-20 |
| `339448523500` | "Test Company - Cole" | opportunity | 2026-08-11 |
| `339393377013` | "Test Company - Ryan " | opportunity | 2026-08-11 |
| `339303707375` | "Test Company - Bilal" | **customer** | 2026-08-11 |
| `340923692765` | "Test Co Loni 2" | opportunity | 2026-08-18 |
| `341104724707` | "Joe's Food Hall Test" | opportunity | 2026-08-19 |
| `316925796057` | "TEST SDR COMPANY" | opportunity | 2026-04-06 |
| `338487432922` | "Dummy test comp" | — | 2026-08-07 |
| `322876121812` | "Test Restaurant 123" | lead | 2026-05-15 |
| `331800571613` | "Test's Test Shop" | — | 2026-07-02 |
| `326910076628` | "Test" · `339028767430` "test" · `313503605478` "tester" · `338901100232` "hz test" · `325305929403` "Jason Test Restaurant" · `326897011394` "ABR Test" | — | various |

**`334295287484` "TEST COMPANY" is the strongest candidate on the evidence**, because it is the one
that has *already* been through this exact exercise: quote `321964207802`
("TEST COMPANY / Deal-2") is associated to company `334295287484`, deal `340221888213`
(`dealstage: closedwon`, amount $619.30) and contact `516868102865`, and it was **published, paid for
$0.50 on 2026-08-18, and produced real subscription `830472221392`** (§3.3). Its deals:
`340221888213` "TEST COMPANY / Deal-2", `338778824424` "TEST COMPANY / Deal-1" ($8,875.50),
`342941277925` "TEST COMPANY / Deal-4", `337550436082` "TEST COMPANY / Deal-1".

**This is a recommendation from portal evidence, not a decision. Confirm with the user (and with
whoever ran the 2026-08-18 $0.50 test) before touching any of it.** Two specific things to confirm:

1. That the company is genuinely a scratch record and not a real prospect someone named badly.
   `339303707375` "Test Company - Bilal" has `lifecyclestage: customer` — that alone is a reason to
   ask rather than assume.
2. **Which contact's mailbox will receive the e-sign request, the payment receipt and the eventual
   cancellation email.** Those are real emails to a real inbox. The contact on the existing test
   quote is `516868102865`. Use a contact whose mailbox a teammate actually controls.

**One more data point on how the last spike ended: the throwaway deal and contact were deleted, the
quote could not be.** Quote `323124010738` ("EASYOB SPIKE — DELETE ME 2026-08-18") now has **zero**
deal, contact and company associations, yet publish requires all three — so they were removed or
deleted afterwards, leaving an orphaned `VOID` quote permanently in the portal. Reusing the test
company avoids creating another orphan, but does not remove the one already there.

### 3.1 The floor is $0.50, and $1.00 is the safe number

**DOCUMENTED**, and it names BYO Stripe explicitly: *"HubSpot payments and payments via the Stripe
payment processing option require at least $0.50 due at checkout"*
(https://knowledge.hubspot.com/payment-processing/buyer-checkout-experience). The per-currency
"Minimum charge amount" table gives USD `0.50`, EUR `1`, GBP `0.60`
(https://knowledge.hubspot.com/payment-processing/configure-currencies-for-commerce-hub). The
subscriptions doc phrases it as "must be **more than** $0.50"
(https://knowledge.hubspot.com/subscriptions/create-subscriptions) — so the two docs disagree on
whether $0.50 itself qualifies.

**No ACH-specific minimum is documented** — only a maximum ($100,000 per ACH transaction). **INFERRED**
that the $0.50 floor is payment-method-agnostic.

**VERIFIED** — the portal nevertheless contains **$0.50 quotes that were actually paid**:
`303941810923` ($0.50 first payment, $0.50 TCV, paid 2026-05-01) and `321964207802`
("TEST COMPANY / Deal-2", $0.50 first payment, $619.30 TCV, paid 2026-08-18). So $0.50 empirically
clears here. **Use $1.00** anyway — it matches the prior spike's amount and sits unambiguously above
the documented floor.

### 3.2 Low-value live testing is established practice here

**VERIFIED.** This is not a novel risk being introduced. The portal already contains, among others:

| Quote | First payment | State |
| --- | --- | --- |
| `321964207802` "TEST COMPANY / Deal-2" | **$0.50** | **PAID** 2026-08-18 → subscription `830472221392` |
| `303941810923` "The Healthy Spot - Stockton" | **$0.50** | **PAID** 2026-05-01, no subscription |
| `323124010738` "EASYOB SPIKE — DELETE ME" | $1.00 | published then VOIDed 2026-08-18 |
| `245401935602`, `241200717518`, `241200717517` "deal to delete stuff" | $1.00 | ACCEPTED, unpaid |
| `214219773642` "Test Deal Using Quote" | $2.00 | ACCEPTED, unpaid |
| `237053483758` "Example deal/Quote" | $1.98 | ACCEPTED, unpaid |
| `320521983685`, `321964207816`, … "TEST COMPANY / Deal-1" | — | DRAFT |
| "Sean test 1", "Omar Test 1", "Kyle Test 1", "shomiktest1", "Test Company - Cole/Bilal/Ryan", "Test Co Loni 2", "Joe's Food Hall Test" | — | published / draft |

### 3.3 AIO's own $0.50 recipe, reverse-engineered

**VERIFIED** — this is exactly how `321964207802` exercised the *complete* quote→checkout→subscription
linkage for **$0.50**, with the first recurring charge **60 days out**:

| Line item | Product | Price | Discount | Amount | Frequency | Delay |
| --- | --- | --- | --- | --- | --- | --- |
| AIO Pre Auth | `281354281678` | $0.50 | 0% | **$0.50** | one-time | — |
| AIO Processing Two Tiered Rate | `260559288040` | $0 | 100% | $0.00 | one-time | — |
| AIO WiFi Network Package | `281351401209` | $999 | **100%** | $0.00 | one-time | — |
| QSR POS Hardware Bundle | `252941875920` | $1,110 | **100%** | $0.00 | one-time | — |
| Onsite Installation | `223452690133` | $999 | **100%** | $0.00 | one-time | — |
| System Onboarding and Training | `223152695032` | $499 | **100%** | $0.00 | one-time | — |
| AIO Platform (1 to 5 Order Points) | `217526517443` | $99 | **90%** | $9.90 | **weekly** | `hs_billing_start_delay_days: 60` |
| Payroll - AIO Platform (Per Person) | `223152695998` | $2 | 0% | $2.00 | **weekly** | `hs_billing_start_delay_days: 60` |

Result: `hs_quote_amount` = **$0.50** (`hs_quote_total_preference: TOTAL_FIRST_PAYMENT`),
`hs_tcv` = $619.30, `hs_total_discount` = $8,240.20. Subscription `830472221392` created
2026-08-12T18:44:11, `hs_status: scheduled`, `hs_recurring_billing_frequency: weekly`,
`hs_mrr: 51.53`, and `hs_recurring_billing_start_date` / `hs_next_payment_due_date` =
**2026-10-11** — i.e. **nothing recurring is charged for 60 days**, leaving a two-month window to
cancel.

The two load-bearing knobs are **`hs_discount_percentage` on the line items** and
**`hs_billing_start_delay_days` on the recurring lines**. Neither appears anywhere in
`PHASE-E-SPEC.md` §3.3 — if a live test is ever run, the line-item builder needs both.

### 3.4 The procedure, as documentation — DO NOT RUN THESE

Everything up to step 6 costs $0 and can be voided. Step 6 is where real money moves.

```
# ── 0. Prereqs ───────────────────────────────────────────────────────────────
#   - THE SANCTIONED TEST COMPANY, confirmed by a human (§3.0.1). Evidence points
#     to company 334295287484 "TEST COMPANY" — DO NOT assume; confirm first.
#   - a deal on that company. Either reuse one (e.g. 342941277925
#     "TEST COMPANY / Deal-4") or create a fresh one named
#     "EASYOB PAYMENT TEST — DELETE ME <date>". A fresh deal is cleaner: deals
#     ARE deletable afterwards, and it keeps the test out of the existing deals'
#     history. Associate it: deal->company typeId 341 (or 5 for Primary).
#   - a contact on that company WHOSE MAILBOX A TEAMMATE CONTROLS. It will
#     receive the e-sign request, the payment receipt, and later the automatic
#     subscription-cancellation email (§3.5). Existing test contact: 516868102865.
#   - a real bank account you are willing to have debited $1.00 and to be stored
#     as a payment method on that contact (removable afterwards — §3.5 step 4).
#   - CHECK THE PORTAL'S WORKFLOW LIST FIRST (§5.2 item 7). This portal runs at
#     least one deal-renaming workflow; a payment or a closedwon stage change
#     could trip a customer-facing automation.
#   - $BILLING = HUBSPOT_BILLING_PRIVATE_APP_TOKEN, loaded via loadEnvConfig,
#     NEVER grepped out of .env.local (E2E-PLAN.md:73-83)

# ── 1. One-time $1.00 line item ($0 recurring; skip the recurring line entirely
#      if you only want the payment path, not the subscription path) ──────────
POST /crm/v3/objects/line_items
  { "properties": { "hs_product_id": "281354281678",   # AIO Pre Auth, $0.50
                    "quantity": "2", "price": "0.5" } }

# ── 1b. OPTIONAL recurring line, only if you want a subscription to appear.
#       hs_billing_start_delay_days pushes the first recurring charge 60 days out;
#       hs_discount_percentage keeps the amount trivial. ────────────────────────
POST /crm/v3/objects/line_items
  { "properties": { "hs_product_id": "217526517443",   # AIO Platform, $99/wk
                    "quantity": "1", "price": "99",
                    "recurringbillingfrequency": "weekly",
                    "hs_recurring_billing_period": "P7D",       # E2E-PLAN.md:450
                    "hs_discount_percentage": "99",             # → $0.99/wk
                    "hs_billing_start_delay_type": "hs_billing_start_delay_days",
                    "hs_billing_start_delay_days": "60" } }

# ── 2. DRAFT quote ──────────────────────────────────────────────────────────
POST /crm/v3/objects/quotes
  { "properties": { "hs_title": "EASYOB PAYMENT TEST — DELETE ME <date>",
                    "hs_template_type": "CPQ_QUOTE",
                    "hs_expiration_date": "<+30d, yyyy-MM-dd>",
                    "hs_billing_enabled": "true",
                    "hs_payment_enabled": "true",
                    "hs_store_payment_method_at_checkout": "true",
                    "hs_collection_process": "AUTO_PAYMENTS",
                    "hs_allowed_payment_methods": "ACH",
                    "hs_acceptance_method": "esignature" } }
                    # never write hs_esign_enabled — derived (E2E-PLAN.md:467)

# ── 3. Associations (all four are publish preconditions) ────────────────────
PUT /crm/v4/objects/quotes/{quoteId}/associations/line_items/{lineItemId}
    [{ "associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 67 }]
PUT /crm/v4/objects/quotes/{quoteId}/associations/deals/{dealId}
    [{ "associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 64 }]
PUT /crm/v4/objects/quotes/{quoteId}/associations/contacts/{contactId}
    [{ "associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 69 }]
PUT /crm/v4/objects/quotes/{quoteId}/associations/contacts/{contactId}
    [{ "associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 702 }]  # signer
# do NOT create 1393 — HubSpot adds it at publish (E2E-PLAN.md:469)

# ── 4. Read back and EYEBALL the totals before publishing ───────────────────
GET /crm/v3/objects/quotes/{quoteId}?properties=hs_quote_amount,hs_tcv,hs_total_discount,hs_status
#   ⛔ STOP unless hs_quote_amount is exactly the tiny number you intend.
#      hs_quote_amount is TOTAL_FIRST_PAYMENT — it is what gets charged.

# ── 5. Publish — THE ONE-WAY DOOR ($0, but only voidable, never erasable) ────
PATCH /crm/v3/objects/quotes/{quoteId}
  { "properties": { "hs_sender_email": "<a real AIO mailbox>",
                    "hs_status": "APPROVAL_NOT_NEEDED" } }
GET /crm/v3/objects/quotes/{quoteId}?properties=hs_quote_link,hs_payment_status
#   hs_quote_link populates ~3s later; one retry (E2E-PLAN.md:474)

# ── 6. ⛔⛔ REAL MONEY ⛔⛔ — a human opens hs_quote_link, e-signs, and enters
#      real bank details. There is no test mode (§4). Nothing below is a
#      simulation. Everything created here is described in §3.5.

# ── 7. Read-back verification — this is the ONLY thing step 6 buys you, and
#      §1 already proves all of it against 46 real quotes ───────────────────
GET /crm/v4/objects/quotes/{quoteId}/associations/subscriptions    # expect typeId 304
GET /crm/v3/objects/subscriptions/{subId}?properties=hs_status,hs_payment_method,hs_mrr,hs_recurring_billing_start_date
```

### 3.5 Cleanup, in order — what works and what does not

**DOCUMENTED throughout.** Do these in this order, immediately after step 7.

1. **Cancel the subscription.** UI: Revenue → Subscriptions → Preview → Actions → *Cancel
   subscription*. API: `POST /payments-subscriptions/v1/subscriptions/crm/{subscriptionId}/cancel`
   (https://developers.hubspot.com/docs/guides/api/crm/objects/create-and-manage-subscriptions).
   - **`hs_status` is not on the documented list of PATCH-updatable subscription properties** — use
     the `/cancel` endpoint, not `PATCH /crm/v3/objects/subscriptions/{id}`. (The property definition
     reports `readOnlyValue: false`, which is why a PATCH looks plausible; **INFERRED** that it will
     be rejected or will not perform the real lifecycle transition. Do not rely on it.)
   - **Cancellation is not reversible** and **sends the customer a cancellation email automatically**
     (https://knowledge.hubspot.com/subscriptions/manage-subscriptions). Use a throwaway contact whose
     mailbox a teammate controls.
   - `hs_status: paused` (Actions → *Pause subscription*, or
     `POST /payments-subscriptions/v1/subscriptions/crm/{id}/pause`) **is** reversible via *unpause* —
     prefer pausing if you might want the record intact.
2. **Delete the subscription (optional).** `DELETE /crm/v3/objects/subscriptions/{id}`. "Billable
   subscriptions can only be deleted if they've expired or they've been cancelled", and once deleted
   "it can't be restored" (same two URLs as above). So: cancel first, then delete.
3. **Refund the payment.** UI only: Revenue → Payments → click the Gross amount → Actions → *Refund*
   (https://knowledge.hubspot.com/payments/manage-payments). No refund API and no refund object exist
   in the docs. ACH refunds must be initiated within **180 days**; settlement 5–10 business days.
   The payment record survives with status `Refunded` and the reason in its History tab.
4. **Remove the stored payment method** from the contact/company: Revenue tab → Billing → ⋯ →
   *Remove payment method* (BETA)
   (https://knowledge.hubspot.com/payments/store-a-payment-method-for-future-charges). **INFERRED**:
   it persists past subscription cancellation, since it lives on the contact, not the subscription —
   remove it explicitly.
5. **Void the quote** in the UI. Deactivates the link; the quote record stays forever
   (https://knowledge.hubspot.com/quotes/manage-quotes).
6. **Delete the throwaway deal, contact and line items** — ordinary CRM objects, deletable.

**⚠️ The one that will catch you out (DOCUMENTED):** cancelling a subscription does **not** stop an
in-flight ACH debit. *"If the subscription has a pending payment via bank debit (ACH), the pending
payment will not be automatically canceled and refunded"*
(https://knowledge.hubspot.com/subscriptions/manage-subscriptions). Since **VERIFIED** settlement here
takes ~5.7 days, a cancel-immediately-after-paying still lets the $1.00 through. You must refund
separately, once the payment reaches a refundable state.

---

## 4. Is there a non-real-money way to test this? **No.**

Definitive answer, from HubSpot's own documentation. Every escape route is closed, and three of them
are closed *by name* for this exact configuration.

### 4.1 The processor is Stripe-via-HubSpot, and that is what closes the doors

**VERIFIED** — `hs_payment_type: BYO_STRIPE` on **46 of 46** paid quotes (enum:
`HUBSPOT | STRIPE | BYO_STRIPE`). Not native HubSpot Payments. This settles **O-15**
(`PHASE-E-SPEC.md:811`) as fact rather than a doubt — and it matters, because the BYO-Stripe path is
the one HubSpot excludes from every non-production account type.

### 4.2 Test mode for quote checkout: not available

- **DOCUMENTED — never existed for quotes.** No live HubSpot doc describes a test mode for a *quote's*
  hosted checkout. The quote-billing docs contain no testing section at all
  (https://knowledge.hubspot.com/quotes/understand-how-to-bill-buyers,
  https://knowledge.hubspot.com/payments/connect-payments-to-the-quotes-tool).
- **DOCUMENTED — it existed for *payment links* and has been removed.** The live payment-links
  testing article (https://knowledge.hubspot.com/payment-links/test-payment-links) now documents only
  three validations: preview the checkout page in the editor, **"Transact a low-value amount"**
  (create a link with a ~$1.00 line item, pay it, verify, then refund), and "test in a sandbox".
  An older revision of that same URL described an *"Open link in test mode"* action; cached snippets
  report it is "no longer possible to open a payment link in test mode in any account." The live
  page's total absence of a test-mode section is consistent with removal. **UNCONFIRMED** — the
  removal sentence could not be reproduced by fetching the live page, so treat the *wording and date*
  as unverified; the *absence* is verified.
- **DOCUMENTED — even when it existed, it was useless for this.** Test mode "won't create payment or
  subscription records" (only a contact, and a `(Test)`-prefixed deal), workflows on payment records
  did not fire, and it was **not available for payment links with recurring line items** at all.
  A subscription is precisely the artifact O-4 is about, so test mode could never have answered O-4.

### 4.3 A Stripe test-mode account: explicitly blocked on non-standard portals, undocumented on this one

- **DOCUMENTED** — *"You can't connect Stripe payment processing to sandbox, developer test or
  partner demo accounts."*
  (https://knowledge.hubspot.com/payment-processing/connect-your-stripe-account-as-a-payment-processor-in-hubspot)
- Whether a Stripe account that is itself in *test mode* can be connected to a standard portal:
  **NOT DOCUMENTED** either way. Setup is described only as an OAuth redirect to Stripe.
  **Not a path to pursue**: it would mean re-pointing the live portal's payment processor, which is a
  far larger production change than the $1.00 it saves.
- **A documentation contradiction, flagged so nobody chases it:** the payment-links testing article's
  "Test in a sandbox account" section says to use a sandbox with Stripe and *"Simulate payments using
  Stripe's test values"* — which **directly conflicts** with the Stripe-connect doc quoted above.
  Treat it as a HubSpot doc inconsistency, not a usable route.

### 4.4 The `hs_payments_source_app_id: test` enum is a dead end

**VERIFIED** — the enum exists (`sales_checkout | test | quote | migration | billing`) and **zero of
the portal's 91 subscriptions carry `test`**. **NOT DOCUMENTED** — HubSpot's properties reference
describes only "the object or tool that created the subscription" and lists no enum values.
**INFERRED** — it is residue of the removed payment-links test mode. Since that mode created no
subscription records, `test` was probably never reachable for subscriptions at all.

### 4.5 Sandboxes: commerce is excluded, by name

- **DOCUMENTED** — *"HubSpot payments isn't supported in sandbox accounts, and should only be set up
  in standard accounts"*; payment links created in a sandbox "will appear in the standard account
  instead and can't be used for collecting payments"
  (https://knowledge.hubspot.com/payment-processing/set-up-payments). Restated in the FAQ
  (https://knowledge.hubspot.com/payment-processing/payments-frequently-asked-questions).
- **DOCUMENTED** — Stripe processing is blocked in **all three** non-standard account types (§4.3).
- **DOCUMENTED** — HubSpot's account-types reference never mentions Commerce Hub, payments, quotes,
  subscriptions or invoices among sandbox capabilities or limitations
  (https://developers.hubspot.com/docs/getting-started/account-types).
- **DOCUMENTED** — both commerce APIs gate on live processing: *"To use these APIs, the account must
  be set up to collect payments through either HubSpot payments or Stripe payment processing"*
  (https://developers.hubspot.com/docs/api-reference/latest/crm/objects/commerce-subscriptions/guide).

So the prior belief recorded in the brief — that developer sandboxes do not support commerce — is
**confirmed for payments specifically**. **INFERRED**: quote/invoice/subscription *records* can still
exist in a sandbox as CRM objects, but no payment can be collected against them, so the
checkout-derived linkage cannot be produced there.

### 4.6 "Mark as paid" / simulate: exists for invoices, and produces the WRONG linkage

- **DOCUMENTED** — an **invoice** can be manually marked paid, by creating a new payment record or
  applying an existing one; the invoice must be `Open` with a positive balance due
  (https://knowledge.hubspot.com/invoices/manage-invoices).
- **DOCUMENTED — but it does not create or link a subscription.** A manual record creates a *payment*
  object only. The subscription-creation behaviour is documented exclusively for the checkout path:
  "When a buyer purchases a recurring line item via a payment link, quote, or legacy quote" the
  subscription is auto-created and auto-associated
  (https://knowledge.hubspot.com/subscriptions/create-subscriptions). **So a manual payment cannot
  reproduce association 304, which is the entire subject of O-4.**
- **DOCUMENTED — no manual mark-as-paid for a *quote*.** Only invoices have it.
- **DOCUMENTED** — manually recorded payments "can not be refunded through HubSpot as there is no
  payment processor available to reverse the transaction"
  (https://knowledge.hubspot.com/payments/manage-payments).
- **DOCUMENTED** — a subscription *can* be created with no payment at all (Revenue → Subscriptions →
  Create subscription, or the Subscriptions API) with associations chosen by hand
  (https://knowledge.hubspot.com/subscriptions/create-subscriptions). That yields a real subscription
  object but a **hand-made** association, which proves nothing about what HubSpot does on its own —
  and `E2E-PLAN.md:255-264` already rejects seller-created subscriptions because they land in
  manual-collection territory rather than reproducing AIO's weekly auto-ACH.

### 4.7 Verdict on §4

**There is no sanctioned, documented, non-real-money way to exercise a BYO-Stripe quote checkout.**
Test mode is gone (and never covered recurring lines or quotes); sandboxes cannot connect Stripe;
manual mark-as-paid produces a payment without a subscription. HubSpot's *own* recommended
validation is literally *"Transact a low-value amount"* and refund it
(https://knowledge.hubspot.com/payment-links/test-payment-links) — i.e. HubSpot's answer to this
question is the same as §3's, and the same thing AIO has already done twice at $0.50.

**Which is why §2.1's verdict stands: don't test. The answer is already in the data.**

---

## 5. What this costs and what cannot be undone

**This section applies in full whether or not the target is AIO's test company.** A test company
changes *whose* record is touched. It does not change what is reversible, what is charged, what is
emailed, or what stays in the portal forever. See §3.0 for the distinction spelled out, and §4.5 for
why a sandbox — the thing that *would* make this free — cannot do it at all.

### 5.1 Money

| Item | Amount |
| --- | --- |
| The charge itself | **$1.00** (floor $0.50, **DOCUMENTED**) |
| HubSpot platform fee, BYO Stripe | **0.75%** of the transaction (https://knowledge.hubspot.com/payment-processing/connect-your-stripe-account-as-a-payment-processor-in-hubspot) — under a cent on $1.00; **NOT DOCUMENTED** whether HubSpot rounds up |
| Stripe's own ACH fee | **NOT DETERMINED.** HubSpot explicitly defers to "the fee agreed with Stripe" (https://knowledge.hubspot.com/payment-processing/payments-frequently-asked-questions). AIO's Stripe agreement is not in this repo. Commonly a flat cents-plus-percentage — **so the fee can exceed the $1.00 principal.** Check the Stripe dashboard before quoting a cost |
| *(for contrast, native HubSpot Payments — not what AIO uses)* | ACH 0.8% capped at $10 + 0.5% platform fee capped at $10 (https://knowledge.hubspot.com/payment-processing/payments-frequently-asked-questions) |
| On refund | **DOCUMENTED** — "The transaction fees associated with the original transaction won't be refunded" (https://knowledge.hubspot.com/payment-processing/payments-frequently-asked-questions). The fee is a genuine, unrecoverable loss |

Total exposure is small in dollars. That is not the reason to avoid it.

### 5.2 Irreversible

**Permanent, no matter what you do afterwards:**

1. **The payment record.** **DOCUMENTED** — "Payments created through HubSpot payments or Stripe
   payment processing cannot be modified or deleted via this API"
   (https://developers.hubspot.com/docs/api-reference/legacy/crm/objects/commerce-payments/guide) and
   "Online payments can't be deleted" (https://knowledge.hubspot.com/invoices/manage-invoices). A
   refund changes its status to `Refunded`; it never disappears. It shows on the associated contact,
   company and deal forever.
2. **The paid invoice.** **DOCUMENTED** — cannot be voided ("It isn't possible to void invoices with
   payments made against them") and cannot be deleted (blocked when "associated with a credit memo,
   online payment or subscription"); "invoice deletion is permanent and can't be undone", and invoice
   numbers keep incrementing so any deletion leaves a permanent gap
   (https://knowledge.hubspot.com/invoices/manage-invoices).
3. **The published quote.** Not editable, not deletable, not voidable *via API*
   (`E2E-PLAN.md:489-493`). Voidable only by a human in the UI, and a void leaves the record in place
   (https://knowledge.hubspot.com/quotes/manage-quotes). **VERIFIED** — the 2026-08-18 spike quote is
   sitting in the portal as `VOID` right now.
4. **Payment activity written onto the contact / deal / company timelines**
   (https://knowledge.hubspot.com/payments/manage-payments). Not described as removable.
5. **The subscription-cancellation email to the buyer** — sent automatically, cannot be recalled
   (https://knowledge.hubspot.com/subscriptions/manage-subscriptions).
6. **The transaction fee** (§5.1).
7. **Any portal workflow that fires on payment or on a deal-stage change.** **NOT DETERMINED** — I
   did not enumerate this portal's workflows, and this portal demonstrably runs at least one
   (deals get renamed to `{company} / Deal-{n}`, `E2E-PLAN.md:499-500`). A test payment could trip a
   customer-facing automation. **Check the workflow list before any live payment.** This is the risk
   I would actually worry about, more than the dollar.

**Recoverable:**

- The subscription — cancel, then delete (**DOCUMENTED**, in that order only).
- A pause instead of a cancel — reversible via unpause (**DOCUMENTED**).
- The stored payment method — removable from the contact's Revenue tab (**DOCUMENTED**, BETA).
- The throwaway deal, contact and line items — ordinary deletable CRM objects.
- The quote link — dead once the quote is voided (**DOCUMENTED**).

### 5.3 What I could not determine

Stated as unknowns rather than guessed:

1. **AIO's actual Stripe per-transaction ACH fee.** Not in HubSpot's docs, not in this repo. Needs
   the Stripe dashboard.
2. **Whether any portal workflow fires on payment / deal-stage change.** Not enumerated (§5.2 item 7).
3. **Whether `PROCESSING` ever appears on an ACH quote in this portal.** Zero records carry it.
4. **Whether an EasyOB-API-created quote's hosted checkout behaves identically to a UI-created one.**
   The 46 paid quotes were all built in the HubSpot UI; the spike's API-created quote was published
   but never paid. This is a publish/checkout question, addressed by §2.2's $0 run, not by paying.
5. **Whether deleting a subscription cascades to its invoices.** The invoice rules imply not.
6. **Whether an unaccepted quote link stops resolving at `hs_expiration_date`** (O-8's other half).
7. **Whether `hs_payment_date` is first-payment or most-recent-payment.** Evidence points to
   *most recent*: quote `315139223272` has two associated invoices and two payments, and its
   `hs_payment_date` (2026-08-19) precedes its subscription's `hs_last_payment_date` (2026-08-20).
   **INFERRED**: do not treat `hs_payment_date` as a stable "first paid at" timestamp.

---

## 6. Recommended changes to `PHASE-E-SPEC.md`

Ordered by how much they change the build. All are derivable from §1 — none needs a test.

| # | Change | Spec ref |
| --- | --- | --- |
| 1 | **Close O-4 as resolved**: quote → subscription is association **304**. Drop the deal-based fallback and the "needs a live payment" row | `:793`, `:778`, `:836` |
| 2 | **`findSubscriptionForDeal` → `findSubscriptionsForQuote(quoteId): Promise<SubscriptionSnapshot[]>`**; `HubspotIds.subscriptionId` → `subscriptionIds: string[]` | `:241`, `:418` |
| 3 | **Re-gate `billingModule` on the subscription, not `hs_payment_status`** — PAID lags checkout by ~5.7 days | `:620-631` |
| 4 | **Widen the cron lookback 3 d → 10 d** for the quote sweep | `:693-697` |
| 5 | **Close O-3**: `hs_allowed_payment_methods: "ACH"` | `:792` |
| 6 | **Close O-17**: deal → company **341** (or **5** for Primary), deal → contact **3** | `:796` |
| 7 | **Close O-15**: `BYO_STRIPE`, definitively, 46/46 | `:811` |
| 8 | **Answer O-5 with the real stage ids**, and add the finding that `STAGE_MAP` names four stages that do not exist — `pushToHubSpot` would still 400 after the §5.2 property filter | `:794`, §5.2 item 2 |
| 9 | **O-1, half-answered**: `hs_sender_email` is the owning rep's address, per-quote | `:791` |
| 10 | Add `hs_discount_percentage` and `hs_billing_start_delay_days` / `hs_billing_start_delay_type` to the line-item property table — AIO's live quotes rely on both | §3.3 |
| 11 | Note the `commerce-payments-read` scope gap for Phase G | `:558` |
| 12 | Cache `hs_payment_method`, `hs_recurring_billing_frequency`, `hs_recurring_billing_start_date` on each subscription snapshot; render `paused` / `canceled` (35 of 91 live subscriptions) | `:232-238`, §7.2 |
