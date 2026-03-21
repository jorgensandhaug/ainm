# Codex Reflection Summary

## Task
Set fixed price 228150 NOK on project "Melhoria de infraestrutura" for Horizonte Lda (org 804639764), PM Sofia Ferreira (sofia.ferreira@example.org). Invoice 50% milestone (114075 NOK) without sending.

## Reflection
The run executed the trusted standard exactly: update-needed branch with proactive bank-account hedge. The initial `GET /project` found the project with correct customer and PM already linked, but `fixedprice=0` and `isFixedPrice=false` — requiring `PUT /project`. The proactive hedge discovered invoice account 1920 with empty `bankAccountNumber` and fixed it before the invoice write, avoiding a `422`. No mistakes were made; the agent read the trusted standard, followed it precisely, and completed in 7 calls with 0 errors.

## Call Efficiency
**Minimal-call: YES** — 7 calls is the absolute minimum for the update-needed + missing-bank state.

Exact call sequence:
1. `GET /project?name=Melhoria+de+infraestrutura&count=50&fields=*,customer(*),projectManager(*)` — found project, proved customer+PM match, proved fixedprice=0
2. `PUT /project/401995275` — set fixedprice=228150, isFixedPrice=true
3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` — got VAT 25% (id=3)
4. `POST /order` — created order with 114075 milestone line
5. `GET /ledger/account?isBankAccount=true&fields=*` — proactive hedge, found bank missing
6. `PUT /ledger/account/{id}` — fixed bank account number
7. `PUT /order/402042041/:invoice?invoiceDate=2026-03-21&sendToCustomer=false` — created invoice

No wasted calls. No 4xx errors. The proactive hedge saved the run from an 8-call path with a 422.

Lower-call path for next agent on same task shape:
- If project already has correct fixedprice+PM → skip-PUT branch: **4 calls** (`GET /project` → `GET /ledger/vatType` → `POST /order` → `PUT /order/:invoice`)
- If project needs fixedprice update + bank configured → **6 calls**
- If project needs fixedprice update + bank missing → **7 calls** (this run)

## Root Causes
No errors or inefficiencies to diagnose. The run was optimal for its exact state.

The only uncontrollable cost was the missing bank account (1 extra call for GET + 1 for PUT), which occurs in 80% of update-needed production runs.

## Sandbox Verification
Persistent sandbox re-confirmed both branches with `228150 * 0.50 = 114075`:
- Update-needed proactive hedge: **6 measured calls** (bank was already configured from prior proofs): `GET /project` → `PUT /project` → `GET /ledger/vatType` → `POST /order` → `GET /ledger/account` (configured) → `PUT /order/:invoice`
- Skip-PUT branch: **4 measured calls**: `GET /project` → `GET /ledger/vatType` → `POST /order` → `PUT /order/:invoice`
- Both proof invoices returned `amountExcludingVatCurrency=114075`
- Sandbox exposed only outgoing VAT 0% (id=6); production exposed 25% (id=3) — both are correct per the trusted standard's "use whatever the filtered result returns" rule

## Playbook Changes
Updated existing files only (no new files created):
- `./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md` — added 10th production confirmation (Horizonte Lda / c9dc80e4), updated bank-account missing rate from 7/9 (78%) to 8/10 (80%) in Known Recovery Branches
- `./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md` — added 10th production confirmation, updated bank-account missing rate from 7/9 (78%) to 8/10 (80%) in Avoidable Mistakes

## Commit
- Hash: `5620ca59`
- Message: `tripletex playbook: set-project-fixed-price-and-invoice-partial-payment — add 10th production confirmation (c9dc80e4, Horizonte Lda / 804639764 / Melhoria de infraestrutura / sofia.ferreira@example.org / 228150 / 50%, 7 calls 0 errors); update bank-account missing rate to 8/10 (80%) across trusted standard and playbook`

## Reusable Heuristics
1. **Proactive bank-account hedge is overwhelmingly justified on update-needed branch**: 8/10 production runs (80%) had missing bank accounts; optimistic path would average 7.4 calls + 0.8 errors vs proactive hedge at 6.8 calls + 0 errors
2. **Skip-PUT branch stays optimistic**: no production run on the skip-PUT branch has ever hit the bank-account issue; adding the check would waste 1 call every time
3. **PM match from expanded project read saves a call**: `GET /project?...&fields=*,customer(*),projectManager(*)` proves both customer and PM in one read; no separate `GET /employee` needed when `projectManager.email` matches
4. **50% milestone on whole-number fixedprice is always exact**: `228150 * 0.50 = 114075` — no decimal rounding needed
5. **Portuguese prompts follow the same trusted standard**: language of the prompt does not affect the API path; extract facts (project name, org number, email, amount, percentage) and execute identically
