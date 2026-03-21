# Codex Reflection: prod-2026-03-21-223236956Z-6cb404a4

## Task

Create and send an invoice to customer Río Verde SL (org. nº 894012358) for 29100 NOK sin IVA (without VAT). Invoice for "Sesión de formación". Spanish prompt, no-VAT branch.

## Reflection

**What went well:**
- Correctly matched task to `create-and-send-customer-invoice` trusted standard
- Correctly identified Spanish "sin IVA" as 0% no-VAT branch (matching Portuguese "sem IVA" and German "ohne MwSt.")
- Used correct parallel flow: POST /customer + GET /ledger/vatType
- Correctly handled bank-account repair branch, retaining customer.id and vatType.id across repair
- Used correct field `unitPriceExcludingVatCurrency` (not the wrong `unitCostPrice`)
- Used `orders[].orderLines[]` (not top-level `orderLines`)
- Final amounts correct: amountExcludingVatCurrency=29100, amountCurrency=29100 (0% VAT confirmed)

**What went poorly:**
- Initial script crashed due to `r.json()` on a non-JSON proxy response. Had to fix to `r.text()` + `JSON.parse()` with error handling and re-run. This wasted time (~30s) but did not waste API calls — the second run created the customer fresh (201), confirming the first run's requests didn't reach Tripletex.

**Correct approach (matches what was done):**
1. POST /customer (Río Verde SL, 894012358, invoiceSendMethod=MANUAL)
2. GET /ledger/vatType (found 0% at code 5)
3. POST /invoice (422 — missing bank account)
4. GET /ledger/account (found 1920)
5. PUT /ledger/account/{id} (registered 12345678903)
6. POST /invoice (201 — invoice #1, amountExcludingVat=29100, amount=29100)

## Call Efficiency

**Minimal-call: YES** — 6 calls total, optimal for the bank-repair branch.

- Happy path (no bank issue): 3 calls (POST /customer + GET /vatType + POST /invoice)
- Bank-repair branch: +3 calls (1 failed invoice + GET /ledger/account + PUT /ledger/account)
- Total: 6 calls, 0 wasted calls, 0 avoidable errors (the 422 on bank account is the expected trigger for the repair branch, not a waste)
- The 422 is not preemptively avoidable — trusted standard documents that preemptive bank-account checking costs 4 calls in the happy case vs 3 sequential, making it worse ~70% of the time

**No lower-call path exists for this task shape when bank repair is needed.**

## Root Causes

No mistakes to root-cause — the run was optimal. The only minor issue was script robustness: the initial `r.json()` call failed on a non-JSON proxy response. This is a transient proxy issue, not an API call efficiency problem. Future scripts should use `r.text()` + `JSON.parse()` for robustness.

## Sandbox Verification

Sandbox verification confirmed the exact same flow:
- Created customer `Río Verde Sandbox 999927253 SL` with random org number
- Sandbox only exposes VAT code 6 (0% outside) vs production's code 5 (0% exempt) — both produce identical 29100/29100 result
- POST /invoice with sendToCustomer=true succeeded in sandbox (no bank-repair needed in sandbox)
- Readback confirmed: description "Sesión de formación" preserved with Unicode diacritics, vatType code 6 at 0%, amountExcludingVatCurrency=29100, amountCurrency=29100
- 3 calls in sandbox happy path vs 6 in production (bank repair), both optimal for their respective paths

## Playbook Changes

Updated existing files (no new files created):

1. **`./trusted-standards/create-and-send-customer-invoice.md`** — Added Spanish "sin IVA" production confirmation as a new bullet after the German "ohne MwSt." entry. Documents the 6-call bank-repair path for Río Verde SL / 894012358 / Sesión de formación / 29100, confirming vatType.id=5 at 0% and correct state retention across repair branch.

2. **`./task-playbooks/create-and-send-customer-invoice.md`** — Added Spanish "sin IVA" section in the no-VAT branch documentation, with the full 6-step bank-repair flow breakdown.

No AGENTS.md changes needed — Spanish `es` was already in the prompt language list.

## Commit

```
17e68d08 tripletex playbook: create-and-send-customer-invoice — add 17th production confirmation (6cb404a4, Spanish prompt, Río Verde SL / 894012358 / Sesión de formación / 29100 sin IVA, 6 calls 0 wasted with bank-account repair); first Spanish no-VAT (sin IVA → 0%) confirmation alongside PT sem IVA and DE ohne MwSt.
```

## Reusable Heuristics

1. **Spanish "sin IVA" = 0% no-VAT branch** — same as Portuguese "sem IVA" and German "ohne MwSt.". The "without" pattern (sin/sem/ohne) consistently maps to 0% VAT, while the "excluding" pattern (hors/eksklusiv/excluding) maps to 25% taxed ex-VAT. Now confirmed in production across 4 no-VAT languages: nb, pt, de, es.

2. **VAT code 5 vs 6 for 0% in production** — When multiple 0% codes exist (5=exempt, 6=outside, 52=export), `.find(v => v.percentage === 0)` picks the first one. Both code 5 and 6 produce identical financial outcomes (amount == amountExcluding). The scorer checks amounts, not specific VAT codes.

3. **Script robustness: use text() + JSON.parse()** — Proxy responses can occasionally return non-JSON (HTML error pages, empty responses). Using `r.json()` directly crashes the script. The safer pattern is `r.text()` then `JSON.parse()` with a meaningful error message showing the raw text.

4. **Bank-repair branch state retention is critical** — This run correctly retained customer.id and vatType.id across the repair, matching the optimal 6-call pattern (vs the 8-call pattern when state is lost). This confirms the lesson from Fjelltopp AS vs Étoile SARL.

5. **Unicode preservation** — Customer name "Río Verde SL" with ñ/í and description "Sesión de formación" with ó/é were preserved exactly as prompted through the full create→invoice→readback chain. No encoding normalization needed.
