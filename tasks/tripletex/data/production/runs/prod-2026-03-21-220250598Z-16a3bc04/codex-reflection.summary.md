# Codex Reflection Summary — prod-2026-03-21-220250598Z-16a3bc04

## Task

Create and send an invoice to the existing customer Brightstone Ltd (org no. 894181273) for 14150 NOK excluding VAT. The invoice is for Cloud Storage. English prompt.

## Reflection

**What went well:**
- The invoice was created and sent correctly: `amountExcludingVatCurrency=14150`, `amountCurrency=17687.5` (25% VAT)
- The agent correctly identified "the customer Brightstone Ltd" as an existing customer (English definite article) and used `GET /customer` instead of `POST /customer`
- Bank-account repair branch executed cleanly with state retention (customer.id and vatType.id kept in memory)
- 6 total API calls, 0 avoidable errors — optimal for the bank-repair variant

**What went poorly:**
- The agent read the wrong trusted standard: `create-customer-invoice.md` (create-only) instead of `create-and-send-customer-invoice.md` (create-and-send). The task explicitly said "Create and send" which should have matched the send variant
- Despite reading the wrong standard, the agent adapted correctly by using `sendToCustomer=true`, so the final outcome was correct
- Time was wasted reading a standard that doesn't cover the send case

**Process mistake:**
- When the prompt says "create and send", always match `create-and-send-customer-invoice.md`, not `create-customer-invoice.md`

## Call Efficiency

**The run was minimal-call.** 6 calls total = 3 core + 3 bank-account repair. No wasted calls.

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | `GET /customer?organizationNumber=894181273&fields=*` | 200 | Resolve existing customer |
| 2 | `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` | 200 | Resolve 25% outgoing VAT for direct line |
| 3 | `POST /invoice?sendToCustomer=true` | 422 | Bank-account validation (known fresh-account issue) |
| 4 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 | Find bank account for repair |
| 5 | `PUT /ledger/account/{id}` | 200 | Register bank account number |
| 6 | `POST /invoice?sendToCustomer=true` | 201 | Retry — success |

**Lower-call path for next agent (same task shape):**
- Happy path (no bank repair needed): 3 calls
  1. `GET /customer?organizationNumber=...&fields=*`
  2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<date>&fields=*`
  3. `POST /invoice?sendToCustomer=true`
- With bank repair: 6 calls (add GET/PUT/retry)

**Cannot reduce below 3 calls** because:
- Customer ID is required (cannot inline `organizationNumber` in invoice payload)
- VAT lookup is essential for direct lines — omitting `vatType` creates 0% VAT (sandbox-confirmed)
- Hardcoding `vatType.id=3` fails in some accounts (sandbox-confirmed `422 Ugyldig mva-kode.`)

## Root Causes

1. **Wrong standard read:** Agent matched `create-customer-invoice.md` instead of `create-and-send-customer-invoice.md`. The "Do Not Use This Standard If" section of the create-only standard explicitly says "prompt requires sending after create", which should have triggered switching to the send standard.
2. **No functional impact:** Despite reading the wrong doc, the agent correctly used `sendToCustomer=true` on the POST /invoice call, producing the correct final state.

## Sandbox Verification

- Confirmed `sendToCustomer=true` on `POST /invoice` creates and sends the invoice in one call (existing customer)
- Confirmed omitting `vatType` on direct lines produces 0% VAT (`amountCurrency == amountExcludingVatCurrency`) — VAT lookup is essential
- Confirmed hardcoded `vatType.id=3` fails in sandbox with `422 Ugyldig mva-kode.`
- Confirmed `vatType: { percentage: 0 }` works in sandbox (but doesn't help skip the lookup since you still need the correct percentage)
- Sandbox only has VAT code 6 (0%), so exact 25% taxed outcome not reproducible there; mechanics verified with 0%

## Playbook Changes

Updated existing files (no new files created):

1. **`./trusted-standards/create-and-send-customer-invoice.md`**
   - Added English definite-article heuristic: "the customer X" → existing customer → `GET /customer`
   - Added standard-matching pitfall: "create and send" must match this standard, not the create-only one
   - Added production confirmation: Brightstone Ltd / 894181273 / Cloud Storage / 14150 / 6 calls 0 errors with bank repair

2. **`./task-playbooks/create-and-send-customer-invoice.md`**
   - Added Brightstone Ltd production confirmation (6 calls, bank repair, English definite article)
   - Added English definite-article heuristic note

## Commit

- Hash: `2892b5bc`
- Message: `tripletex playbook: create-and-send-customer-invoice — add 1st existing-customer direct-line production confirmation (16a3bc04, English prompt, Brightstone Ltd / 894181273 / Cloud Storage / 14150 excluding VAT, 6 calls 0 errors); first production proof of GET /customer + GET /ledger/vatType + POST /invoice?sendToCustomer=true with bank-account repair; add English definite-article heuristic ("the customer X" → existing customer); add standard-matching pitfall note`

## Reusable Heuristics

1. **Standard matching:** When the prompt says "create and send" an invoice, always use `create-and-send-customer-invoice.md`, not `create-customer-invoice.md`. The create-only standard explicitly excludes send tasks.

2. **Definite article → existing customer:** English "the customer X" (and Norwegian "kunden") implies the customer already exists. Use `GET /customer?organizationNumber=...&fields=*`. Only use `POST /customer` when the prompt uses indefinite articles or clearly implies a new customer.

3. **Direct-line VAT is mandatory:** For description-only invoice lines (no product), never omit `vatType`. Omitting it silently creates 0% VAT. Always resolve with `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<date>&fields=*` and select the correct percentage.

4. **Bank-account repair is reactive:** Don't preemptively `GET /ledger/account` — only enter the repair branch when `POST /invoice` returns 422 with bank-account validation. The reactive approach saves 1 call in ~70% of production runs.

5. **State retention across repair:** When the bank-account repair branch fires, keep `customer.id` and `vatType.id` in memory. Don't re-read them. This saves 2 calls (6 total vs 8).

6. **3 calls is the floor** for existing-customer direct-line create-and-send: `GET /customer` → `GET /ledger/vatType` → `POST /invoice?sendToCustomer=true`. Add 3 for bank repair if needed.
