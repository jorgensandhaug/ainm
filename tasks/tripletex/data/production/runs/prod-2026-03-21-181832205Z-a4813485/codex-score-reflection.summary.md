# Score-Aware Reflection — prod-2026-03-21-181832205Z-a4813485

## 1. Task Attribution

- **tx_task_id**: 09 (T2 task, max score = 4)
- **Prompt**: Create invoice for Elvdal AS (org.nr 810713909) with three product lines: Nettverksteneste (7765) 13150 kr 25% MVA, Konsulenttimar (4369) 11800 kr 15% MVA (næringsmiddel), Vedlikehald (5331) 8700 kr 0% MVA (avgiftsfri)
- **Task shape**: create-customer-invoice, existing customer by orgNr, existing products by name + parenthetical number, mixed VAT, Nynorsk prompt

## 2. Correctness Verdict

**Perfect.** `correctness = 1.0`, `score_raw = 8/8`, `all_checks_passed = true` (6/6 checks passed).

Invoice totals verified: amount excl. VAT = 33 650 kr, amount incl. VAT = 38 707.50 kr. All three product lines with correct descriptions, prices, and VAT rates were created.

## 3. Efficiency Verdict

**Not optimal.** `normalized_score = 2.5333` out of max `4.0` → efficiency factor ≈ 0.633.

This run tied the previous best score for task 09 (2.5333, set on a previous attempt). No improvement in best_score (before: 2.5333 with 12 attempts; after: 2.5333 with 13 attempts).

### Actual API call sequence (7 calls, 1 × 422 error):

| # | Call | Result | Verdict |
|---|------|--------|---------|
| 1 | `GET /customer?organizationNumber=810713909&fields=*` | 200, resolved customer id=108322930 | Necessary |
| 2 | `GET /product?productNumber=7765&productNumber=4369&productNumber=5331&fields=*` | 200, returned only product 5331 (1 of 3) | **Wasted** |
| 3 | `GET /product?count=1000&fields=*` | 200, resolved all 3 products | Necessary (but only because call 2 failed to resolve all) |
| 4 | `POST /invoice?sendToCustomer=false` | **422** — bank account not registered | Avoidable with preemptive fix |
| 5 | `GET /ledger/account?isBankAccount=true&fields=*` | 200, found account 1920 | Necessary (bank repair) |
| 6 | `PUT /ledger/account/{id}` | 200, bank account updated | Necessary (bank repair) |
| 7 | `POST /invoice?sendToCustomer=false` | 201, invoice created | Necessary |

### Optimal path for this exact task shape in a fresh account (5 calls, 0 errors):

| # | Call | Rationale |
|---|------|-----------|
| 1 | `GET /customer?organizationNumber=810713909&fields=*` | Resolve customer.id |
| 2 | `GET /product?count=1000&fields=*` | One decisive catalog read, local filter by product `number`; avoids unreliable `productNumber` multi-value query |
| 3 | `GET /ledger/account?isBankAccount=true&fields=*` | Preemptive bank account check — fresh accounts almost always lack bank account |
| 4 | `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` | Fix bank account before invoice write |
| 5 | `POST /invoice?sendToCustomer=false` | Single successful invoice write, 0 errors |

**Delta**: 7 calls + 1 error → 5 calls + 0 errors = 2 fewer calls and 1 fewer 4xx error.

## 4. Likely Root Cause

Two independent inefficiencies:

1. **Speculative productNumber query (call 2)**: The script tried `GET /product?productNumber=7765&productNumber=4369&productNumber=5331&fields=*` which only resolved 1 of 3 products. The prompt gives exact product names alongside parenthetical numbers — the trusted standard already says this is the "names + ambiguous numeric refs" pattern where the correct resolver is one decisive `GET /product?count=1000&fields=*`. The agent chose the wrong product resolution branch. The `productNumber` multi-value query is demonstrably unreliable in fresh production accounts for this prompt shape, as seen in multiple prior production runs (3644/4934/8806, 9796/2145/5995, 2934/8699/1355, and now 7765/4369/5331).

2. **Optimistic invoice write without preemptive bank account fix (call 4)**: In fresh production accounts, the company bank account is almost never registered. The optimistic strategy fires `POST /invoice` first, takes a 422, then repairs and retries — costing 3 calls + 1 error (calls 4-7). The preemptive strategy does `GET /ledger/account` + `PUT /ledger/account` first, then fires `POST /invoice` once — costing 3 calls + 0 errors (calls 3-5). The preemptive path is strictly better for fresh accounts: 1 fewer call and 1 fewer 4xx error.

## 5. What Went Right

- **Correctness was perfect**: all 6 scored checks passed, invoice totals correct, all three product lines with correct VAT rates
- **VAT type reuse**: products carried correct `vatType.id` values (25%=id:3, 15%=id:31, 0%=id:6), so no wasted `/ledger/vatType` call was needed — this was correctly identified and executed
- **Bank account repair**: the documented recovery branch worked correctly when the 422 hit
- **In-script fallback**: the catalog fallback was handled within the same script, correctly reusing the already-resolved customer (no duplicate customer read)
- **Fast execution**: total duration 121s well within the 300s budget
- **No unnecessary verification read**: the write response totals were trusted without an extra `GET /invoice/{id}`

## 6. What To Change Next Time

1. **Always use catalog read for "names + parenthetical numbers" pattern.** When the prompt gives product names alongside parenthetical numbers (e.g., `Nettverksteneste (7765)`), go straight to `GET /product?count=1000&fields=*` and filter locally. Never try `GET /product?productNumber=...` first for this shape — it wastes a call when it fails and saves nothing when it succeeds (both are 1 call). The `productNumber` multi-value query is unreliable in fresh production accounts.

2. **Preemptive bank account fix for create-customer-invoice in fresh accounts.** Instead of the optimistic POST → 422 → repair → retry path (3 calls + 1 error), do GET bank account → PUT bank account → POST invoice (3 calls + 0 errors). This saves 1 call and avoids 1 4xx error. The current playbook line "Do not insert an automatic `GET /ledger/account` before the first invoice write" should be revised for the fresh-account create-customer-invoice shape.

3. **Target path for next run of this exact task shape (5 calls, 0 errors):**
   ```
   GET /customer?organizationNumber=...&fields=*
   GET /product?count=1000&fields=*
   GET /ledger/account?isBankAccount=true&fields=*
   PUT /ledger/account/{id} { bankAccountNumber: "12345678903" }
   POST /invoice?sendToCustomer=false
   ```

4. **If the preemptive bank account PUT returns evidence the account was already configured** (e.g., `bankAccountNumber` already populated), the write still succeeds and costs the same. There is no downside to the preemptive fix in any account state.
