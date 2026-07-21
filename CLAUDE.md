# ClearRate / AIO Rate Calculator

> **Active work is on the `v2` branch.** The `app-v2/` directory contains a Next.js rewrite with a canonical data model, a Postgres-backed multi-role (Customer/Rep/Admin) permission model with a pillowed margin system, server-side Anthropic API, and stubs for Adyen hosted onboarding and HubSpot sync. See the **v2 Architecture** section below. `main` branch / root HTML files are frozen as reference.

## Overview
ClearRate is a payment-processing proposal engine for AIO Payments. A sales rep uploads a merchant's current processing statement (PDF or image), Claude extracts the fees/volume/effective-rate, the app computes a competing AIO offer against AIO's margin floors, generates a branded proposal, and kicks off an Adyen merchant-onboarding application.

## Tech Stack
- **Language:** JavaScript (JSX transpiled in-browser via `@babel/standalone`)
- **UI:** React 18 + ReactDOM (UMD builds from `unpkg.com`), inline-style components (no CSS framework)
- **PDF export:** `html2pdf.js` 0.10.1 (from cdnjs) — only in `clearrate-main/index.html`
- **AI:** Anthropic Claude Messages API called directly from the browser (`https://api.anthropic.com/v1/messages`, header `anthropic-dangerous-direct-browser-access: true`). Models: `claude-sonnet-4-6` (root build) and `claude-sonnet-4-20250514` (clearrate-main build).
- **Payments onboarding:** Adyen LEM / Management / Balance Platform REST APIs, proxied through a CORS proxy (default `https://corsproxy.io/?`) — `clearrate-main/index.html` only.
- **Persistence:** `localStorage` only. No package manifest, no `node_modules`, no bundler.

## Architecture
Two parallel versions of the same app live in the repo:

- **`index.html` (root)** — older/simpler build. 4-step flow: `upload → analysis → pricing → proposal`. Has a `settings` page with processors + users.
- **`clearrate-main/`** — newer build, three cooperating pages:
  - `index.html` — the internal proposal engine. 5-step flow: `upload → analysis → pricing → proposal → apply`. Adds AIO margin tables, PDF export, and the Adyen onboarding "Apply" step. Saves submissions to `localStorage["aio_applications"]`.
  - `customer.html` — public-facing "Free Processing Analysis" lead-capture page (light theme). Customer uploads a statement; results + contact info are written to `localStorage["aio_submissions"]`.
  - `admin.html` — password-gated dashboard (dark theme) that reads `localStorage["aio_submissions"]` to review leads. Password is hardcoded as `aio2024` (`ADMIN_PASSWORD`).

Note: `localStorage` is per-origin, so `customer.html` and `admin.html` only share `aio_submissions` data when served from the same origin/host.

### Core pipeline (per page)
1. **Upload** — `FileReader.readAsDataURL` turns the statement into base64; sent to Claude as an `image` or `document` (PDF) content block.
2. **Analysis** — Claude returns strict JSON (merchant name, volume, fees, effective rate, card-present vs not-present splits, current pricing model, etc.). `parseJSON()` strips markdown fences and slices to the outer `{…}`.
3. **Pricing** — computed locally. `MARGIN_REQS` / `getMarginFloor(volume)` enforce AIO's tiered take-rate + minimum MRR floors. `INTERCHANGE_SCHEDULE` (root build) estimates true interchange for hidden-margin tiered statements. `calcAdyenCost` / `adyenRateOnVolume` model the AIO/Adyen cost basis.
4. **Proposal** — Claude generates proposal copy using the *already-computed* numbers (prompt explicitly forbids recalculating). Exported via `html2pdf` (clearrate-main).
5. **Apply** (clearrate-main only) — collects business/owner details and optionally calls Adyen LEM/Management APIs to create legal entities, ownership relationships, and onboarding.

## Key Files & Entry Points
- `/Users/shaheerhasnain/Documents/Projects - AIO/aioratecalc/index.html` — standalone older build (open directly in a browser).
- `/Users/shaheerhasnain/Documents/Projects - AIO/aioratecalc/clearrate-main/index.html` — main internal proposal + apply app.
- `/Users/shaheerhasnain/Documents/Projects - AIO/aioratecalc/clearrate-main/customer.html` — public lead-capture analysis page.
- `/Users/shaheerhasnain/Documents/Projects - AIO/aioratecalc/clearrate-main/admin.html` — admin dashboard for reviewing submissions.

There is no README, no `package.json`, and no source directory — each HTML file is the complete, self-contained application.

## Build / Run / Test
There is **no build, install, or test tooling** in this repo (no `package.json`, no scripts, no test files).

- **Run:** open any of the `.html` files directly in a browser, or serve the folder over a static server, e.g.:
  ```
  cd "/Users/shaheerhasnain/Documents/Projects - AIO/aioratecalc"
  python3 -m http.server 8000
  ```
  then visit `http://localhost:8000/index.html` or `http://localhost:8000/clearrate-main/index.html`.
- **API key:** root `index.html` `prompt()`s for an Anthropic API key on first load and stores it in `localStorage["cr_api_key"]`. The `clearrate-main` pages only *read* `cr_api_key` from `localStorage` — set it manually (e.g. via the root page or DevTools) before they can call Claude.
- **Test:** none. Verification is manual, by running the flow in a browser.

## Conventions & Gotchas
- **Secrets in the browser.** The Anthropic API key and all Adyen API keys (`lemApiKey`, `managementApiKey`, `balancePlatformApiKey`) are stored in `localStorage` and sent from the client. The code itself warns this is unsafe for live/production keys (see the security note in `clearrate-main/index.html`). The admin password `aio2024` is hardcoded in `admin.html`.
- **No server.** All "backend" state is `localStorage`. Keys in use: `cr_api_key`, `clearrate:settings`, `clearrate:adyen_config`, `aio_applications`, `aio_submissions`.
- **Two diverging copies.** Root `index.html` and `clearrate-main/index.html` share most logic but differ (Claude model id, the `apply`/Adyen step, `MARGIN_REQS`, PDF export, a `users` array in settings). Changes to shared logic must be made in both if you want parity.
- **Model ids differ between builds** — `claude-sonnet-4-6` vs `claude-sonnet-4-20250514`. Keep this in mind when editing prompts/models.
- **Pricing is computed locally, not by the LLM.** Claude is used only for statement extraction and proposal prose; it is explicitly instructed not to change numbers. Keep money math in JS (`MARGIN_REQS`, `getMarginFloor`, `calcAdyenCost`, `INTERCHANGE_SCHEDULE`).
- **LLM JSON parsing is defensive** via `parseJSON()` (strips ```` ```json ```` fences, slices outer braces). Preserve that when changing prompts.
- **CDN-dependent.** React, Babel, and html2pdf load from public CDNs at runtime, so the app needs internet access to run at all. JSX is transpiled on every page load via `<script type="text/babel">` (slow first paint; not a production setup).
- **Adyen calls go through a public CORS proxy** (`corsproxy.io` by default, configurable via `clearrate:adyen_config.corsProxy`).
- `.gitignore` lists `node_modules/`, `.env`, `__pycache__/`, etc. — generic boilerplate; none of those toolchains are actually present.

---

## v2 Architecture (`app-v2/` on branch `v2`)

### Stack
- **Next.js 15.1.2** (App Router, TypeScript, `src/` dir) in `app-v2/`. Note: the repo was originally scaffolded on 16.2.9/React 19.2.4; the working tree currently pins 15.1.2/React 19.0.0 — this downgrade predates Phase 1.5 and was never resolved with the user. Don't "fix" it without checking first.
- **No CSS framework** — inline styles, dark theme CSS variables (`--bg: #0a0f1e`, `--accent: #f9674e`, etc.)
- **AI:** Anthropic `claude-sonnet-4-6` called server-side via `ANTHROPIC_API_KEY` env var (never in localStorage)
- **Database:** Postgres via Vercel Marketplace (Neon integration), project `aioapp1/aioratecalc`. ORM: Drizzle (`drizzle-orm` + `@neondatabase/serverless`).
- **Auth:** NextAuth v5 (Credentials provider, bcrypt, JWT sessions). No OAuth yet — AIO uses Microsoft 365, so Entra ID (Azure AD) is a plausible fast-follow, not built.
- **Storage:** all reads/writes go through Server Actions (`src/lib/actions/`) → `PostgresAdapter` (`src/lib/storage/postgresAdapter.ts`). `LocalStorageAdapter` was deleted in Phase 1.5 — nothing in the running app touches `localStorage` for application/settings data anymore.
- **Adyen:** hosted onboarding only — AIO creates a legal entity skeleton, Adyen returns a URL, merchant fills SSN/bank/EIN directly on Adyen's hosted page. Phase 2 is **built and in testing** (see phase table) — legal-entity graph + on-demand onboarding-link regeneration are wired; keys must be `\$`-escaped in `.env.local` (see gotcha above).
- **HubSpot:** Private App Token (`HUBSPOT_PRIVATE_APP_TOKEN`), no OAuth. Still Phase 3, not started.

### Roles & the pillowed margin model (Phase 1.5)
Three roles: **Customer** (no account — tokenized links only), **Rep**, **Admin**. `middleware.ts` guards `/rep/*` (rep or admin) and `/admin/*` (admin only) using NextAuth sessions.

The core trust boundary: **reps must never see or derive AIO's true minimum profitable margin.** `pricing.ts`'s `getMarginFloor()` (true volume-tiered floor) and `calcAdyenCost`/`adyenRateOnVolume` (true per-transaction processing cost) are real numbers computed correctly everywhere internally, but a rep's UI/API responses only ever see a **pillowed** (padded) floor and, by default, no exact Adyen cost at all — controlled by an admin-editable global policy (`margin_policy` table, `/admin/settings/pillow`). This is enforced **server-side** in `derivePricingForRole()` (`pricing.ts`) via `src/lib/actions/pricing.ts`'s `getPricingPreviewAction()` — `PricingStep.tsx` has no client-side access to the true numbers at all, it only renders whatever the server decided this role gets to see. Don't move this computation back to the client.

A **temporary, dev-only debug role switcher** (`src/lib/auth/debugRole.ts`, `src/components/dev/RoleSwitcher.tsx`) lets you click through Rep/Admin views without logging in/out, hard-gated on `ENABLE_DEBUG_ROLE_SWITCH` (must only ever be set in a local `.env.local`, never a Vercel project env — Preview deployments also run `NODE_ENV=production`, so that alone isn't a safe gate). It resolves to the real seeded `rep@aioapp.com`/`admin@aioapp.com` DB rows (not fake IDs) since `merchant_applications.owner_user_id` is a strict FK. Safe to delete later: that file, the component, `src/lib/actions/debugRole.ts`, and their two call sites in `middleware.ts`/`auth.config.ts` and `app/layout.tsx`.

### Key files
```
app-v2/src/
  types/merchant.ts          ← canonical MerchantApplication type (no PII fields), CustomerSafeQuote
  lib/pricing.ts             ← MARGIN_REQS, getMarginFloor, derivePricing (true numbers, untouched)
                                + getPillowedFloor/derivePricingForRole (role-scoped view, additive)
  lib/claude.ts              ← analyzeStatement(), generateProposal() — server-side only
  lib/utils.ts               ← fmt$, fmtPct, fmtPct2, fmtBps, parseJSON
  lib/defaults.ts            ← DEFAULT_PROCESSOR (shared between client settings UI and server adapter)
  lib/db/
    schema.ts                ← Drizzle tables: users, margin_policy, app_settings, merchant_applications, customer_submissions
    client.ts                ← server-only Drizzle client (DATABASE_URL)
  lib/storage/
    storageInterface.ts      ← IStorage interface, scoped by { userId, role }
    postgresAdapter.ts       ← server-only IStorage impl (the only one — LocalStorageAdapter is gone)
  lib/auth.ts                ← NextAuth instance (Credentials provider, DB-backed) — Node-only
  lib/auth.config.ts         ← edge-safe NextAuth config (no DB imports) — used by middleware.ts
  lib/auth/
    getEffectiveRole.ts      ← the one place that resolves "who's asking" (real session or debug role)
    debugRole.ts             ← DEBUG-ROLE-SWITCHER — see note above
  lib/actions/
    auth.ts                  ← loginAction, logoutAction (Server Actions wrapping signIn/signOut)
    applications.ts          ← list/get/save/delete application + settings/submissions Server Actions
    pricing.ts                ← getActivePillowPolicy, updatePillowPolicyAction (admin-only), getPricingPreviewAction
    prospects.ts              ← createProspectAction — rep creates a prospect + tokenized customer link
    debugRole.ts               ← setDebugRoleAction (no-ops unless ENABLE_DEBUG_ROLE_SWITCH=true)
  lib/adapters/
    adyen.ts                 ← createLegalEntityAndGetOnboardingUrl(), createOnboardingLink(), updateLegalEntity() — Phase 2, wired & in testing
    hubspot.ts                ← pushToHubSpot(), pullFromHubSpot() — Phase 3 stub (written)
  middleware.ts               ← route protection for /rep/* and /admin/*
  app/
    login/                    ← real login (Credentials)
    rep/proposals/new/        ← 5-step rep flow (upload→analysis→pricing→proposal→apply)
    rep/prospects/new/        ← rep sets a margin target + generates a customer self-serve link
    rep/settings/             ← processor/tier config (rep-editable; pillow policy is admin-only, separate)
    admin/                    ← dashboard, session-gated (no more hardcoded password)
    admin/settings/pillow/    ← admin-only margin pillow policy editor
    lead/[token]/             ← PUBLIC customer self-serve upload + instant quote (no auth, token-gated)
    api/analyze/              ← POST — rep flow, calls analyzeStatement() server-side
    api/proposal/             ← POST — rep flow, calls generateProposal() server-side
    api/lead/[token]/analyze/ ← POST — PUBLIC, dedicated route, returns ONLY CustomerSafeQuote
    api/auth/[...nextauth]/   ← NextAuth route handlers
  components/rep/
    UploadStep.tsx            ← drag-drop, calls /api/analyze
    AnalysisStep.tsx          ← 3-way fee split display
    PricingStep.tsx           ← model selector + margin slider; fetches role-scoped pricing from the server, never computes the true floor/cost itself
    ProposalStep.tsx          ← savings hero + PDF export via html2pdf in a new window
    ApplyStep.tsx             ← non-sensitive fields only (business, ownerContact, processing, agreement)
  components/customer/
    LeadUploadStep.tsx         ← public self-serve upload + CustomerSafeQuote result display
  components/dev/
    RoleSwitcher.tsx           ← DEBUG-ROLE-SWITCHER UI, only mounted when the env flag is on
scripts/
  seed-users.ts                ← seeds admin@aioapp.com / rep@aioapp.com (see credentials below)
  db.ts                        ← standalone (non-"server-only") Drizzle client, for scripts run via tsx
```

### To run v2
```bash
git checkout v2
cd app-v2
npm install
npx vercel link --scope aioapp1 --project aioeasyob     # if not already linked (Vercel project is "aioeasyob", NOT "aioratecalc")
npx vercel env pull .env.local                            # pulls DATABASE_URL etc.
# then add ANTHROPIC_API_KEY and AUTH_SECRET to .env.local by hand — vercel env pull
# only restores vars actually stored in the Vercel project, not local-only secrets
npx tsx scripts/seed-users.ts   # seeds admin@aioapp.com / rep@aioapp.com — see dev credentials below
npm run dev
```

**Dev login credentials** (seeded, not production-safe — rotate before this ever ships):
- Admin: `admin@aioapp.com` / `admin123`
- Rep: `rep@aioapp.com` / `rep123`
- Customer: `customer@aioapp.com` / `customer123`

**⚠️ `vercel integration add` / `vercel env pull` will overwrite `.env.local` wholesale**, wiping any local-only vars (like `ANTHROPIC_API_KEY`) that aren't stored in the Vercel project's env. Back up `.env.local` before running Vercel CLI commands that touch env vars.

**⚠️ Adyen (and any) API keys containing `$` MUST be `\$`-escaped in `.env.local`.** Next's `@next/env` runs `dotenv-expand`, so a raw `$AB` in a key value is silently expanded away (treated as a `${AB}` reference), corrupting the key and producing Adyen `401 Unauthorized`. Single/double quotes do NOT prevent this in `@next/env` — only backslash-escaping (`\$`) does. **In the Vercel project env UI, do the opposite: paste the RAW `$`** (Vercel stores values literally and does not run dotenv-expand; a `\$` there becomes part of the key and 401s). The Adyen LEM/Config keys map as: LEM test key → `ADYEN_LEM_API_KEY`, platform web service key → `ADYEN_CONFIG_API_KEY`, HMAC → `ADYEN_WEBHOOK_HMAC_KEY`.

### Phase status
| Phase | What | Status |
|---|---|---|
| 1 | Next.js scaffold + 5-step rep flow + localStorage | **DONE** (committed 2026-07-06) |
| 1.5 | Multi-role (Customer/Rep/Admin), Postgres, NextAuth, pillowed margin, customer self-serve lead flow | **DONE** (2026-07-06) |
| 2 | Adyen hosted onboarding (wire `adyen.ts` stub + webhook route) | **BUILT / in testing** — `adyen.ts` creates the legal-entity graph + mints onboarding links; webhook route exists; customer self-serve onboarding flow (`CustomerOnboardStep`, `saveMyApplicationOnboardingAction`) wired end-to-end. Onboarding links are single-use / ~4-min expiry, so `/customer/applications/[id]/continue` regenerates a fresh link per click via `createOnboardingLink()` — never re-serve a stored `adyenOnboardingUrl`. MCC→Adyen-industry-code mapping still a go-live TODO. |
| 3 | HubSpot bidirectional sync (wire `hubspot.ts` stub) | **NOT STARTED** |
| 4 | Merchant magic link email delivery (Resend) — link generation itself already exists from 1.5, just not auto-emailed | **NOT STARTED** |
| 5 | Real OAuth (Entra ID?) as a fast-follow to Credentials; optional DB session strategy | **NOT STARTED** |

### Critical constraints (do not reverse)
- `MerchantApplication` has **no SSN, bank account, routing number, or EIN fields** — Adyen collects those on their hosted page
- Pricing math (`MARGIN_REQS`, `derivePricing`) lives in `pricing.ts`, **not** in Claude prompts
- `generateProposal()` force-overrides any AI-returned numbers with locally computed `exactRates`/`exactProjected`
- HubSpot uses Private App Token — **no OAuth**
- All v2 work in `app-v2/` — **do not touch the root HTML files**
- **Reps never see the true margin floor or true Adyen cost** — always go through `derivePricingForRole`/`getPricingPreviewAction`, never `derivePricing` directly from a rep-facing client component
- `owner_user_id` (the rep who owns a deal, FK to `users.id`) and `ownerContact` (the merchant's own business contact person) are two different "owner" concepts — don't conflate them
- `customer_link_token`/`customer_link_purpose` is a **generalized, reusable** token slot: `"lead_upload"` (Phase 1.5, pre-analysis self-serve) and `"kyc_handoff"` (Phase 2, post-proposal Adyen KYC) are different moments in the deal lifecycle sharing the same field — don't assume a token is one or the other without checking `customer_link_purpose`
- `/api/lead/[token]/analyze` must only ever return `CustomerSafeQuote` — never the raw `StatementAnalysis` or any cost/margin field
- `ENABLE_DEBUG_ROLE_SWITCH` must never be set in a Vercel project environment — local `.env.local` only

### Env vars needed (per phase)
```
ANTHROPIC_API_KEY           # Phase 1 — required now
DATABASE_URL                # Phase 1.5 — Neon Postgres (+ several other PG*/POSTGRES_* vars, all Vercel-managed)
AUTH_SECRET                 # Phase 1.5 — NextAuth
ENABLE_DEBUG_ROLE_SWITCH    # Phase 1.5 — local dev only, never in Vercel project env
ADYEN_LEM_API_KEY           # Phase 2
ADYEN_COMPANY_ID            # Phase 2
ADYEN_ENVIRONMENT           # Phase 2 (test|live)
ADYEN_WEBHOOK_HMAC_KEY      # Phase 2
HUBSPOT_PRIVATE_APP_TOKEN   # Phase 3
RESEND_API_KEY              # Phase 4
NEXT_PUBLIC_BASE_URL        # Phase 1.5 — used to build the customer lead-link URL; keep in sync with actual dev port
```
