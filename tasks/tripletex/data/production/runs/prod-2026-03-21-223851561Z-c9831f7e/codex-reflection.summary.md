# Codex Reflection: prod-2026-03-21-223851561Z-c9831f7e

## 1. Task

German prompt: Set a fixed price of 292550 NOK for project "E-Commerce-Entwicklung" for Brückentor GmbH (Org. 800357314). Project leader is Felix Fischer (felix.fischer@example.org). Invoice the customer for 33% of the fixed price as a milestone payment.

## 2. Reflection

**What went well:**
- 0 API errors — all 10 calls returned 2xx
- Direct `POST /invoice?sendToCustomer=false` worked correctly (first production use for this task shape)
- Milestone arithmetic `292550 * 0.33 = 96541.5` accepted directly without rounding
- `projectInvoiceDetails.length=1` confirmed project-invoice linkage

**What went poorly:**
- **Critical task-matching failure**: the agent used the lifecycle create-from-scratch approach instead of the existing `set-project-fixed-price-and-invoice-partial-payment` trusted standard
- Created a NEW customer, employee, and project instead of finding and updating the pre-existing ones
- The scorer checks the ORIGINAL pre-existing project (which was never updated) — so fixedprice stayed 0, PM stayed unchanged, and invoice was linked to the wrong project
- Scored **0.5/4** (3/4 checks failed)

**Why it happened:**
- The German prompt "Legen Sie einen Festpreis fest" was interpreted as "create a new fixed-price project" instead of "set/update the fixed price on an existing project"
- The agent didn't recognize the task pattern (project name + customer org + PM email + fixedprice + milestone %) as matching the fixed-price standard
- Historical evidence (12+ production runs) shows this task shape ALWAYS has pre-created project/customer/PM — creating from scratch is always wrong

## 3. Call Efficiency

**Production run: 10 calls, 0 errors — but on WRONG entities**

| Step | Calls | What happened |
|------|-------|---------------|
| 1 | 3 | GET dept + POST customer + GET assignable PM (parallel) |
| 2 | 2 | POST employee + POST project (parallel) |
| 3 | 3 | POST participant + GET vatType + GET account (parallel) |
| 4 | 1 | PUT bank fix |
| 5 | 1 | POST invoice |
| **Total** | **10** | **0 errors, but wrong approach** |

**Optimal path (using correct trusted standard):**

| Step | Calls | What should have happened |
|------|-------|--------------------------|
| 1 | 1 | GET /project?name=E-Commerce-Entwicklung&fields=*,customer(*),projectManager(*) |
| 2 | 3 | PUT /project + GET /ledger/vatType + GET /ledger/account (parallel) |
| 3 | 0-1 | Conditional bank fix |
| 4 | 1 | POST /invoice?sendToCustomer=false |
| **Total** | **5-6** | **0 errors, correct entities** |

**Wasted calls: 4-5** (POST customer, POST employee, POST project, POST participant, GET department — all unnecessary because entities already existed)

## 4. Root Causes

1. **Task-matching failure**: The agent didn't recognize the German prompt as matching the `set-project-fixed-price-and-invoice-partial-payment` trusted standard. The signals were:
   - "Legen Sie einen Festpreis fest" = "set a fixed price" (UPDATE signal)
   - "Projektleiter ist Felix Fischer" = "the project leader IS" (already assigned)
   - No mention of creating employees, registering hours, or supplier costs
   - These are all UPDATE signals, not CREATE signals

2. **Wrong standard selected**: The lifecycle standard (`register-project-lifecycle-budget-hours-cost-and-invoice`) was implicitly used — its "Do Not Use" section says "the prompt is really a fixed-price update/billing task rather than a fresh project-lifecycle create task", but the agent didn't check this.

3. **Assumption of empty account**: The agent assumed a fresh account has nothing pre-created. For this task family, the project/customer/PM are ALWAYS pre-created.

## 5. Sandbox Verification

Two sandbox tests confirmed the correct paths with direct `POST /invoice`:

**Update-needed path (5 calls):**
```
GET /project → parallel(PUT /project + GET /ledger/vatType + GET /ledger/account) → POST /invoice
```
- Returned `amountExcludingVatCurrency=96541.5` with `projectInvoiceDetails.length=1`

**Skip-PUT path (3 calls):**
```
GET /project → GET /ledger/vatType → POST /invoice
```
- Returned `amountExcludingVatCurrency=96541.5` with `projectInvoiceDetails.length=1`

Both confirm `POST /invoice?sendToCustomer=false` replaces the old 2-call `POST /order` + `PUT /order/:invoice` path.

## 6. Playbook Changes

**Updated existing files (no new files created):**

| File | Change |
|------|--------|
| `trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md` | Added sandbox verification of POST /invoice for both update-needed (5 calls) and skip-PUT (3 calls) paths |
| `task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md` | Added c9831f7e production failure documentation + sandbox verification of POST /invoice canonical counts |
| `AGENTS.md` | Updated trusted-standards and task-playbooks table entries to include disambiguation hints: "NO hours, NO supplier cost — use THIS not lifecycle" for fixed-price standard; "NOT for fixed-price + milestone-only tasks" for lifecycle standard |

**Prior scoring reflection also updated:**
- `trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md` — added CRITICAL task-matching section at top
- `trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md` — added guard clause in "Do Not Use" section
- `task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md` — added CRITICAL warning in Avoidable Mistakes

## 7. Commit

```
458b104b tripletex playbook: set-project-fixed-price — add 13th production confirmation (c9831f7e, German prompt, Brückentor GmbH / 800357314 / E-Commerce-Entwicklung / Felix Fischer / 292550 / 33%); sandbox-verified POST /invoice direct path (update-needed=5 calls, skip-PUT=3 calls); updated AGENTS.md task pattern descriptions to disambiguate fixed-price vs lifecycle standards
```

## 8. Reusable Heuristics

1. **Task matching is the #1 priority**: Before writing any code, verify which trusted standard matches. The signals are: does the prompt mention creating employees, hours, or supplier costs? If NO → use `set-project-fixed-price-and-invoice-partial-payment`. If YES → use `register-project-lifecycle-budget-hours-cost-and-invoice`.

2. **"Set a fixed price" = UPDATE, not CREATE**: In all supported languages (nb/en/es/pt/nn/de/fr), the phrase "set a fixed price" means updating an existing project. The project, customer, and PM are always pre-created for this task shape.

3. **Always start with GET /project**: For this task family, the first call must be `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)`. This proves: (a) the project exists, (b) the customer is linked, (c) the PM email matches, (d) whether `fixedprice` needs updating.

4. **POST /invoice > POST /order + PUT /order/:invoice**: Direct `POST /invoice?sendToCustomer=false` with embedded `orders[]` replaces the 2-call path, saving 1 call on every branch. Canonical counts: skip-PUT=3, update-needed+configured=5, update-needed+missing=6.

5. **Language parsing matters**: German "Legen Sie einen Festpreis fest" = "set a fixed price" (update); "Projektleiter ist" = "the project leader IS" (already assigned). These are UPDATE signals. Similarly: nb "Sett en fastpris", pt "Defina um preço fixo", es "Establezca un precio fijo", fr "Fixez un prix forfaitaire".
