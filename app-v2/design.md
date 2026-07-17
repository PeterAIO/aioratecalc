# Design — ClearRate / AIO Rate Calculator (app-v2)

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

Extracted from the real AIO brand (aioapp.com) and refined through the admin
dashboard redesign (`src/app/admin/`). That page is the reference implementation —
when in doubt about how a rule applies, look at how it's built there.

## Genre

modern-minimal — internal B2B ops tool + a public lead-gen surface. Restrained,
confident, one accent used sparingly. No card-grid-of-stats, no boxed KPI tiles
(explicitly rejected during the admin redesign as a generic "AI dashboard" tell).

## Macrostructure families

- **App pages** (rep flow, admin, authenticated customer views): Stat-Led where a
  headline number matters — one dominant figure directly on the page, a plain-text
  ticker line for supporting numbers, no card shape. Tables/forms live in
  `.panel`-style surfaces (hairline border + whisper shadow), never nested boxes.
- **Auth pages** (login, customer login): a single centered card, minimal, no
  enrichment — the surface itself is the one allowed "box" on the whole system,
  since there's no dashboard content to compete with it.
- **Public lead-gen** (`/lead/[token]`, customer self-serve upload): same Stat-Led
  discipline as app pages once a quote is shown, but the page may open with a
  short, warmer editorial line (not a full marketing hero) before the upload step.
- **Exported documents** (the proposal PDF template in `ProposalStep.tsx`): out of
  scope for this pass — it's a standalone print document with its own light-theme
  palette already, not an app screen. Revisit separately if asked.

## Theme

Token names match what's already shipped in `admin.module.css` exactly — no renaming
when other pages adopt them.

```css
:root {
  --paper:         oklch(97.5% 0.006 32);
  --paper-2:       oklch(99%   0.003 32);
  --ink:           oklch(24%   0.012 32);
  --ink-2:         oklch(46%   0.012 32);
  --ink-3:         oklch(64%   0.010 32);
  --rule:          oklch(90%   0.010 32);

  --accent:        oklch(69% 0.170 32);   /* coral — fills */
  --accent-text:   oklch(52% 0.190 32);   /* coral — text-safe */
  --accent-2:      oklch(63% 0.140 278);  /* periwinkle — fills */
  --accent-2-text: oklch(48% 0.150 278);  /* periwinkle — text-safe */
  --focus:         oklch(63% 0.140 278);

  /* semantic status — same hues as the old dark theme, re-tinted for light paper.
     these encode meaning (approved/pending/error) — never repurpose as decoration */
  --success:      oklch(52% 0.140 150);
  --success-bg:   oklch(52% 0.140 150 / 0.12);
  --info:         oklch(55% 0.140 237);
  --info-bg:      oklch(55% 0.140 237 / 0.12);
  --warning:      oklch(60% 0.150 70);
  --warning-bg:   oklch(60% 0.150 70 / 0.12);
  --danger:       oklch(55% 0.190 25);
  --danger-bg:    oklch(55% 0.190 25 / 0.12);

  --nav-gradient: linear-gradient(135deg, oklch(63% 0.140 278 / 0.16), oklch(69% 0.170 32 / 0.16));
  --gradient:     linear-gradient(135deg, oklch(63% 0.140 278), oklch(69% 0.170 32));
}
```

## Typography

- **Display**: Coolvetica — AIO's real self-hosted display face, pulled from
  aioapp.com's own `/static/` assets. Weights available: 400 (Rg-Regular), 700
  (Rg-Bold), 800 (Hv-Regular). Files live at `public/fonts/coolvetica/`. Used for
  headline numbers, page titles, nav wordmark — never body copy.
- **Body**: Plus Jakarta Sans (Google Fonts). Poppins is AIO's literal brand body
  font but reads as an overused "AI-safe" default at this weight/roundness — Jakarta
  is the closest-voiced, less-generic sibling. Used for everything else: body text,
  labels, buttons, table cells, form inputs.
- Two families total — no outlier/mono face needed anywhere in this app.
- `font-variant-numeric: tabular-nums` on all money/count figures.

```css
@font-face {
  font-family: "Coolvetica";
  font-weight: 400; font-style: normal; font-display: swap;
  src: url("/fonts/coolvetica/CoolveticaRg-Regular.woff2") format("woff2");
}
@font-face {
  font-family: "Coolvetica";
  font-weight: 700; font-style: normal; font-display: swap;
  src: url("/fonts/coolvetica/CoolveticaRg-Bold.woff2") format("woff2");
}
@font-face {
  font-family: "Coolvetica";
  font-weight: 800; font-style: normal; font-display: swap;
  src: url("/fonts/coolvetica/CoolveticaHv-Regular.woff2") format("woff2");
}
/* Plus Jakarta Sans loaded via Google Fonts @import, weights 400/500/600/700/800 */

--font-display: "Coolvetica", "Plus Jakarta Sans", -apple-system, sans-serif;
--font-body:    "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

## Spacing

4-point named scale, shared everywhere:

```css
--space-3xs: 0.125rem; --space-2xs: 0.25rem; --space-xs: 0.5rem;  --space-sm: 0.75rem;
--space-md:  1rem;     --space-lg: 1.5rem;   --space-xl: 2.5rem;  --space-2xl: 4rem;
--space-3xl: 6rem;

--radius-sm: 12px; --radius-md: 16px; --radius-lg: 20px; --radius-pill: 999px;

--shadow-whisper: 0 1px 2px oklch(20% 0.01 32 / 0.05), 0 8px 24px oklch(20% 0.01 32 / 0.06);
```

## Motion

- Easing: `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` — never the browser default,
  never bounce/overshoot.
- Reveal: one-shot fade-up on primary content load (stat hero, list rows), never
  re-fires on scroll. Tab switches crossfade + a sliding pill indicator. Detail
  panels expand via `grid-template-rows: 0fr → 1fr`, never animate height directly.
- Respect `prefers-reduced-motion: reduce` everywhere — collapse to opacity-only,
  ≤150ms.
- Cap: 3 motion primitives per page, same as the admin build.

## Microinteractions stance

- Silent success — no "Saved!" toasts when the result is visible on screen.
- Focus rings: 2px solid `--focus` (periwinkle), instant, never animated in.
- Hover: background-tint shifts only. No scale, no glow, no `transition: all`.
- Button press: `transform: scale(0.97)` on `:active`.

## CTA voice

- **Primary action**: filled coral pill button (`--accent` bg, white text).
- **Secondary/ghost action**: `--paper` bg, `--ink-2` text,
  `--rule` border, pill radius.
- **Nav**: floating pill, `--gradient-nav` background wash, `--shadow-whisper`,
  dark ink text (not light-on-dark — the nav is light now, not the old navy).
- Copy: plain, specific, active voice. "Sign Out" not "Logout Session"; a control
  says exactly what happens.

## What pages MUST share

- The `--accent` / `--accent-2` pairing and the gradient-nav treatment.
- Coolvetica + Plus Jakarta Sans, at the weights declared above.
- The no-boxed-stat-card rule for any headline metric.
- Pill-shaped buttons and nav; `--radius-lg` (20px) panels for tables/cards.
- The 4pt spacing scale — no raw pixel margins in new code.

## What pages MAY differ on

- Which macrostructure family applies (see above) — an auth page's centered card
  is not a "boxed stat card" violation, it's the auth family's own allowed shape.
- Specific layout of a wizard step vs a dashboard vs a settings form.
- Whether a page carries the nav nav (public `/lead/[token]` has no rep/admin nav).

## Per-page allowances

- App pages (rep/admin/customer-authenticated): no enrichment, no marketing copy.
- Public lead-gen pages: may open with one warm editorial sentence before the
  upload step. No stock photography, no invented stats.
- Settings/form pages: typography + spacing only, no special treatment.

## Migration notes (from the pre-redesign dark theme)

The old system (`--bg #0a0f1e`, `--card #0f1628`, `--card-border #1e2d45`,
`--text #e2e8f0`, `--muted #64748b`, plus per-file duplicated hex literals in a
local `T` object on ~20 files) is being retired. Nothing in the current codebase
actually reads the old `globals.css` tokens via `var()` except `body` itself, so
replacing those tokens is low-risk — but every page currently hardcodes its own
copy of the old hex values in an inline `T`/`S` const, so each file needs its
`T` object (or equivalent) replaced with the new tokens, not just the CSS root.

Two components are near-duplicates of each other and should be redesigned in
lockstep so they don't drift: `ApplyStep.tsx` (rep) / `CustomerOnboardStep.tsx`
(customer), and `UploadStep.tsx` (rep) / `LeadUploadStep.tsx` (customer/public).

`PricingStep.tsx` and `AnalysisStep.tsx` use color as a data-encoding channel
(bar-chart segments, margin-floor pass/fail state) — restyle the containers and
type, but preserve which state maps to which semantic color
(`--success`/`--danger`/etc., not decorative reuse of the accent).

## Exports

See [`export-formats.md`](.hallmark/export-formats.md) equivalent if/when needed —
not generated yet for this project; `globals.css` is the canonical source for now.
