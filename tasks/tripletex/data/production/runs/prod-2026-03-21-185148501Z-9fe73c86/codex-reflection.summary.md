# Codex Reflection Summary

## Task

Create and send an invoice to customer Étoile SARL (org 976414284) for 20000 NOK excluding VAT. Description: "Heures de conseil". French prompt with `hors TVA` → taxed ex-VAT 25% branch.

## Reflection

The run correctly identified this as an exact match for the `create-and-send-customer-invoice` trusted standard and followed the canonical flow:

1. **POST /customer** (201) — created Étoile SARL with `invoiceSendMethod: "MANUAL"` ✓
2. **GET /ledger/vatType** (200) — resolved `vatType.id=3` at 25% ✓
3. **POST /invoice** (422) — **WASTED** — used wrong field name `unitCostPrice` instead of `unitPriceExcludingVatCurrency`
4. **POST /invoice** (422) — bank account repair branch triggered (expected conditional path)
5. **GET /ledger/account** (200) — found account 1920 ✓
6. **PUT /ledger/account** (200) — registered bank account number ✓
7. **POST /invoice** (201) — success: invoice #1, 20000 ex VAT, 25000 inc VAT ✓

What went well:
- Correctly identified `hors TVA` as taxed 25% branch, not 0%
- Direct POST /customer without pre-read
- Retained customer.id and vatType.id across the bank-account repair branch (improvement over the earlier Étoile SARL 2026-03-20 run)
- Bank account repair branch completed correctly

What went wrong:
- Used `unitCostPrice` instead of `unitPriceExcludingVatCurrency` — this field does not exist on the order-line schema and returns `422 Feltet eksisterer ikke i objektet.`
- The trusted standard's example payload (line 240 of playbook) clearly shows the correct field, but the agent wrote from memory instead of copying from the example

## Call Efficiency

**Not minimal.** The run used 7 calls with 2 errors (422s). The optimal path for this exact task shape (with bank-account repair) is **6 calls with 1 error** (the expected bank-account 422):

| # | Optimal Call | Status |
|---|-------------|--------|
| 1 | POST /customer | 201 |
| 2 | GET /ledger/vatType | 200 |
| 3 | POST /invoice | 422 (bank account — expected) |
| 4 | GET /ledger/account | 200 |
| 5 | PUT /ledger/account/{id} | 200 |
| 6 | POST /invoice | 201 |

**Wasted call:** Call #3 with `unitCostPrice` — completely avoidable by using the correct field name from the trusted standard example.

Without the bank-account repair branch, the optimal path is **3 calls, 0 errors**.

## Root Causes

1. **Wrong field name `unitCostPrice`**: The agent used a non-existent field name from general knowledge instead of copying the exact field from the trusted standard's example payload. The correct field is `unitPriceExcludingVatCurrency`. This is the only API field that sets the unit price on invoice order lines.

## Sandbox Verification

Sandbox re-check on 2026-03-21 confirmed:
- `unitCostPrice` → `422 Feltet eksisterer ikke i objektet.` (field does not exist)
- `unitPriceExcludingVatCurrency` → `201` success
- Sandbox VAT still only exposes code 6 (0%), so amounts match (20000/20000 in sandbox vs 20000/25000 in production with 25% VAT)

## Playbook Changes

Updated existing trusted standard and playbook (no new files created):

- `./trusted-standards/create-and-send-customer-invoice.md`:
  - Added pitfall: `unitCostPrice` does not exist; only `unitPriceExcludingVatCurrency` works
  - Added 6th production confirmation (Étoile SARL / 976414284 / 20000 / hors TVA, 7 calls 2 errors, optimal 6)
  - Added sandbox re-verification of the wrong vs correct field name

- `./task-playbooks/create-and-send-customer-invoice.md`:
  - Added constraint: correct order-line price field is `unitPriceExcludingVatCurrency`, not `unitCostPrice`
  - Added send-channel pitfall: do not use `unitCostPrice`

## Commit

- Hash: `c2ba59c7`
- Message: `tripletex playbook: create-and-send-customer-invoice — add unitCostPrice pitfall, 6th production confirmation (9fe73c86, Étoile SARL, 976414284, 7 calls 2 errors, optimal 6)`

## Reusable Heuristics

1. **Always use the exact field name from the trusted standard example payload.** Do not write order-line fields from memory. The only accepted price field on invoice order lines is `unitPriceExcludingVatCurrency`. The wrong name `unitCostPrice` wastes a 422 call every time.

2. **Bank-account repair is a conditional branch, not a bug.** When `POST /invoice` returns the bank-account 422, the optimal recovery is: GET bank accounts → PUT existing 1920 with `12345678903` → retry POST /invoice. Total: 6 calls instead of 3. Retain customer.id and vatType.id across the repair.

3. **French `hors TVA` = taxed ex-VAT 25% branch.** Select exact 25% from the filtered outgoing VAT result. Do not fall back to 0%.

4. **This run correctly retained state across the bank repair branch** (unlike the earlier 2026-03-20 Étoile SARL run that wasted 2 calls re-reading customer and vatType). The lesson from Fjelltopp AS was applied.

5. **The only mistake was a field-name error** — a pure knowledge gap that the trusted standard already documented in its example. Future agents should copy field names from the example, not recall them.
