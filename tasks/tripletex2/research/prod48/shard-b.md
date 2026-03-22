# Shard B — prod48 Audit

Analyzed 2026-03-22. Covers 8 production runs from 2026-03-21T22:45–22:49Z.

## Run Inventory

| # | Run ID | Prompt Language | Inferred Tripletex2 Task | API Calls | Errors | Outcome |
|---|--------|----------------|--------------------------|-----------|--------|---------|
| 1 | `5f57f4dd` | French | `18` — Reverse customer invoice payment | 2 | 0 | SUCCESS |
| 2 | `da65d456` | Spanish | `17` — Register customer invoice payment | 3 | 0 | SUCCESS |
| 3 | `e3fd9f40` | Norwegian (Bokmål) | `05` — Create project | 3 | 0 | SUCCESS |
| 4 | `a66e419b` | Norwegian (Bokmål) | `02` — Create supplier | 1 | 0 | SUCCESS |
| 5 | `124d9ed3` | English | `08` — Create and send invoice | 6 | 0 avoidable | SUCCESS |
| 6 | `b23d4cc2` | Norwegian (Nynorsk) | `06` — Create employee | 3 | 1 expected | SUCCESS |
| 7 | `3705040b` | German | `06` — Create employee | 3 | 1 expected | SUCCESS |
| 8 | `5cd19b53` | German | `29` — Full project lifecycle | 0 | N/A | TIMEOUT |

All submission scores were `ambiguous` — the attribution system could not isolate individual task contributions because runs overlapped in the leaderboard capture window.

---

## Per-Run Evidence

### Run 1 — `prod-2026-03-21-224517950Z-5f57f4dd`

**Prompt (French):**
> Le paiement de Étoile SARL (nº org. 943745862) pour la facture "Conseil en données" (33900 NOK HT) a été retourné par la banque. Annulez le paiement afin que la facture affiche à nouveau le montant impayé.

**Classification:** Task `18` (reverse customer invoice payment). Signal: "retourné par la banque" matches family router rule `18`.

**Execution:**
1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,...` → found invoice 2147573575, outstanding=0
2. `PUT /ledger/voucher/608891408/:reverse?date=2026-03-21` → 200, created reverse voucher 609194171

**Outcome:** 2-call canonical optimal path. Invoice restored to unpaid state.

**Leaderboard diff:** Legacy task IDs 17, 18, 29 got attempt increments. No best scores changed.

**Scripts:** `reverse-payment.ts` (production) + 4 sandbox verification scripts.

---

### Run 2 — `prod-2026-03-21-224618661Z-da65d456`

**Prompt (Spanish):**
> El cliente Olivares SL (org. nº 866946108) tiene una factura pendiente de 43300 NOK sin IVA por "Sesión de formación". Registre el pago completo de esta factura.

**Classification:** Task `17` (register customer invoice payment). Signal: unpaid customer invoice + register full payment, after ruling out `18` (no bank return) and `25` (no overdue/reminder) and `27` (no foreign currency).

**Execution:**
1. `GET /invoice?invoiceDateFrom=...&invoiceDateTo=...&count=1000&sorting=-invoiceDate&fields=*,...` → invoice 2147575475, outstanding=54125 (43300 + 25% VAT)
2. `GET /invoice/paymentType?count=1000&fields=*,...` → paymentType 28417664 ("Betalt til bank", debit 1920)
3. `PUT /invoice/2147575475/:payment?paymentDate=2026-03-21&paymentTypeId=28417664&paidAmount=54125` → 200, amountOutstanding=0

**Outcome:** 3-call canonical optimal path for register-payment. Full payment registered.

**Leaderboard diff:** Legacy task IDs 07, 08, 16, 18 got attempt increments. No best scores changed.

**Scripts:** `register-payment.ts` (production) + 1 sandbox verification script.

---

### Run 3 — `prod-2026-03-21-224636291Z-e3fd9f40`

**Prompt (Norwegian):**
> Opprett prosjektet "Implementering Nordhav" knyttet til kunden Nordhav AS (org.nr 957080138). Prosjektleder er Silje Ødegård (silje.degard@example.org).

**Classification:** Task `05` (create project). Signal: project + customer org number + PM email, no financial operations.

**Execution:**
1. `GET /customer?organizationNumber=957080138&count=10&fields=*` → customer 108446663 (Nordhav AS)
2. `GET /employee?email=silje.degard@example.org&assignableProjectManagers=true&count=10&fields=*` → employee 18683492
3. `POST /project` with `{ name: "Implementering Nordhav", startDate: "2026-03-21", customer: { id: 108446663 }, projectManager: { id: 18683492 } }` → 201, project 402043332

**Outcome:** 3-call canonical optimal path.

**Leaderboard diff:** Legacy task IDs 04, 07, 08, 16 got attempt increments. No best scores changed.

**Scripts:** `create-project.ts` (production) + 1 sandbox test (parallel resolve shortcut — didn't work).

---

### Run 4 — `prod-2026-03-21-224706888Z-a66e419b`

**Prompt (Norwegian):**
> Registrer leverandøren Tindra AS med organisasjonsnummer 888286195. E-post: faktura@tindra.no.

**Classification:** Task `02` (create supplier). Signal: supplier + org number + email.

**Execution:**
1. `POST /supplier` with `{ name: "Tindra AS", organizationNumber: "888286195", email: "faktura@tindra.no", invoiceEmail: "faktura@tindra.no" }` → 201, supplier 108446919

**Outcome:** 1-call canonical optimal path. Email correctly mirrored to `invoiceEmail` (the address pattern `faktura@...` is invoice-oriented).

**Leaderboard diff:** Legacy task IDs 04, 07, 08, 16 (identical to run 3 — timing overlap).

**Scripts:** `create-supplier.ts` (production) + 1 sandbox verification.

---

### Run 5 — `prod-2026-03-21-224726040Z-124d9ed3`

**Prompt (English):**
> Create and send an invoice to the customer Ironbridge Ltd (org no. 841254546) for 28500 NOK excluding VAT. The invoice is for System Development.

**Classification:** Task `08` (create and send invoice). Signal: "create and send" invoice, one service line.

**Execution:**
1. `GET /customer?organizationNumber=841254546&fields=*` → customer 108330336
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` → vatTypeId 3 (25%)
3. `POST /invoice?sendToCustomer=true` → **422** (bank account missing for company)
4. `GET /ledger/account?isBankAccount=true&fields=*` → found account 377193269
5. `PUT /ledger/account/377193269` → 200 (registered placeholder bankAccountNumber)
6. `POST /invoice?sendToCustomer=true` → 201, invoice 2147647390, 28500 excl / 35625 incl VAT

**Outcome:** 6 calls due to bank-account repair branch. The initial 422 is expected in fresh Tripletex sandboxes that lack a company bank account number. Not an avoidable error — the company state is discovered at write time.

**Leaderboard diff:** Legacy task IDs 01, 04, 06, 16 got attempt increments. No best scores changed.

**Scripts:** `create-and-send-invoice.ts` (production) + 1 sandbox investigation script.

---

### Run 6 — `prod-2026-03-21-224811817Z-b23d4cc2`

**Prompt (Nynorsk):**
> Me har ein ny tilsett som heiter Torbjorn Neset, fodd 14. November 1991. Opprett vedkomande som tilsett med e-post torbjrn.neset@example.org og startdato 11. February 2026.

**Classification:** Task `06` (create employee). Signal: employee + birthdate + email + start date, no attachment.

**Execution:**
1. `POST /employee?fields=*,employments(*)` → **422** ("department.id required")
2. `GET /department?isInactive=false&count=1&fields=*` → department 745136
3. `POST /employee?fields=*,employments(*)` (with department) → 201, employee 18683945

**Outcome:** 3 calls including 1 expected 422 (department repair branch). Dates correctly parsed: "14. November 1991" → 1991-11-14, "11. February 2026" → 2026-02-11.

**Leaderboard diff:** Legacy task IDs 01, 06 got attempt increments. No best scores changed.

**Scripts:** `create-employee.ts` (production) + 2 sandbox pre-read strategy tests.

**Strategy observation:** Sandbox scripts `sandbox-verify-preread.ts` and `sandbox-verify-full-preread.ts` test whether pre-reading department (Strategy B: 2 calls, 0 errors) is better than the current try-then-repair approach (3 calls, 1 error). This is the same pattern as Run 7.

---

### Run 7 — `prod-2026-03-21-224812254Z-3705040b`

**Prompt (German):**
> Wir haben einen neuen Mitarbeiter namens Hannah Becker, geboren am 31. January 1996. Bitte legen Sie ihn als Mitarbeiter mit der E-Mail hannah.becker@example.org und dem Startdatum 15. July 2026 an.

**Classification:** Task `06` (create employee). Signal: employee + birthdate + email + start date, no attachment.

**Execution:**
1. `POST /employee?fields=*,employments(*)` → **422** (department.id required)
2. `GET /department?isInactive=false&count=1&fields=*` → department 745170
3. `POST /employee?fields=*,employments(*)` (with department) → 201, employee 18683898

**Outcome:** Identical pattern to Run 6. 3 calls, 1 expected 422. Dates correctly parsed from German.

**Leaderboard diff:** Same as Run 6 (timing overlap): legacy task IDs 01, 06.

**Scripts:** `create-employee.ts` (production) + 2 sandbox pre-read strategy tests.

**Strategy observation:** Both Run 6 and Run 7 independently explored the same department pre-read optimization in sandbox. This is strong convergent evidence that the current task-06 strategy should switch from try-then-repair to pre-read.

---

### Run 8 — `prod-2026-03-21-224902627Z-5cd19b53`

**Prompt (German):**
> Fuhren Sie den vollstandigen Projektzyklus fur 'Datenplattform Grunfeld' (Grunfeld GmbH, Org.-Nr. 905570862) durch: 1) Das Projekt hat ein Budget von 275500 NOK. 2) Erfassen Sie Stunden: Mia Becker (Projektleiter, mia.becker@example.org) 35 Stunden und Marie Becker (Berater, marie.becker@example.org) 42 Stunden. 3) Erfassen Sie Lieferantenkosten von 23000 NOK von Sonnental GmbH (Org.-Nr. 850186332). 4) Erstellen Sie eine Kundenrechnung fur das Projekt.

**Classification:** Task `29` (full project lifecycle). Signal: four numbered lifecycle steps — budget + employee hours + supplier cost + invoice.

**Execution:**
1. Read `trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md` → success
2. Read `task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md` → success
3. Read `AGENTS.md` → **FAILED** (29992 tokens > 10000 token limit)

**No Tripletex API calls were made. Zero assistant messages generated. Agent timed out after ~10 minutes.**

**Outcome:** TIMEOUT FAILURE. The agent stalled during the documentation-reading phase. The combination of a 370+ line trusted standard, a long playbook, and the oversized AGENTS.md file consumed the agent's time budget before it could write or execute any script.

**Post-run artifact:** The reflection/sandbox pipeline later produced `run.ts` (253 lines implementing all 7 lifecycle steps), but this was never executed against the production token.

**Leaderboard diff:** Legacy task IDs 01, 02, 11, 12, 14, 17, 27, 29 — the widest diff of any shard-B run. The lifecycle task touches many entity types, so the scorer checked many task categories.

---

## Cluster-Level Conclusions

### 1. Task-Context Mapping Validation

All 8 prompts map cleanly to existing tripletex2 canonical task IDs. The family router in AGENTS.md would correctly classify every prompt in this shard:

| Prompt Signal | Router Rule Hit | Tripletex2 Task |
|---------------|-----------------|-----------------|
| "retourné par la banque" | High-confidence: `returned by bank` → 18 | `18` |
| unpaid invoice + register full payment | Simple payment fallback → 17 | `17` |
| project + customer org + PM email | Entity-creation: project → 05 | `05` |
| supplier + org number + email | Entity-creation: supplier → 02 | `02` |
| "Create and send" invoice | High-confidence: create AND send → 08 | `08` |
| employee + birthdate + email + start date | Entity-creation: employee → 06 | `06` |
| four numbered lifecycle steps | High-confidence: lifecycle → 29 | `29` |

**No mapping conflicts or stale semantics found in this shard.** The current task table and family router are accurate for all observed prompt patterns.

### 2. Legacy Label Hazard Confirmed

The leaderboard diffs use the legacy `tx_task_id` namespace (from the old scoring system). These do NOT correspond 1:1 to tripletex2 canonical IDs. Multiple legacy task IDs are incremented per run because:
- Runs overlap in time, so the leaderboard snapshot captures changes from multiple concurrent runs
- The legacy system's task attribution is separate from the tripletex2 classifier

This is already documented in AGENTS.md (lines 38-41) but the shard confirms the drift is real and ongoing.

### 3. Scoring System Gap

All 8 submission scores were `ambiguous`. Zero best scores improved across any leaderboard task. This batch provides no usable scoring signal for strategy optimization. The rapid-fire run pattern (8 runs in ~4 minutes) systematically defeats the attribution system.

### 4. Task 06 Department Pre-Read Pattern

Runs 6 and 7 both demonstrate the same department repair branch:
```
POST /employee → 422 (dept required) → GET /department → POST /employee (with dept) → 201
```
Result: 3 API calls, 1 expected error per run.

Both runs independently produced sandbox scripts testing a **pre-read strategy** (Strategy B):
```
GET /department → POST /employee (with dept) → 201
```
Result: 2 API calls, 0 errors.

This is convergent evidence from two independent agent sessions. The pre-read strategy reduces calls from 3→2 and eliminates the 422 error. Given that task 06 is the #1 priority in the focus band (score 1.4/2), this optimization is high-value.

### 5. Task 29 Timeout — AGENTS.md File Size Blocker

Run 8 timed out because the agent tried to read AGENTS.md (29992 tokens) and hit the Codex file-read limit (10000 tokens). The task 29 trusted standard alone is 370+ lines — when combined with the playbook and AGENTS.md, the documentation volume exceeds what the agent can process within the time budget.

**Root cause:** The AGENTS.md file has grown past the Codex tool's `max_tokens` for file reads. Task 29 is the most documentation-heavy task and is most affected.

**Potential fixes:**
- Split AGENTS.md into smaller files (classifier contract vs task table vs family router)
- Increase the Codex file-read token limit
- Make the task-29 trusted standard self-contained so AGENTS.md isn't needed during execution

### 6. Bank Account Repair (Task 08)

Run 5 hit the bank-account repair branch during invoice creation (422 → bank account missing → GET accounts → PUT account → retry POST). This is an expected pattern in fresh sandbox environments. The production script handles it correctly, but it doubles the call count (3 → 6). This is a known issue and not a strategy bug.

### 7. Multilingual Robustness

The shard covers 5 languages (French, Spanish, Norwegian Bokmål, Norwegian Nynorsk, German, English). All were handled correctly:
- Date parsing: "14. November 1991" (Nynorsk), "31. January 1996" (German) — both parsed correctly
- Amounts: "33900 NOK HT" (French excl-VAT), "43300 NOK sin IVA" (Spanish excl-VAT)
- Task signals: "retourné par la banque" (French) correctly matched to reverse-payment pattern

No classifier or extraction failures attributable to language.

---

## Suspected Mapping Corrections

**None required for this shard.** All 8 prompts align with their expected tripletex2 task definitions. The task table, family router, contrastive cues, and field schemas in AGENTS.md are accurate for the observed prompt patterns.

## Recommended Actions (from shard evidence)

1. **Task 06 — Switch to department pre-read strategy.** Both runs 6 and 7 provide convergent sandbox evidence that pre-reading department reduces calls from 3→2 and eliminates the 422 error. This is the top-priority focus-band task.

2. **Task 29 — Investigate AGENTS.md size blocker.** Run 8's timeout is caused by a tooling limitation (file-read token cap at 10000), not a strategy bug. The fix is environmental — either split AGENTS.md or make the trusted standard self-contained.

3. **Attribution system — Consider spacing runs.** All 8 submission scores were `ambiguous`. Spreading runs over longer time windows would allow the leaderboard diff to isolate individual task contributions.
