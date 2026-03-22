# Shard F — prod48 Audit

Shard of 8 production runs from `prod-2026-03-21-2336*` through `prod-2026-03-22-0133*`.

## Critical finding: tx_task_id ↔ canonical task mapping errors

**4 of the 6 distinct tx_task_ids in this shard are mapped to the WRONG canonical tripletex2 task.**

The `CANONICAL_TASK_REGISTRY` in `legacy-tripletex1-task-bridge.ts` assumes a 1:1 identity mapping (`txTaskId === taskId`). Production evidence from this shard proves that assumption is wrong for at least 4 task IDs:

| tx_task_id (leaderboard) | tripletex2 canonical mapping (current) | Actual run semantics (evidence) | Correct tripletex2 canonical task |
|---|---|---|---|
| **01** | 01 = "Create customer" | **Employee creation** (André Almeida) | 06 = "Create employee" |
| **02** | 02 = "Create supplier" | **Customer creation** (Greenfield Ltd, Windmill Ltd) | 01 = "Create customer" |
| **11** | 11 = "Order → Invoice → Payment" | **Supplier invoice registration** (Lumière SARL) | 16 = "Register supplier invoice" |
| **14** | 14 = "Set project fixed price + milestone" | **Credit note** (Brückentor GmbH) | 10 = "Issue full credit note" |
| 13 | 13 = "Register travel expense" | Travel expense (correct) | 13 ✓ |
| 18 | 18 = "Reverse customer payment" | Payment reversal (correct) | 18 ✓ |

### Impact

1. **Score attribution is contaminated**: The task queue's best scores for tasks 01, 02, 11, 14, and their counterparts (06, 01, 16, 10) are likely computed from runs attributed to the wrong canonical task.
2. **Strategy development targets wrong semantics**: If the task queue says task 02 (create supplier) is at perfect score 2/2, that score may actually be from customer creation runs.
3. **Production-learning loop is broken** for any task affected by these mismatches. Strategies developed "for task X" may actually be optimized for a completely different task's leaderboard slot.

### Root cause

The bridge was bootstrapped with an identity assumption (`legacyTripletex1TaskIds: [taskId]`) before production evidence was available. The leaderboard's task numbering (tx_task_id) does not match the semantic task definitions in tripletex2.

### Recommended fix

Update `legacyTripletex1TaskIds` in the canonical registry (or introduce a proper reverse mapping) based on production evidence across all shards. This shard alone cannot confirm the full 30-task mapping — only 6 tx_task_ids are observed here.

---

## Per-run evidence

### Run 1: prod-2026-03-21-233648738Z-4032eb04

| Field | Value |
|---|---|
| tx_task_id | 14 |
| inference_status | unique_attempt_delta |
| Score | 8/8 raw, 4/4 normalized |
| Checks | 5/5 passed |
| Duration | 49.2s |
| API calls | 2 |

**Prompt** (German):
> Der Kunde Brückentor GmbH (Org.-Nr. 901668566) hat die Rechnung für "Webdesign" (38800 NOK ohne MwSt.) reklamiert. Erstellen Sie eine vollständige Gutschrift, die die gesamte Rechnung storniert.

**Semantics**: Issue a full credit note cancelling an invoice for Brückentor GmbH. This is unambiguously a credit-note task (tripletex2 task 10), not a "set fixed price + milestone" task (tripletex2 task 14).

**Script pattern**: 2-call canonical path — `GET /invoice` (locate invoice by org number + amount) → `PUT /invoice/{id}/:createCreditNote`.

**Leaderboard delta**: task 14 attempts 19→20, best score unchanged at 4.

---

### Run 2: prod-2026-03-21-233732739Z-8c1a4192

| Field | Value |
|---|---|
| tx_task_id | 18 |
| inference_status | unique_attempt_delta |
| Score | 8/8 raw, 4/4 normalized |
| Checks | 3/3 passed |
| Duration | 49.1s |
| API calls | 2 |

**Prompt** (English):
> The payment from Windmill Ltd (org no. 858237033) for the invoice "Consulting Hours" (25500 NOK excl. VAT) was returned by the bank. Reverse the payment so the invoice shows the outstanding amount again.

**Semantics**: Reverse a bank-returned payment. Matches tripletex2 task 18 ("Reverse customer invoice payment"). **No mapping conflict.**

**Script pattern**: 2-call canonical — `GET /invoice?customerOrgNumber=...` (with postings fields to extract payment voucher ID) → `PUT /ledger/voucher/{id}/:reverse`.

**Leaderboard delta**: task 18 attempts 18→19, best score unchanged at 4.

---

### Run 3: prod-2026-03-21-233821110Z-6714382c

| Field | Value |
|---|---|
| tx_task_id | 18 |
| inference_status | unique_attempt_delta |
| Score | 8/8 raw, 4/4 normalized |
| Checks | 3/3 passed |
| Duration | 63.3s |
| API calls | 2 |

**Prompt** (Norwegian Nynorsk):
> Betalinga frå Strandvik AS (org.nr 859256333) for fakturaen "Nettverksteneste" (41550 kr ekskl. MVA) vart returnert av banken. Reverser betalinga slik at fakturaen igjen viser uteståande beløp.

**Semantics**: Same as Run 2 — payment reversal. **No mapping conflict.**

**Script pattern**: Same 2-call canonical as Run 2, adapted for different org number and amount.

**Leaderboard delta**: task 18 attempts 19→20, best score unchanged at 4.

**Note**: 5 sandbox verification scripts present (sandbox-verify.ts through sandbox-verify5.ts), testing edge cases including future-dated payments and bank reconciliation queries. Higher duration (63.3s vs 49.1s) likely due to extra verification passes.

---

### Run 4: prod-2026-03-21-233933567Z-7d01d632

| Field | Value |
|---|---|
| tx_task_id | 02 |
| inference_status | unique_attempt_delta |
| Score | 8/8 raw, 2/2 normalized |
| Checks | 7/7 passed |
| Duration | 29.5s |
| API calls | 1 |

**Prompt** (English):
> Create the customer Greenfield Ltd with organization number 872154442. The address is Sjøgata 85, 7010 Trondheim. Email: post@greenfield.no.

**Semantics**: Create a customer. This is tripletex2 task 01 ("Create customer"), NOT task 02 ("Create supplier"). **Mapping conflict confirmed.**

**Script pattern**: Single `POST /customer` with name, organizationNumber, email, postalAddress.

**Leaderboard delta**: task 02 attempts 23→24, best score unchanged at 2.

---

### Run 5: prod-2026-03-21-234011317Z-e9e115f1

| Field | Value |
|---|---|
| tx_task_id | 01 |
| inference_status | unique_attempt_delta |
| Score | 8/8 raw, ~1.22 normalized |
| Checks | 7/7 passed |
| Duration | 89.0s |
| API calls | 4 (2 errors, 2 retries) |

**Prompt** (Portuguese):
> Temos um novo funcionário chamado André Almeida, nascido em 30. May 1992. Crie-o como funcionário com o e-mail andre.almeida@example.org e data de início 4. February 2026.

**Semantics**: Create an employee. This is tripletex2 task 06 ("Create employee"), NOT task 01 ("Create customer"). **Mapping conflict confirmed.**

**Script pattern**: `GET /department?isInactive=false` → `POST /employee` (with employment and department). Agent made 2 422 errors (department placement inside vs outside `employments[]`), fixed on retry.

**Leaderboard delta**: task 01 attempts 23→24, best score unchanged at 2.

**Execution note**: Agent reflection mentions 2 errors in 4 API calls due to department-placement confusion — department belongs at top level of employee, NOT inside the `employments[]` array. This is a known pitfall for create-employee strategies.

---

### Run 6: prod-2026-03-21-234149727Z-32d11eeb

| Field | Value |
|---|---|
| tx_task_id | 13 |
| inference_status | unique_attempt_delta |
| Score | 4.5/8 raw, 1.125/4 normalized |
| Checks | 3/6 (checks 2, 3, 6 failed) |
| Duration | 110.7s |
| API calls | 6 (0 HTTP errors) |

**Prompt** (Norwegian Nynorsk):
> Registrer ei reiserekning for Svein Berge (svein.berge@example.org) for "Kundebesøk Trondheim". Reisa varte 5 dagar med diett (dagssats 800 kr). Utlegg: flybillett 2850 kr og taxi 200 kr.

**Semantics**: Register travel expense with per diem and cost lines. Matches tripletex2 task 13. **No mapping conflict.**

**Script pattern**: 6 calls — 3 parallel GETs (employee, costCategory, paymentType) → conditional GET /company (for departureFrom) → POST /travelExpense → PUT /travelExpense/:deliver.

**Failure analysis**: 3/6 checks failed despite no HTTP errors. Agent reflection notes this was the first run to use category-default vatType (id=12) instead of hardcoded 0. Likely failures are in per-diem calculation (count=4 overnights for 5 days), cost categorization, or VAT handling on cost lines.

**Leaderboard delta**: task 13 attempts 19→20, best score unchanged at 1.125.

---

### Run 7: prod-2026-03-21-234345624Z-de7f6ef9

| Field | Value |
|---|---|
| tx_task_id | 02 |
| inference_status | unique_attempt_delta |
| Score | 8/8 raw, 2/2 normalized |
| Checks | 7/7 passed |
| Duration | 28.9s |
| API calls | 1 |

**Prompt** (English):
> Create the customer Windmill Ltd with organization number 884659876. The address is Parkveien 124, 7010 Trondheim. Email: post@windmill.no.

**Semantics**: Create a customer. Same mapping conflict as Run 4. tx_task_id 02 in the leaderboard is "create customer", not "create supplier" as tripletex2 assumes.

**Script pattern**: Single `POST /customer` — identical canonical path to Run 4. Fastest run in the shard (28.9s).

**Leaderboard delta**: task 02 attempts 24→25, best score unchanged at 2.

---

### Run 8: prod-2026-03-22-013352179Z-c290243c

| Field | Value |
|---|---|
| tx_task_id | 11 |
| inference_status | unique_attempt_delta |
| Score | 0/8 raw, 0/4 normalized |
| Checks | 0/4 (all failed) |
| Duration | 86.5s |
| API calls | 4 (0 HTTP errors) |

**Prompt** (French):
> Nous avons reçu la facture INV-2026-5683 du fournisseur Lumière SARL (nº org. 904564184) de 75500 NOK TTC. Le montant concerne des services de bureau (compte 7140). Enregistrez la facture fournisseur avec la TVA déductible correcte (25 %).

**Semantics**: Register an incoming supplier invoice. This is tripletex2 task 16 ("Register supplier invoice"), NOT task 11 ("Order → Invoice → Payment"). **Mapping conflict confirmed.**

**Script pattern**: 4 calls — `POST /supplier` → `GET /ledger/account?number=7140` → `GET /ledger/voucherType?name=Leverandørfaktura` → `POST /ledger/voucher`.

**Failure analysis**: All 4 checks failed despite 0 HTTP errors. The approach used 4 calls; the recent commit `c290243c` documents that the playbook was updated to reduce to 3 calls by skipping `GET /ledger/voucherType` (POST /ledger/voucher accepts `voucherType: { name: "Leverandørfaktura" }` directly). However, the 0/4 score suggests deeper correctness issues beyond call count — possibly wrong posting structure, amount calculation (gross 75500 / 1.25 = net 60400), or VAT type handling.

**Leaderboard delta**: task 11 attempts 21→22, best score unchanged at 1.

**Note**: This run has the most sandbox test scripts (6 files), suggesting significant iteration during execution. The agent tried multiple approaches but couldn't achieve a passing score.

---

## Cluster-level conclusions

### 1. Mapping error pattern

The 4 mismatched tx_task_ids (01, 02, 11, 14) follow no simple offset pattern — the leaderboard's numbering appears to be genuinely different from the tripletex2 semantic numbering, not just shifted. Two of the matches (13, 18) are coincidental identity rather than evidence that the identity mapping is generally correct.

**Full mapping table for this shard:**

| Leaderboard tx_task_id | Leaderboard semantic | tripletex2 canonical task that should receive it |
|---|---|---|
| 01 | Create employee | 06 |
| 02 | Create customer | 01 |
| 11 | Register supplier invoice | 16 |
| 13 | Register travel expense | 13 |
| 14 | Issue full credit note | 10 |
| 18 | Reverse customer payment | 18 |

### 2. Score reliability

All 8 runs have `inference_status: "unique_attempt_delta"` — high-confidence leaderboard attribution. The tx_task_ids are reliable. The issue is purely in the bridge mapping layer.

### 3. Strategy maturity signals

- **Payment reversal (tx_task_id 18)**: Mature. Two perfect runs, 2-call canonical, no repairs needed.
- **Customer creation (tx_task_id 02)**: Mature. Two perfect runs, 1-call canonical.
- **Credit note (tx_task_id 14)**: Mature. One perfect run, 2-call canonical.
- **Employee creation (tx_task_id 01)**: Fragile. Perfect score but 4 calls with 2 422 errors. Department placement is a recurring pitfall.
- **Travel expense (tx_task_id 13)**: Immature. 50% score, failing on per-diem/VAT checks.
- **Supplier invoice (tx_task_id 11)**: Broken. 0% score despite no API errors — correctness issue in posting structure or amount calculation.

### 4. Multilingual prompt coverage

This shard has prompts in 5 languages: German, English, Norwegian Nynorsk, Portuguese, French. All runs correctly parsed entity data (names, org numbers, amounts) regardless of prompt language — the classifier and field extraction are language-robust.

---

## Candidate strategy assessment (Deliverable 5)

**No candidate strategy artifact produced.** Rationale:

- The successful runs (credit note, payment reversal, customer creation) use patterns already covered by existing tripletex2 strategies (tasks 10, 18, 01).
- The failing runs (travel expense at 50%, supplier invoice at 0%) reveal correctness bugs but don't suggest a new reusable strategy pattern — they need debugging within their existing task strategies.
- The employee creation run succeeded but with avoidable errors — a repair-loop improvement, not a new strategy shape.

The primary actionable output of this shard is the **mapping correction**, not a new strategy.
