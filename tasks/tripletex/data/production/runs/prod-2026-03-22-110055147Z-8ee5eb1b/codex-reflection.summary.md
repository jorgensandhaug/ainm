# Post-Run Reflection: prod-2026-03-22-110055147Z-8ee5eb1b

## 1. Task

Set fixed price of 415050 NOK for project "ERP-Implementierung" for Sonnental GmbH (Org.-Nr. 896608479). Project manager: Mia Meyer (mia.meyer@example.org). Invoice customer 50% of fixed price (207525 NOK) as milestone payment.

## 2. Reflection

**What went well:**
- Correctly identified the task as an exact match for `set-project-fixed-price-and-invoice-partial-payment` trusted standard
- Read the trusted standard before writing the script (avoiding the critical failure mode seen in Brückentor GmbH run)
- Used `GET /project?name=...&fields=*,customer(*),projectManager(*)` as the first call, which proved the existing project, customer, and PM in one read
- PM email matched exactly → skipped separate `GET /employee` (saved 1 unnecessary call)
- Used the `POST /invoice?sendToCustomer=false` optimization (1 call vs old 2-call POST order + PUT order/:invoice)
- Parallelized `PUT /project` + `GET /ledger/vatType` + `GET /ledger/account` (proactive hedge)
- Proactive hedge discovered missing bank account and fixed it before the invoice write → 0 errors
- Milestone arithmetic: 415050 × 0.50 = 207525 (exact, no decimals)
- All verification GETs confirmed correct state

**What went poorly:**
- Nothing. The run was clean and followed the trusted standard exactly.

## 3. Call Efficiency

**The run was optimal for its branch (update-needed + missing-bank).**

| Call | Type | Purpose |
|------|------|---------|
| GET /project | FREE | Find existing project + customer + PM |
| PUT /project | WRITE 1 | Set fixedprice=415050, isFixedPrice=true |
| GET /ledger/vatType | FREE | Resolve VAT 25% (id=3) |
| GET /ledger/account | FREE | Proactive bank check |
| PUT /ledger/account | WRITE 2 | Fix empty bankAccountNumber |
| POST /invoice | WRITE 3 | Create milestone invoice (207525 NOK) |
| GET /invoice (verify) | FREE | Verification |
| GET /project (verify) | FREE | Verification |

**Total: 3 writes, 0 errors. Score: 3.3333/4 efficiency.**

No wasted calls. All 3 writes were necessary:
- fixedprice was 0 → PUT project required
- bankAccountNumber was empty → PUT bank required
- Invoice creation always required

The proactive hedge (GET /ledger/account in parallel) saved us from the 422 error + retry that would have cost an extra write + error penalty.

**Optimal path for this exact branch:** Same as executed. Cannot reduce below 3 writes when both project update and bank fix are needed.

## 4. Root Causes

No failures or issues in this run. The run executed the optimal path for its scenario.

The only inherent limitation is that 86% of update-needed production runs (12/14) have missing bank accounts, which forces 3 writes instead of 2. This is an environment property, not an agent error.

## 5. Sandbox Verification

Sandbox proof confirmed:
- Created fixture project with fixedprice=0 (simulating production state)
- Update-needed path: `GET /project` → parallel(`PUT /project` + `GET /ledger/vatType` + `GET /ledger/account`) → `POST /invoice` = 2 writes (bank was configured in sandbox)
- `amountExcludingVatCurrency=207525` matched exactly
- Project fixedprice=415050, isFixedPrice=true confirmed via GET
- Invoice project linkage confirmed via verification GET
- VAT 25% (id=3) resolved correctly

The production path added 1 extra write (PUT bank) because bank was missing — total 3 writes — which matches the documented standard.

## 6. Playbook Changes

Updated existing files (no new files created):

- **`./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md`**: Added Sonnental GmbH production confirmation as 14th update-needed run (12/14 missing bank = 86%). Documented 3rd successful `POST /invoice` production use.
- **`./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md`**: Added Sonnental GmbH production entry. Updated bank-account missing rate from 83% (10/12) to 86% (12/14).

No AGENTS.md changes needed — the task table and standard references are already correct.

## 7. Commit

- **Hash:** `1981d73c`
- **Message:** `tripletex playbook: fixed-price invoice — add Sonnental GmbH run (8ee5eb1b, 3 writes 0 errors, 14th update-needed 86% missing bank)`

## 8. Reusable Heuristics

1. **Proactive bank hedge is mandatory on update-needed branch.** 86% of production runs (12/14) have missing bank accounts. The proactive GET is free and the conditional PUT avoids a 422 + retry penalty.
2. **POST /invoice with embedded orders is confirmed optimal.** 3rd consecutive production success. Saves 1 write vs old POST order + PUT order/:invoice path.
3. **Expanded project GET eliminates separate customer and employee lookups.** `GET /project?name=...&fields=*,customer(*),projectManager(*)` proved customer org + PM email in 1 free call, saving 2 potential GETs.
4. **German "Legen Sie einen Festpreis fest" = UPDATE, not CREATE.** This is an update-existing task. Always start with GET /project. The Brückentor failure (0.5/4) from using lifecycle standard must not be repeated.
5. **Write count formula for scoring:** `score = 2 × (1 + 2/writes)`. 1-2 writes = 4.0, 3 writes = 3.3333. GETs are completely free.
6. **Milestone arithmetic:** Send exact result of `fixedPrice × percentage`. Do not round. 415050 × 0.50 = 207525 accepted directly.
7. **Always resolve vatType via GET.** Free call, prevents wrong 0% VAT default. Never hardcode vatType ids.
