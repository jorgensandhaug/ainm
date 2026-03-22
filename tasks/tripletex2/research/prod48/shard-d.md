# Shard D — prod48 Audit

8 production runs from `2026-03-21T23:11` – `2026-03-21T23:20`.

## Critical Finding: Identity Mapping Broken

The `CANONICAL_TASK_REGISTRY` in `legacy-tripletex1-task-bridge.ts` assumes **txTaskId = taskId** (1:1 identity). Shard D evidence proves this assumption is **wrong for at least 4 of the 5 distinct leaderboard task IDs** observed in this shard.

### Mapping Corrections from Shard D

| Leaderboard txTaskId | Current canonical mapping | Actual operation (from scripts) | Correct canonical taskId |
|---|---|---|---|
| 03 | 03 — Create Department | Creates a product (POST /product with vatType lookup) | **04** — Create Product |
| 08 | 08 — Create and Send Invoice | Creates a project (GET /customer + GET /employee + POST /project) | **05** — Create Project |
| 11 | 11 — Create Order, Invoice, and Register Payment | Registers a supplier invoice (POST /supplier + EHF import + book voucher) | **16** — Register Supplier Invoice |
| 12 | 12 — Run Payroll with Bonus | Runs payroll with bonus (confirmed correct) | **12** — Run Payroll with Bonus |
| 17 | 17 — Register Customer Invoice Payment | Creates accounting dimension + posts voucher | **07** — Create Accounting Dimension and Post Voucher |

**Impact**: Every production run attributed to leaderboard tasks 03, 08, 11, or 17 is being mapped to the wrong canonical task. This means:
- Strategy selection routes to the wrong strategy
- Score tracking attributes scores to the wrong task
- The classifier's contrastive cues may be miscalibrated

### Implied Full Renumbering Pattern

The evidence suggests the leaderboard uses a **different numbering scheme** from our canonical IDs. The observed remappings are not random — they follow a pattern where the leaderboard groups entity-creation tasks differently:

| Leaderboard | Semantics | Our canonical |
|---|---|---|
| 03 | Create Product | 04 |
| 05 | Create Project | 05 (same) |
| 08 | Create Project | 05 ← conflict with above? |

Wait — leaderboard 08 = Create Project, but our canonical 05 = Create Project too. So either the leaderboard has multiple IDs for the same operation, or the entity that changed in the leaderboard diff doesn't mean what we think. The three project-creation runs (dde40565, 3d670cac, eb378aba) all show leaderboard task 08 incrementing — this is consistent and reliable (3 independent observations).

The most parsimonious explanation: **the leaderboard's 30-task numbering is simply different from our canonical 30-task numbering**, and the identity bridge was wrong from the start for most tasks beyond task 01-02.

---

## Per-Run Evidence

### Run 1: `prod-2026-03-21-231130833Z-92c4dcf1`

- **Leaderboard task**: 03
- **Inference status**: `unique_attempt_delta` (high confidence)
- **Prompt** (Norwegian Nynorsk): Create product "Avis" with product number 2061, price 4150 NOK excl. VAT, 0% VAT rate for newspapers.
- **Scripts**:
  - `create-product.ts`: 2 API calls
    1. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-22` → find 0% VAT type
    2. `POST /product` → create "Avis" with number 2061, price 4150, vatType `{ id: zeroVat.id }`
  - `sandbox-verify-0pct-vat.ts`: 3 sandbox tests confirming 0% VAT assignment works and testing whether default VAT auto-populates
- **Leaderboard delta**: task 03 attempts 21→22, best_score unchanged at 2
- **Semantic match**: This is **Create Product** (canonical task 04), NOT Create Department (canonical task 03)
- **Score note**: best_score=2 unchanged — the 2-call path (vatType lookup + product create) is not improving the score. The leaderboard max for this task is unknown from this shard alone.

### Run 2: `prod-2026-03-21-231238290Z-dde40565`

- **Leaderboard task**: 08
- **Inference status**: `unique_attempt_delta`
- **Prompt** (Norwegian Nynorsk): Create project "Implementering Strandvik" linked to customer Strandvik AS (org.nr 935092957), PM Hakon Berge.
- **Scripts**:
  - `create-project.ts`: 3 API calls (2 parallel + 1 sequential)
    1. `GET /customer?organizationNumber=935092957` (parallel)
    2. `GET /employee?email=hakon.berge@example.org&assignableProjectManagers=true` (parallel)
    3. `POST /project` with customer/PM IDs, startDate 2026-03-22
  - `sandbox-verify-shortcuts.ts`: 3 sandbox tests checking whether inline customer/PM resolution can reduce the 3-call minimum (tests POST /project with unresolved nested objects)
- **Leaderboard delta**: task 08 attempts 21→22, best_score unchanged at 2
- **Semantic match**: This is **Create Project** (canonical task 05), NOT Create and Send Invoice (canonical task 08)
- **Score note**: best_score=2 — the 3-call path is the established floor. Sandbox tests explored 2-call and 1-call shortcuts.

### Run 3: `prod-2026-03-21-231356274Z-db84be61`

- **Leaderboard task**: 17
- **Inference status**: `unique_attempt_delta`
- **Prompt** (Portuguese): Create custom accounting dimension "Region" with values "Vestlandet" and "Midt-Norge", then post a voucher on account 6860 for 47500 NOK linked to "Midt-Norge".
- **Scripts**:
  - `run.ts`: 5 API calls, all sequential
    1. `POST /ledger/accountingDimensionName` → create "Region", capture `dimensionIndex`
    2. `POST /ledger/accountingDimensionValue` → create "Vestlandet"
    3. `POST /ledger/accountingDimensionValue` → create "Midt-Norge", capture value ID
    4. `GET /ledger/account?number=6860,1920` → resolve account IDs
    5. `POST /ledger/voucher` → post voucher with two postings: account 6860 debit +47500 with `freeAccountingDimension${dimIndex}: { id: scoredValueId }`, account 1920 credit -47500
- **Leaderboard delta**: task 17 attempts 21→22, best_score unchanged at 3.5
- **Semantic match**: This is **Create Accounting Dimension and Post Voucher** (canonical task 07), NOT Register Customer Invoice Payment (canonical task 17)
- **Score note**: best_score=3.5 — the 5-call sequential path. Key implementation detail: dimension field name is dynamically constructed as `freeAccountingDimension${dimIndex}`.

### Run 4: `prod-2026-03-21-231454326Z-3d670cac`

- **Leaderboard task**: 08
- **Inference status**: `unique_attempt_delta`
- **Prompt** (Norwegian Nynorsk): Create project "Migrasjon Elvdal" linked to customer Elvdal AS (org.nr 962211348), PM Geir Aasen.
- **Scripts**:
  - `create-project.ts`: Identical structure to Run 2, different data (3 calls: parallel customer+employee lookup, then POST /project)
  - `sandbox-verify-2call.ts`: 3 sandbox tests for 1-call and 2-call shortcuts (inline customer, inline PM, combined)
- **Leaderboard delta**: task 08 attempts 22→23 (reflects Run 2's increment), best_score unchanged at 2
- **Semantic match**: **Create Project** (canonical task 05) — confirms Run 2's finding
- **Score note**: Same task, same strategy, same score. Second independent confirmation of txTaskId 08 = Create Project.

### Run 5: `prod-2026-03-21-231548877Z-08a38984`

- **Leaderboard task**: 12
- **Inference status**: `unique_attempt_delta`
- **Prompt** (French): Run payroll for Sarah Moreau (sarah.moreau@example.org) this month. Base salary 56900 NOK, one-time bonus 15800 NOK.
- **Scripts**:
  - `run-payroll.ts`: Complex multi-phase script
    - Phase 1 (parallel): `GET /employee?email=...`, `GET /salary/type?count=1000`, `GET /ledger/account?number=5000,1920`
    - Phase 2 (conditional): If employee is "underconfigured" (no dateOfBirth, no employments), repair: `POST /division`, `PUT /employee/{id}` (set dateOfBirth), `POST /employee/employment` (create employment)
    - Phase 3 (parallel): `POST /salary/transaction?generateTaxDeduction=true` (Fastlonn 56900 + Bonus 15800), `POST /ledger/voucher?sendToLedger=true` (debit 5000, credit 1920, total 72700)
  - 4 sandbox test scripts testing inline salary type resolution (`salaryType: { name: "Fastlonn" }`, `salaryType: { number: 2000 }`) and inline account resolution (`account: { number: 5000 }`)
- **Leaderboard delta**: task 12 attempts 23→24, **best_score improved 2.333→2.4**
- **Semantic match**: **Run Payroll with Bonus** (canonical task 12) — identity mapping CORRECT
- **Score note**: This is the only run in shard D that **improved the best score**. The repair-aware strategy (conditionally creating division + employment if missing) plus parallel salary transaction + voucher posting yielded the improvement. The 4 sandbox scripts show active research into reducing call count by inlining salary type and account references.

### Run 6: `prod-2026-03-21-231713485Z-eb378aba`

- **Leaderboard task**: 08
- **Inference status**: `unique_attempt_delta`
- **Prompt** (Norwegian Nynorsk): Create project "Analyse Sjobris" linked to customer Sjobris AS (org.nr 883693329), PM Steinar Berge.
- **Scripts**:
  - `create-project.ts`: Same 3-call pattern as Runs 2 and 4 (parallel customer+employee, then POST /project). No sandbox verification script this time.
- **Leaderboard delta**: task 08 attempts 23→24, best_score unchanged at 2
- **Semantic match**: **Create Project** (canonical task 05) — third confirmation
- **Score note**: Third run of the same task with no score improvement. The 3-call floor appears hard.

### Run 7: `prod-2026-03-21-231803951Z-1a623504`

- **Leaderboard task**: 11
- **Inference status**: `unique_attempt_delta`
- **Prompt** (Spanish): Register supplier invoice INV-2026-1443 from Montana SL (org. no 831519975) for 50050 NOK VAT-included, office services (account 6300), 25% input VAT.
- **Scripts**:
  - `register-supplier-invoice.ts`: 5 API calls
    1. `POST /supplier` → create supplier with org number
    2. `GET /ledger/account?number=6300&isApplicableForSupplierInvoice=true` → resolve expense account
    3. `POST /ledger/voucher/importDocument` → import EHF (PEPPOL UBL 2.1) XML with full invoice structure (net 40040, VAT 10010, gross 50050)
    4. `PUT /ledger/voucher/{id}?sendToLedger=false` → set postings (debit 6300 with vatType 1, credit supplier account)
    5. `PUT /ledger/voucher/{id}?sendToLedger=true` → book voucher (version-only body)
  - `sandbox-investigate-import-response.ts`: Tests whether a single PUT with postings + sendToLedger=true can replace the two-step approach
- **Leaderboard delta**: task 11 attempts 19→20, best_score unchanged at 1
- **Semantic match**: This is **Register Supplier Invoice** (canonical task 16), NOT Create Order, Invoice, and Register Payment (canonical task 11)
- **Score note**: best_score=1 is very low. The 5-call EHF import path is not scoring well. The pitfalls doc (for task 20, which adds PDF) shows the import+book flow is understood, but task 11 (leaderboard) may have different scoring criteria than what we expect from canonical task 16.

### Run 8: `prod-2026-03-21-232006679Z-77175e8c`

- **Leaderboard task**: N/A (leaderboard after-capture timed out)
- **Inference status**: `no_change_detected` (artifact of timeout, not genuine)
- **Prompt** (Norwegian Nynorsk): Create product "Dataradgjeving" with product number 4993, price 16250 NOK excl. VAT, standard 25% VAT.
- **Scripts**:
  - `create-product.ts`: **1 API call** — `POST /product` with `{ name, number, priceExcludingVatCurrency: 16250 }` (no vatType specified — relies on 25% default)
  - `sandbox-verify.ts`: Confirms 1-call works but sandbox defaults to 0% VAT (not 25%), so the 1-call shortcut only works on accounts with standard 25% configuration
- **Leaderboard delta**: Unknown (timeout). Based on prompt semantics, this is a Create Product run and would have incremented leaderboard task 03.
- **Semantic match**: **Create Product** (canonical task 04)
- **Score note**: The 1-call path (no VAT lookup) is a potential optimization over the 2-call path in Run 1, but only valid when 25% standard VAT is correct. The sandbox verification shows this is environment-dependent.

---

## Cluster-Level Conclusions

### 1. The Identity Bridge is Fundamentally Broken

4 of 5 observed leaderboard task IDs map to the **wrong** canonical task under the current identity bridge. Only task 12 (payroll) maps correctly. This is not a few edge cases — it's systematic.

**Confirmed wrong mappings from this shard:**

| txTaskId | Bridge says | Evidence says | Confidence |
|---|---|---|---|
| 03 | task-03 Create Department | task-04 Create Product | High (1 run, unambiguous script) |
| 08 | task-08 Create and Send Invoice | task-05 Create Project | Very High (3 runs, identical pattern) |
| 11 | task-11 Create Order/Invoice/Payment | task-16 Register Supplier Invoice | High (1 run, unambiguous EHF import) |
| 17 | task-17 Register Customer Invoice Payment | task-07 Create Dimension + Voucher | High (1 run, unambiguous dimension API) |

### 2. Score Plateau at Current Call Counts

Most runs show no score improvement:
- Create Product (tx 03): best_score=2, unchanged across attempts
- Create Project (tx 08): best_score=2, unchanged across 3 attempts
- Register Supplier Invoice (tx 11): best_score=1, unchanged
- Accounting Dimension (tx 17): best_score=3.5, unchanged

Only Run Payroll (tx 12) improved: 2.333→2.4. The repair-aware strategy (handling underconfigured employees) appears to be the differentiator.

### 3. Active Research into Call-Count Reduction

Multiple sandbox scripts probe whether API calls can be eliminated:
- **Product**: Can the VAT type lookup be skipped? (Yes for 25% default, no for 0%)
- **Project**: Can customer/PM be resolved inline in POST /project? (Tests nested object shortcuts)
- **Payroll**: Can salary type be passed by name/number instead of ID? (Tests `{ name: "Fastlonn" }` and `{ number: 2000 }`)
- **Supplier Invoice**: Can the two-step PUT be collapsed to one? (Tests single PUT with postings + sendToLedger)

### 4. Multilingual Prompts

Prompts span 4 languages across 8 runs: Norwegian Nynorsk (5), French (1), Portuguese (1), Spanish (1). The classifier and strategy must be language-agnostic.

### 5. Candidate Strategy Pattern: Repair-Aware Payroll

Run 5 (08a38984) demonstrates a **repair-aware payroll pattern** that improved the score. The pattern:
1. Parallel-fetch employee, salary types, and accounts
2. If employee is "underconfigured" (no dateOfBirth, no employments), enter repair branch: create division, update employee, create employment
3. Parallel-post salary transaction and ledger voucher

This is already captured in the active strategy `12.repair-aware-payroll.v1` — no new strategy artifact needed from this shard.

---

## Suspected Mapping Corrections

The bridge file `legacy-tripletex1-task-bridge.ts` must be updated to break the identity assumption. The `CANONICAL_TASK_REGISTRY` entries for txTaskId 03, 08, 11, and 17 need their `taskId` fields corrected.

**However**, this shard only covers 5 of 30 leaderboard task IDs. A full renumbering table requires evidence from all shards. The corrections above should be cross-referenced with shards A, B, C before applying.

### Recommendations

1. **Do NOT apply partial bridge fixes from this shard alone.** Collect all shard evidence first to build a complete txTaskId→taskId mapping.
2. **Prioritize the payroll score improvement.** The repair-aware pattern works — investigate what's preventing further improvement beyond 2.4.
3. **Investigate the supplier invoice score floor.** best_score=1 for leaderboard task 11 is very low. The EHF import path may be fundamentally wrong for what the scorer expects.
4. **Test the 1-call product creation path** in production (no VAT lookup for 25% default). If it scores higher than the 2-call path, adopt it as the primary strategy.
