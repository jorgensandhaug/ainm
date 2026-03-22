# Shard E — prod48 Audit

**Analyst:** Claude Opus 4.6 (shard-e agent)
**Date:** 2026-03-22
**Runs analyzed:** 8

## Executive Summary

**The tripletex2 `CANONICAL_TASK_REGISTRY` has incorrect `tx_task_id` → task-semantic mappings for every task observed in this shard (6 distinct task IDs).** The task module implementations in tripletex2 perform the correct operations, but they are bound to the wrong leaderboard task IDs. If tripletex2 takes over production, it will deploy the wrong strategy for every prompt.

All 8 runs used the tripletex1 production system with trusted-standards. 7/8 achieved perfect correctness (1.0), confirming the leaderboard attribution is reliable ground truth. The one failure (T11, run b8f958e4) scored 0/8 despite mechanically flawless execution, indicating a fundamental approach mismatch for that specific task variant.

---

## Per-Run Evidence

### Run 1: prod-2026-03-21-232908610Z-8ed57511

| Field | Value |
|-------|-------|
| tx_task_id | **14** |
| Prompt | Spanish — "Emita una nota de crédito completa que revierta toda la factura" for Viento SL (978503071), "Licencia de software", 25450 NOK |
| Actual task | **Create customer invoice credit note** |
| Score | 8/8 raw, 4/4 normalized (tied leaderboard best) |
| Correctness | 1.0 |
| API calls | 2 (1 GET locate + 1 PUT createCreditNote) |
| Errors | 0 |
| Script | `scripts/credit-note.ts` |
| tripletex2 mapping for T14 | "Set project fixed price and invoice milestone" |
| **Conflict** | **YES — T14 is credit note creation, not project milestone invoicing** |

Evidence: Perfect 5/5 checks passed. Leaderboard attempt 18→19 for T14. Prompt is unambiguously a credit note task. The 2-call path (GET invoice + PUT :createCreditNote) is the proven minimum across 13+ consecutive runs.

---

### Run 2: prod-2026-03-21-233012289Z-edef2e1f

| Field | Value |
|-------|-------|
| tx_task_id | **04** |
| Prompt | French — "Enregistrez le fournisseur Colline SARL avec le numéro d'organisation 915612865" |
| Actual task | **Create supplier** |
| Score | 6/6 raw, 2/2 normalized (max T1) |
| Correctness | 1.0 |
| API calls | 1 (POST /supplier) |
| Errors | 0 |
| Script | `scripts/create-supplier.ts` |
| tripletex2 mapping for T04 | "Create product" |
| **Conflict** | **YES — T04 is supplier creation, not product creation** |

Evidence: Perfect 4/4 checks passed. Single POST /supplier with mirrored email fields. 12th consecutive optimal run on this trusted standard.

---

### Run 3: prod-2026-03-21-233108504Z-4997b67e

| Field | Value |
|-------|-------|
| tx_task_id | **02** |
| Prompt | Norwegian — "Opprett kunden Skogheim AS med organisasjonsnummer 855954346. Adressa er Parkveien 17, 4611 Kristiansand." |
| Actual task | **Create customer** |
| Score | 8/8 raw, 2/2 normalized (max T1) |
| Correctness | 1.0 |
| API calls | 1 (POST /customer) |
| Errors | 0 |
| Script | `scripts/create-customer.ts` |
| tripletex2 mapping for T02 | "Create supplier" |
| **Conflict** | **YES — T02 is customer creation, not supplier creation** |

Evidence: Perfect 7/7 checks passed. Single POST /customer with name, org number, email, postalAddress. Trusted standard `create-customer.md` matched exactly.

---

### Run 4: prod-2026-03-21-233148646Z-7b40806a

| Field | Value |
|-------|-------|
| tx_task_id | **06** |
| Prompt | Nynorsk — "Opprett og send ein faktura til kunden Bølgekraft AS (org.nr 892362416) på 34150 kr eksklusiv MVA. Fakturaen gjeld Vedlikehald." |
| Actual task | **Create and send customer invoice** |
| Score | 7/7 raw, 1.5333/2.0 normalized (tied leaderboard best) |
| Correctness | 1.0 |
| API calls | 6 (2 parallel GETs + failed POST + bank repair + retry POST) |
| Errors | 0 avoidable (1 expected 422 for bank repair) |
| Script | `scripts/create-and-send-invoice.ts` |
| tripletex2 mapping for T06 | "Create employee" |
| **Conflict** | **YES — T06 is create-and-send-invoice, not employee creation** |

Evidence: Perfect 5/5 checks passed. The 6-call path includes unavoidable bank-account repair (calls 3-5). This is the 13th consecutive optimal run. Leaderboard best for T06 is 1.5333 — the efficiency penalty is structural (bank repair always needed), not from agent mistakes.

---

### Run 5: prod-2026-03-21-233302338Z-b8f958e4

| Field | Value |
|-------|-------|
| tx_task_id | **11** |
| Prompt | French — "Enregistrez la facture fournisseur" for Colline SARL (938165742), INV-2026-8953, 32650 NOK TTC, account 7300, 25% VAT |
| Actual task | **Register supplier invoice** |
| Score | **0/8 raw, 0/4 normalized (TOTAL FAILURE)** |
| Correctness | **0** |
| API calls | 5 (mechanically flawless) |
| Errors | 0 (no avoidable errors) |
| Script | `scripts/sandbox-verify.ts` |
| tripletex2 mapping for T11 | "Create order, invoice, and register payment" |
| **Conflict** | **YES — T11 is register supplier invoice, not order+invoice+payment** |

Evidence: ALL 4 checks failed despite mechanically perfect execution (5 calls, 0 errors, voucher booked). The EHF import approach has never scored above 1/4 across 21 attempts on T11. The score-reflection concluded: "task 11 scorer checks fundamentally different things than what EHF import produces." This is a distinct task variant from T16 (register-supplier-invoice), which the same EHF approach handles perfectly (14+ consecutive optimal runs).

**Critical insight:** T11 and T16 are both "register supplier invoice" by prompt shape, but T11's scorer expects different final state. T11 has never been solved (best=1/4). The tripletex2 system maps T11 to "Create order, invoice, and register payment" — an entirely different operation — compounding the confusion.

---

### Run 6: prod-2026-03-21-233426427Z-ee7cb0fd

| Field | Value |
|-------|-------|
| tx_task_id | **14** |
| Prompt | Norwegian — "Kunden Lysgård AS (org.nr 866100829) har reklamert på fakturaen for 'Webdesign' (9900 kr ekskl. MVA). Opprett en fullstendig kreditnota" |
| Actual task | **Create customer invoice credit note** |
| Score | 8/8 raw, 4/4 normalized (tied leaderboard best) |
| Correctness | 1.0 |
| API calls | 2 |
| Errors | 0 |
| Script | `scripts/create-credit-note.ts` |
| tripletex2 mapping for T14 | "Set project fixed price and invoice milestone" |
| **Conflict** | **YES — confirms run 1 finding: T14 = credit note, not milestone** |

Evidence: Second independent confirmation of T14 = credit note. Different language (Norwegian vs Spanish), different customer, same task mechanics. 13th consecutive optimal run.

---

### Run 7: prod-2026-03-21-233513332Z-b6ad898c

| Field | Value |
|-------|-------|
| tx_task_id | **04** |
| Prompt | Portuguese — "Registe o fornecedor Luz do Sol Lda com número de organização 962006930" |
| Actual task | **Create supplier** |
| Score | 6/6 raw, 2/2 normalized (max T1) |
| Correctness | 1.0 |
| API calls | 1 (POST /supplier) |
| Errors | 0 |
| Script | `scripts/sandbox-create-supplier.ts` |
| tripletex2 mapping for T04 | "Create product" |
| **Conflict** | **YES — confirms run 2 finding: T04 = supplier, not product** |

Evidence: Second independent confirmation of T04 = create supplier. Different language (Portuguese vs French), different supplier name, same 1-call path.

---

### Run 8: prod-2026-03-21-233545711Z-8e8e2e86

| Field | Value |
|-------|-------|
| tx_task_id | **01** |
| Prompt | Nynorsk — "Me har ein ny tilsett som heiter Bjørn Neset, fødd 21. February 1996. Opprett vedkomande som tilsett" |
| Actual task | **Create employee** |
| Score | 8/8 raw, 2/2 normalized (max T1) |
| Correctness | 1.0 |
| API calls | 2 (GET /department + POST /employee) |
| Errors | 0 |
| Script | `scripts/sandbox-create-employee.ts` |
| tripletex2 mapping for T01 | "Create customer" |
| **Conflict** | **YES — T01 is employee creation, not customer creation** |

Evidence: Perfect 7/7 checks passed. Reference implementation for create-employee. The 2-call path (GET department + POST employee with nested employment) is the proven minimum.

---

## Cluster-Level Conclusions

### 1. Systematic Task ID Misalignment

Every task ID observed in shard E is mapped to the wrong semantic operation in the tripletex2 `CANONICAL_TASK_REGISTRY`:

| tx_task_id | tripletex2 says | Production evidence says | Correct tripletex2 module |
|------------|----------------|------------------------|--------------------------|
| 01 | Create customer | **Create employee** | task-06 |
| 02 | Create supplier | **Create customer** | task-01 |
| 04 | Create product | **Create supplier** | task-02 |
| 06 | Create employee | **Create and send customer invoice** | task-08 |
| 11 | Create order, invoice, and register payment | **Register supplier invoice** | task-16 |
| 14 | Set project fixed price and invoice milestone | **Create customer invoice credit note** | task-10 |

The pattern is NOT a simple off-by-one shift. It appears the tripletex2 registry was constructed from incorrect assumptions about which leaderboard tx_task_id maps to which operation. The task module implementations themselves (task-01 creates customers, task-02 creates suppliers, etc.) are correct — only the tx_task_id bindings are wrong.

### 2. Impact Assessment

**Severity: Critical for tripletex2 production readiness.**

- The active-strategies.json references task IDs that map to the wrong operations
- The task-queue.json priorities are based on correct leaderboard scores but wrong task names
- Any tripletex2 strategy that references task ID will deploy the wrong operation
- The "kill band" decisions (tasks at max score) are coincidentally correct because the scores come from the leaderboard (populated by tripletex1), not from tripletex2's strategies

**What is NOT broken:**
- Leaderboard scores in task-queue.json are correct (they come from the leaderboard API)
- tripletex2 task module implementations perform the right operations
- tripletex1 production system works correctly (it uses prompt-based classifier, not task ID mapping)

### 3. T11 Investigation Signal

T11 (actual: "register supplier invoice") is the hardest unsolved task in shard E:
- Best leaderboard score: 1/4 across 21 attempts
- The EHF import approach scores 0/8 on T11 despite working perfectly on T16 (14+ consecutive optimal runs)
- All 4 checks fail despite mechanically flawless execution
- This suggests T11's scorer checks different fields or expects a different registration path than T16

The tripletex2 system has T11 mapped to "Create order, invoice, and register payment" and T16 mapped to "Register supplier invoice." In reality, both are supplier invoice tasks but with different scorer expectations. This misalignment means tripletex2's T11 strategy is targeting an entirely wrong operation.

### 4. Confirmed Optimal Patterns

All 7 successful runs followed proven trusted-standard paths from tripletex1:
- **Create employee (T01):** 2 calls (GET department + POST employee) — optimal
- **Create customer (T02):** 1 call (POST customer) — optimal
- **Create supplier (T04):** 1 call (POST supplier with mirrored email) — optimal
- **Create and send invoice (T06):** 6 calls (with bank repair) — optimal given structural constraint
- **Credit note (T14):** 2 calls (GET locate + PUT createCreditNote) — optimal

### 5. Recommended Corrections

1. **Fix CANONICAL_TASK_REGISTRY** tx_task_id → task module bindings for all 30 tasks (shard E proves 6 are wrong; other shards likely prove more)
2. **Rebuild active-strategies.json** after fixing the registry — current strategy assignments target wrong tasks
3. **Investigate T11 separately** — it is a distinct supplier invoice variant that the standard EHF approach cannot solve
4. **Cross-validate with other shards** — if shards A-D cover additional task IDs, the full correction table can be constructed
5. **Do NOT deploy tripletex2 strategies to production** until the registry is corrected

---

## Candidate Strategy Artifact

**Decision: No candidate strategy created.**

Shard E does not reveal a reusable strategy pattern that is not already captured by the existing tripletex1 trusted-standards. All 7 successful runs followed proven optimal paths (1-6 calls with 0 avoidable errors). The one failure (T11) requires dedicated investigation before any strategy can be proposed — the root cause is unknown (scorer expectations differ from T16 despite identical prompt shape).

The primary deliverable from shard E is the **mapping correction table**, not a new strategy. Once the `CANONICAL_TASK_REGISTRY` bindings are fixed, the existing tripletex2 task module implementations can be correctly wired to the right leaderboard tasks.

The `tasks/tripletex2/src/tasks/strategy/candidates/prod48-shard-e.ts` artifact is intentionally not created because:
1. No new task shape was discovered — all observed tasks already have optimal trusted-standards
2. The T11 failure needs root-cause investigation before any strategy proposal would be sound
3. Creating a speculative strategy without evidence would violate the "evidence-first" mandate

---

## Evidence Confidence

| tx_task_id | Runs confirming | Languages seen | Confidence |
|------------|----------------|----------------|------------|
| 01 | 1 (8e8e2e86) | Nynorsk | High (7/7 checks passed, unambiguous prompt) |
| 02 | 1 (4997b67e) | Norwegian | High (7/7 checks passed, unambiguous prompt) |
| 04 | 2 (edef2e1f, b6ad898c) | French, Portuguese | Very high (2 independent confirmations) |
| 06 | 1 (7b40806a) | Nynorsk | High (5/5 checks passed, unambiguous prompt) |
| 11 | 1 (b8f958e4) | French | High for task type (supplier invoice prompt shape), low for correct approach |
| 14 | 2 (8ed57511, ee7cb0fd) | Spanish, Norwegian | Very high (2 independent confirmations) |
