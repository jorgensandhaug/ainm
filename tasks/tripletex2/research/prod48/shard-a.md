# Shard A — prod48 Audit

Analyzed 8 production runs from 2026-03-21 22:41–22:47 UTC.

## Per-Run Evidence

### Run 1: prod-2026-03-21-224100599Z-9f9c4770

| Field | Value |
|-------|-------|
| Prompt language | Nynorsk |
| Prompt | "Køyr løn for Brita Berge (brita.berge@example.org) for denne månaden. Grunnløn er 36800 kr. Legg til ein eingongsbonus på 14100 kr i tillegg til grunnløna." |
| Leaderboard tx_task_id | ambiguous (03, 05, 07, 12 all changed); task 12 +1 attempt |
| Inference status | `ambiguous` (candidate_count=2) |
| Score | Not attributable (still processing at capture time) |
| Scripts | `run-payroll.ts`, 6 sandbox experiments (`sandbox-prove-8call-path.ts`, `sandbox-test-amountGross.ts`, etc.) |
| Call count | 9 calls, 0 errors |

**Semantic match:** Task 12 — "Run payroll with bonus." Base salary + one-time bonus. Exact match.

**No mapping conflict.** Consistent with current tripletex2 task-12 definition (tx_task_id 12 = run-payroll-with-bonus).

**Critical bug discovered:** Voucher postings used `amount` field which the API silently stores as 0. The correct fields are `amountGross`/`amountGrossCurrency`. The script created salary transaction correctly (gross 50900 = 36800 + 14100) but the voucher had all posting amounts = 0. This likely caused check 5 (ledger entries) to fail.

**API call detail:** Employee lookup → division creation → employee DOB repair → employment creation → salary type resolution → voucher type resolution → account resolution → salary transaction → voucher posting. Steps 2–3 and 5–7 ran in parallel.

**Wasted call:** GET /ledger/voucherType could be eliminated by using `voucherType: { name: "Lonnsbilag" }` inline (confirmed in other production runs).

---

### Run 2: prod-2026-03-21-224127364Z-a3d75a03

| Field | Value |
|-------|-------|
| Prompt language | Nynorsk |
| Prompt | "Opprett tre avdelingar i Tripletex: 'Produksjon', 'Kvalitetskontroll' og 'HR'." |
| Leaderboard tx_task_id | **05** |
| Inference status | `unique_attempt_delta` (unambiguous) |
| Score | 7/7 raw, correctness 1.0, normalized 2.0 (max) |
| Checks | 3/3 passed |
| Scripts | `create-departments.ts` — single POST /department/list batch |
| Call count | 1 call, 0 errors |

**Mapping conflict: CRITICAL.** The leaderboard unambiguously attributed this run to tx_task_id **05** with a perfect 7/7 score. The prompt creates **departments**. But `tasks/tripletex2` maps task 05 to **"Create project"** and task 03 to **"Create department."** This confirms the 03/05 swap documented in the task-mapping-audit.

**Efficiency:** Theoretical minimum call count achieved (1 batch POST). The agent read `trusted-standards/create-department.md`, identified exact match, wrote a single-call batch script.

---

### Run 3: prod-2026-03-21-224158753Z-2f5da463

| Field | Value |
|-------|-------|
| Prompt language | Portuguese |
| Prompt | "O cliente Luz do Sol Lda (org. no 939210970) tem uma fatura pendente de 23900 NOK sem IVA por 'Manutencao'. Registe o pagamento total desta fatura." |
| Leaderboard tx_task_id | ambiguous (05, 07, 12 all changed); task 07 +1 attempt |
| Inference status | `ambiguous` (candidate_count=2) |
| Score | Not attributable (still processing at capture time) |
| Scripts | `register-payment.ts`, `sandbox-explore-2call.ts` |
| Call count | 3 calls, 0 errors |

**Semantic match:** Task 17 (canonical) — "Register customer invoice payment." Find outstanding invoice, resolve payment type, register full payment.

**Mapping support:** Leaderboard shows task 07 +1 attempt for an invoice-payment operation. This is consistent with the mapping-audit finding that tx_task_id 07 = "Register customer invoice payment" (our canonical task 17). The ambiguity is from concurrent runs.

**Key implementation detail:** The script correctly used the **live outstanding amount** (29875 NOK, including VAT) rather than the prompt's ex-VAT amount (23900 NOK) for the payment. Using the prompt amount would have resulted in a partial payment.

**Efficiency:** 3 calls (GET invoice → GET paymentType → PUT payment) is the proven minimum for standalone invoice payment. 14th consecutive production confirmation of this 3-call path.

---

### Run 4: prod-2026-03-21-224235285Z-07d50494

| Field | Value |
|-------|-------|
| Prompt language | French |
| Prompt | "Enregistrez 16 heures pour Camille Dubois (camille.dubois@example.org) sur l'activite 'Design' du projet 'Mise a niveau systeme' pour Ocean SARL (no org. 953748460). Taux horaire : 1300 NOK/h. Generez une facture de projet au client basee sur les heures enregistrees." |
| Leaderboard tx_task_id | ambiguous (01, 04, 07, 08, 09, 12, 16, 17, 18, 29 all changed) |
| Inference status | `ambiguous` (candidate_count=3) |
| Score | Not attributable (still processing at capture time) |
| Scripts | `run.ts`, `sandbox-parallel-test.ts`, `sandbox-verify.ts` |
| Call count | 12 calls, 0 errors |

**Semantic match:** Task 15 (canonical) — "Register project hours and create project invoice." Single employee, hourly rate, project activity, create-from-scratch variant. NOT task 29 (no numbered lifecycle steps, no supplier cost, no budget, single employee).

**No direct mapping conflict** from this run (ambiguous attribution). But the classifier must distinguish:
- **Task 15:** Single employee, register hours + project invoice. No supplier cost, no numbered steps.
- **Task 29:** Full lifecycle with 4 numbered steps: budget + hours (2+ employees) + supplier cost + invoice.

**Implementation notes:**
- 12 API calls: dept → customer → PM → employee → project → activity + participant → timesheet + bank fix → invoice
- Steps 1–5 used aggressive parallelization (5 parallel, then 2 parallel, then 2 parallel)
- **Known pitfall:** Omitted `isFixedPrice: true` and `fixedprice: 20800` from POST /project. May hurt scoring if scorer checks project-level budget fields.
- **Minor issue:** Split 16h into 7.5+7.5+1.0 across 3 dates when a single 16h entry would work (API max 24h/entry). Didn't cost extra calls (single batch POST /timesheet/entry/list).
- Agent read wrong standard (`register-project-lifecycle-budget-hours-cost-and-invoice.md` — the T29 standard) instead of the correct one (`register-project-hours-and-create-project-invoice.md` — the T15 standard).

---

### Run 5: prod-2026-03-21-224251957Z-c70259c2

| Field | Value |
|-------|-------|
| Prompt language | English |
| Prompt | "Register the supplier Oakwood Ltd with organization number 887507295. Email: faktura@oakwoodltd.no." |
| Leaderboard tx_task_id | **04** |
| Inference status | `unique_attempt_delta` (unambiguous) |
| Score | 6/6 raw, correctness 1.0, normalized 2.0 (max) |
| Checks | 4/4 passed |
| Scripts | `create-supplier.ts`, `sandbox-verify-supplier.ts` |
| Call count | 1 call, 0 errors |

**Mapping conflict: CRITICAL.** The leaderboard unambiguously attributed this run to tx_task_id **04** with a perfect 6/6 score. The prompt creates a **supplier**. But `tasks/tripletex2` maps task 04 to **"Create product"** and task 02 to **"Create supplier."** This confirms the mapping-audit finding that tx_task_id 04 = supplier (our canonical task 02).

**Efficiency:** 1 API call (single POST /supplier), theoretical minimum. Agent read `trusted-standards/create-supplier.md`, exact match, single-call script.

**API detail:** POST /supplier payload included both `email` and `invoiceEmail` set to `faktura@oakwoodltd.no`. All 4 checks passed: supplier exists, correct name, correct org number, correct email.

---

### Run 6: prod-2026-03-21-224323667Z-f1d7b5dd

| Field | Value |
|-------|-------|
| Prompt language | English |
| Prompt | "We have a new employee named Charles Walker, born 21. January 1999. Please create them as an employee with email charles.walker@example.org and start date 23. December 2026." |
| Leaderboard tx_task_id | ambiguous (01, 04, 09 all changed); task 01 most likely from timing |
| Inference status | `ambiguous` |
| Score | Nearby completed submission scored 8/8 raw, normalized 1.4/2.0 (ambiguous attribution) |
| Scripts | `create-employee.ts`, `sandbox-preread-both.ts`, `sandbox-preread-strategy.ts` |
| Call count | 3 calls, 1 error |

**Semantic match:** Task 06 (canonical) — "Create employee." Birth date, email, start date. Exact match.

**Mapping support:** Leaderboard shows task 01 likely +1 attempt for an employee-creation operation. This is consistent with the mapping-audit finding that tx_task_id 01 = "Create employee" (our canonical task 06).

**Implementation issue:** Agent used "optimistic POST" strategy — attempted POST /employee without department, got 422 (`department.id: Feltet ma fylles ut`), then did GET /department + retry POST. This cost 3 calls instead of the optimal 2 (pre-read department + POST).

**Post-run learning:** Reflection updated the trusted standard to switch to department pre-read strategy (break-even crossed at 56% department-required rate). Commit `b5f39b62` updated AGENTS.md, trusted-standards/create-employee.md, task-playbooks/create-employee.md.

---

### Run 7: prod-2026-03-21-224412365Z-33209af0

| Field | Value |
|-------|-------|
| Prompt language | Norwegian |
| Prompt | "Opprett en fri regnskapsdimensjon 'Prosjekttype' med verdiene 'Eksternt' og 'Forskning'. Bokfor deretter et bilag pa konto 7140 for 28850 kr, knyttet til dimensjonsverdien 'Forskning'." |
| Leaderboard tx_task_id | **17** |
| Inference status | `unique_attempt_delta` (unambiguous) |
| Score | 13/13 raw, correctness 1.0, normalized 3.5/4.0 (max for 5-call path) |
| Checks | 6/6 passed |
| Scripts | `run.ts` (5-step dimension+voucher flow) |
| Call count | 5 calls, 0 errors |

**Mapping conflict: CRITICAL.** The leaderboard unambiguously attributed this run to tx_task_id **17** with a perfect 13/13 score. The prompt creates a **free accounting dimension with values and posts a voucher**. But `tasks/tripletex2` maps task 17 to **"Register customer invoice payment"** and task 07 to **"Create accounting dimension and post voucher."** This confirms the 07/17 swap documented in the task-mapping-audit.

**Efficiency:** 5 calls (POST dimension name → POST value × 2 → GET accounts → POST voucher) is the structural minimum. 6th consecutive perfect-correctness run for this task shape. The 0.5 gap to max 4.0 is the efficiency penalty for 5 calls (no lower-call path exists for this task).

**API detail:** Voucher balanced with 2 postings: 7140 account +28850 with `freeAccountingDimension1: {id: 19270}` (Forskning), 1920 account −28850. Voucher used `voucherType: null` (default).

---

### Run 8: prod-2026-03-21-224431683Z-166fec82

| Field | Value |
|-------|-------|
| Prompt language | German |
| Prompt | "Fuhren Sie den vollstandigen Projektzyklus fur 'Systemupgrade Bruckentor' (Bruckentor GmbH, Org.-Nr. 929610156) durch: 1) Das Projekt hat ein Budget von 405900 NOK. 2) Erfassen Sie Stunden: Emma Weber (Projektleiter, emma.weber@example.org) 73 Stunden und Anna Becker (Berater, anna.becker@example.org) 134 Stunden. 3) Erfassen Sie Lieferantenkosten von 55650 NOK von Silberberg GmbH (Org.-Nr. 818922248). 4) Erstellen Sie eine Kundenrechnung fur das Projekt." |
| Leaderboard tx_task_id | ambiguous (17, 18, 29 all changed); task 29 timing matched closest |
| Inference status | `ambiguous` (candidate_count=3) |
| Score | 4/11 raw, correctness 0.36, normalized 1.0909/6.0 |
| Checks | 1:pass, 2:pass, 6:pass; 3:FAIL, 4:FAIL, 5:FAIL, 7:FAIL |
| Scripts | `run.ts` (17-call lifecycle), 9 sandbox scripts (batch employees, VAT investigations, optimized paths) |
| Call count | 17 calls (16 base + 1 bank fix), 0 errors |

**Semantic match:** Task 29 — "Full project lifecycle." Four numbered steps: budget + 2 employees' hours + supplier cost + customer invoice. Exact match.

**No mapping conflict.** Consistent with current tripletex2 task-29 definition.

**CRITICAL finding: "4 critical fields" hypothesis DISPROVEN.** This run implemented ALL 4 hypothesized critical fixes from the trusted standard:
1. `isFixedPrice: true` + `fixedprice: 405900` on POST /project
2. `budgetHours: 207` on POST /project/projectActivity
3. `adminAccess: true` for PM (Emma Weber), `false` for consultant (Anna Becker)
4. POST /project/orderline with `unitCostCurrency: 55650`

**Result: Same 4 checks (3, 4, 5, 7) still failed.** Best_score unchanged at 1.0909. The score-reflection concludes: _"This proves the trusted standard's root cause analysis for checks 3,4,5,7 is fundamentally wrong."_

**Implementation detail:**
- 7 sequential steps with aggressive parallelization within each step
- Step 1 (3 parallel): GET department, POST customer, GET assignable PM
- Step 2 (3 parallel): POST employee × 2, POST project (with isFixedPrice)
- Step 3 (3 parallel): POST activity, POST participant × 2
- Step 4 (4 parallel): POST timesheet/entry/list, POST supplier, GET accounts, GET voucherType
- Step 5 (3 parallel): POST orderline, POST voucher, GET vatType
- Step 6: PUT account (bank fix)
- Step 7: POST invoice

**Batch endpoint confirmation:** Sandbox verified POST /employee/list and POST /project/participant/list both work. Optimal path: 15 calls (or 16 with bank fix).

---

## Cluster-Level Conclusions

### 1. CRITICAL: Three confirmed ID-mapping errors

Three `unique_attempt_delta` runs provide unambiguous evidence of txTaskId mismatches:

| Run | Semantic operation | tx_task_id (leaderboard) | Current canonical mapping | Correct canonical mapping |
|-----|-------------------|-------------------------|--------------------------|--------------------------|
| a3d75a03 | Create departments | **05** | task 05 = "Create project" (WRONG) | task 03 = "Create department" |
| c70259c2 | Create supplier | **04** | task 04 = "Create product" (WRONG) | task 02 = "Create supplier" |
| 33209af0 | Dimension + voucher | **17** | task 17 = "Register invoice payment" (WRONG) | task 07 = "Create dimension + voucher" |

All three are consistent with the comprehensive task-mapping-audit.md. This shard adds 3 independent data points.

### 2. Two additional mapping supports (ambiguous but consistent)

| Run | Semantic operation | Likely tx_task_id | Consistent with audit? |
|-----|-------------------|-------------------|----------------------|
| 2f5da463 | Register invoice payment | 07 | Yes: tx_task_id 07 = register-payment (our task 17) |
| f1d7b5dd | Create employee | 01 | Yes: tx_task_id 01 = create-employee (our task 06) |

### 3. Two confirmed-correct mappings

| Run | tx_task_id | Canonical task | Match? |
|-----|-----------|---------------|--------|
| 9f9c4770 | 12 | run-payroll-with-bonus | Correct |
| 166fec82 | 29 | full-project-lifecycle | Correct |

### 4. Task 29 "4 critical fields" hypothesis DISPROVEN

Run 8 (166fec82) implemented all 4 hypothesized critical fields (isFixedPrice, budgetHours, adminAccess, orderline). Score did NOT improve — 4/7 checks still fail. The trusted standard's root cause analysis for checks 3/4/5/7 is fundamentally wrong. Research into the actual scorer expectations is needed.

### 5. Task 12 amountGross bug (voucher postings)

Run 1 (9f9c4770) demonstrated that using `amount` in voucher postings causes silent data loss — the API accepts it but stores 0. The correct field is `amountGross` (or `amountGrossCurrency`). The `repair-aware-payroll` strategy should be checked for this bug.

### 6. Task 15 vs Task 29 classifier discrimination

Run 4 (07d50494) has a prompt that looks like task 15 (single employee, register hours + invoice) but the agent read the task 29 standard. The classifier must distinguish:
- **Task 15:** Single employee, register hours + create project invoice. No supplier cost, no numbered lifecycle steps.
- **Task 29:** Full lifecycle with 4 numbered steps: budget + hours (2+ employees) + supplier cost + invoice.

**Discriminators:** Numbered steps, "budget" keyword, multiple employees, supplier cost → task 29. Otherwise → task 15.

### 7. Efficiency observations

| Task | Optimal calls | This shard's calls | Delta | Notes |
|------|--------------|--------------------|---------| ------|
| Create departments (T05→canonical 03) | 1 | 1 | 0 | Perfect |
| Create supplier (T04→canonical 02) | 1 | 1 | 0 | Perfect |
| Dimension + voucher (T17→canonical 07) | 5 | 5 | 0 | Perfect, structural minimum |
| Register payment (T07→canonical 17) | 3 | 3 | 0 | Perfect, 14th consecutive confirmation |
| Payroll (T12) | 8 (worst case) | 9 | +1 | GET voucherType eliminable |
| Create employee (T01→canonical 06) | 2 | 3 | +1 | Avoidable 422 from optimistic POST |
| Project hours + invoice (T15) | ~10 | 12 | +2 | isFixedPrice gap + wrong standard read |
| Full lifecycle (T29) | 15 | 17 | +2 | bank fix + GET voucherType eliminable |

## Suspected Mapping Corrections

| Current Mapping | Evidence | Recommended Correction | Confidence |
|----------------|----------|----------------------|------------|
| task 05 = "Create project" | Run a3d75a03: 7/7 on tx_task_id 05 by creating departments | tx_task_id 05 → canonical task 03 (departments) | **HIGH** (unique_attempt_delta) |
| task 04 = "Create product" | Run c70259c2: 6/6 on tx_task_id 04 by creating supplier | tx_task_id 04 → canonical task 02 (supplier) | **HIGH** (unique_attempt_delta) |
| task 17 = "Register invoice payment" | Run 33209af0: 13/13 on tx_task_id 17 by creating dimension+voucher | tx_task_id 17 → canonical task 07 (dimension+voucher) | **HIGH** (unique_attempt_delta) |
| task 07 = "Create dimension + voucher" | Run 2f5da463: invoice payment routed to tx_task_id 07 | tx_task_id 07 → canonical task 17 (invoice payment) | **MEDIUM** (ambiguous, but consistent with swap) |
| task 01 = "Create customer" | Run f1d7b5dd: employee creation likely tx_task_id 01 | tx_task_id 01 → canonical task 06 (employee) | **MEDIUM** (ambiguous, 3 candidates) |
