# Pricing questions for Steve

Context: the rate calculator's money math is deterministic code (not the AI — the AI only
reads the statement and writes prose). A tester reported "the calculations were incorrect."
We traced the pipeline and found several places where the code makes an assumption that
needs a payments expert to confirm before we hardcode it. **We have NOT changed any pricing
logic yet** — these are open questions. Each item below says what the app does today and the
decision we need from you.

---

### 1. Interchange when the statement doesn't itemize it (biggest one)

Most statements (flat-rate / tiered) don't break out true interchange. Today, when interchange
isn't shown, the code sets **interchange = 0**. Every proposed AIO rate then comes out as roughly
`0 + our margin ≈ 0.80%` — which is below what interchange actually costs, so it's impossible, and
it makes projected savings look far bigger than they really are (e.g. a merchant paying 2.7%
appears to "save" ~1.9% of volume).

There's an unused constant in the code that looks like it was meant for exactly this:
**card-present ≈ 1.60%, card-not-present ≈ 2.05%**.

- **Q:** When a statement doesn't itemize interchange, what should we assume interchange is?
  Are 1.60% (CP) / 2.05% (CNP) the right blended numbers to build our rate on top of?
- **Q:** Should that estimate vary by merchant type (MCC / industry) or card mix, or is one
  blended pair good enough for a proposal?
- **Q:** Or would you rather we back into interchange from the merchant's own effective rate
  (effective rate minus a typical processor markup)?

### 2. How should "savings" be framed?

Today savings = (their current total monthly fees) − (our projected total monthly fees), where
our projected fees include the full interchange pass-through. For a merchant already on
interchange-plus, this can compute to ~$0 (or negative) because we're comparing full-cost to
full-cost — the only real difference is our markup vs. their markup.

- **Q:** Should "savings" be **their markup vs. our markup** (apples-to-apples on the margin),
  or **their all-in effective cost vs. our all-in effective cost**? These give very different
  numbers and change the whole proposal narrative.

### 3. Per-transaction and monthly fees — folded in or added on top?

The three pricing models treat fixed fees inconsistently. Flat-rate and 2-tier **fold** the
per-transaction fee and monthly fee into the margin; interchange-plus **adds them on top**. Same
inputs → different projected cost depending on model chosen.

- **Q:** For each model (flat, 2-tier, interchange-plus), should per-transaction and monthly
  fees be included on top of the rate, or absorbed into it? What's standard for how AIO quotes?

### 4. Default card-present / card-not-present split

When the statement doesn't state the CP/CNP mix, the code assumes **70% card-present / 30%
not-present**.

- **Q:** Is 70/30 a reasonable default, or should it depend on merchant type (e.g. restaurant
  vs. e-commerce)?

### 5. Default target margin

The pricing screen defaults the rep's target margin to **0.80%** (80 bps) over cost.

- **Q:** Is 0.80% the right starting point for a proposal, or should the default differ by
  volume tier / merchant type?

---

### Lower-priority / sanity-check items

- **Reconciliation tolerance:** if the AI-read effective rate and the one we compute from the
  dollar amounts differ by less than ~100 bps, we keep the AI's number. Is 100 bps too loose?
- **"Current markup" on tiered statements:** because we treat interchange as 0 on tiered
  statements (see #1), the "markup" we display equals the merchant's full effective rate, which
  overstates it. Fixing #1 fixes this too.

---

_Once Steve answers #1–#3 especially, these become concrete code changes. Nothing here is fixed
until we hear from him._
