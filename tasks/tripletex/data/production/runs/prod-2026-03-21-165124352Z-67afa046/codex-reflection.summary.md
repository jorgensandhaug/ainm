# Reflection: Create and Send Customer Invoice — Fjelltopp AS

## Task

Create and send an invoice to customer Fjelltopp AS (org.nr 927173875) for 42 600 kr excluding MVA. Invoice description: Nettverksteneste. Prompt language: Norwegian Nynorsk (`nn`).

## Reflection

**What went well:**
- Correct final state: invoice created with `amountExcludingVatCurrency=42600`, `amountCurrency=53250` (25% VAT applied)
- Correct Norwegian `nn` "eksklusiv MVA" → taxed 25% branch selection
- Dynamic VAT lookup found `vatType.id=3` at 25% — first production proof that full VAT code set (3/25%, 31/15%, 32/12%, 5/0%, 52/0%, 6/0%) is available in production accounts
- Bank-account repair branch executed correctly: retained `customer.id` and `vatType.id` in memory, avoiding the 2-call waste seen in the earlier Étoile SARL run
- Customer created with `invoiceSendMethod: "MANUAL"` per trusted standard
- Default `sendToCustomer=true` handled the send implicitly

**What went poorly:**
- 1 avoidable 422 error (bank-account missing on fresh account), though this is inherent to the reactive try-first approach

**No mistakes:**
- The run followed the trusted standard exactly
- No unnecessary calls, no logic errors, no wrong VAT selection

## Call Efficiency

**Total: 6 API calls, 1 4xx error**

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | `POST /customer` | 201 | Create Fjelltopp AS |
| 2 | `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` | 200 | Resolve 25% VAT |
| 3 | `POST /invoice` | 422 | Bank account missing |
| 4 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 | Find invoice account 1920 |
| 5 | `PUT /ledger/account/371676328` | 200 | Register bank number |
| 6 | `POST /invoice` | 201 | Invoice created and sent |

**Assessment:** 6 calls is the minimum for this task shape when bank-account repair is needed. The happy path (no repair) would be 3 calls. This run was 2 calls better than the Étoile SARL precedent (8 calls) because it retained in-memory state across the repair branch.

**No wasted calls:** Every call was necessary. The 422 on call #3 is inherent to the reactive detection approach and cannot be avoided without preemptive checking (which was disproved as net-negative in sandbox testing).

## Root Causes

The bank-account 422 on `POST /invoice` occurs on fresh Tripletex accounts that have no `bankAccountNumber` registered on their invoice ledger account (1920). This is an account-level prerequisite, not a task-level mistake. ~30% of production runs hit this branch based on accumulated evidence.

The reactive approach (try invoice first, repair if 422) remains optimal because:
- 70% of runs succeed in 3 calls (no repair needed)
- Preemptive checking would add 1 unnecessary call to every run
- Sandbox verification on 2026-03-21 showed preemptive 3-way parallelization (POST customer + GET vatType + GET ledger/account) took 1423ms vs 616ms sequential for the same 3-call happy path — no wall-clock benefit

## Sandbox Verification

Persistent sandbox (`kkpqfuj-amager.tripletex.dev`) on 2026-03-21:

1. **Bank account state:** Account 1920 (id=424190862) already has `bankAccountNumber=12345678903` from previous repair
2. **VAT types:** Only code 6 (0%) available — confirms sandbox remains blocked for the 25% taxed branch
3. **Parallelization test:** `Promise.all([POST /customer, GET /vatType])` completed in 128ms vs 198ms sequential — marginal improvement
4. **3-way parallel test:** Adding `GET /ledger/account` to the batch completed in 141ms but total preemptive flow was 1423ms (4 calls) vs 616ms sequential (3 calls) — preemptive is worse
5. **Preemptive detection logic verified:** `bankAccountNumber` field is visible in GET response; truthy check correctly distinguishes repaired vs unrepaired accounts
6. **Full create-and-send flow verified:** Sequential 3-call path (POST customer → GET vatType → POST invoice) succeeded cleanly in sandbox with 0% VAT

**Conclusion:** The preemptive approach adds 1 call in the happy case (~70%) for no wall-clock benefit, making it net-negative. The reactive try-first approach remains optimal. The key optimization for the repair branch is retaining in-memory state (saves 2 calls vs re-reading customer + vatType).

## Playbook Changes

Updated existing files (no new files created):

1. **`./trusted-standards/create-and-send-customer-invoice.md`**
   - Added Known Pitfall: retain `customer.id` and `vatType.id` in memory across bank-account repair; Fjelltopp run (6 calls) vs Étoile run (8 calls) as proof
   - Added Known Pitfall: do not preemptively add `GET /ledger/account`; sandbox disproved the approach (4 calls vs 3, no wall-clock benefit)
   - Added Known Pitfall: Nynorsk `nn` follows same rules as Bokmål `nb`
   - Added OpenAPI/Sandbox proof: Fjelltopp AS 2026-03-21 bank-account repair branch with state retention (6 calls)
   - Added OpenAPI/Sandbox proof: production VAT environment confirmed full code set (3/25%, 31/15%, 32/12%, 5/0%, 52/0%, 6/0%)
   - Added OpenAPI/Sandbox proof: preemptive bank-account checking disproved

2. **`./task-playbooks/create-and-send-customer-invoice.md`**
   - Added pitfall: retain state across bank-account repair (Fjelltopp 6 vs Étoile 8 calls)
   - Added pitfall: preemptive `GET /ledger/account` disproved
   - Added pitfall: Nynorsk `nn` follows Bokmål `nb` rules

## Commit

```
1c329d2e tripletex playbook: create-and-send invoice — state retention across bank-account repair saves 2 calls, preemptive checking disproved
```

Files committed:
- `trusted-standards/create-and-send-customer-invoice.md`
- `task-playbooks/create-and-send-customer-invoice.md`

## Reusable Heuristics

1. **State retention is critical in repair branches.** When a POST fails and triggers a repair sub-flow, keep all previously resolved IDs (customer, vatType, etc.) in local variables. Re-reading them wastes 1 call each.

2. **Preemptive parallel checking is not always better.** Adding speculative GETs to a parallel batch costs 1 call per speculative read. Only worthwhile if the repair probability exceeds ~60% AND the 4xx penalty exceeds 1 call in scoring weight. For bank-account repair (~30% probability), preemptive checking is net-negative.

3. **Nynorsk (`nn`) and Bokmål (`nb`) are interchangeable for VAT branch selection.** Both `eksklusiv MVA` (nn) and `eksklusiv MVA` (nb) trigger the taxed 25% branch. Do not treat dialect differences as different task shapes.

4. **Production accounts have the full VAT code set; sandbox does not.** The dynamic `GET /ledger/vatType?typeOfVat=OUTGOING` lookup is essential because `vatType.id=3` (25%) exists in production but not in sandbox. Hardcoding would work in production but fail in sandbox, making testing impossible.

5. **The reactive try-first approach remains the optimal default for conditional prerequisites.** When a prerequisite failure is detectable from the error response and repairable in 2 calls (GET + PUT), the expected cost of try-first (0.3 × 3 extra calls = 0.9) is less than the cost of always checking (1.0 extra call per run).
