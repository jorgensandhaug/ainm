# Post-Run Reflection: prod-2026-03-21-181832205Z-a4813485

## Task

Create a customer invoice for Elvdal AS (org.nr 810713909) with three product lines:
- Nettverksteneste (7765) at 13150 kr, 25% MVA
- Konsulenttimar (4369) at 11800 kr, 15% MVA (næringsmiddel)
- Vedlikehald (5331) at 8700 kr, 0% MVA (avgiftsfri)

Task shape: exact-match `create-customer-invoice` trusted standard — existing customer by organizationNumber, existing products by names + parenthetical numbers, three-rate VAT mix, create only (no send).

## Reflection

**What went well:**
- Correctly identified the task as an exact `create-customer-invoice` trusted standard match.
- Product VAT inheritance worked: products carried `vatType.id` values `3` (25%), `31` (15%), `6` (0%), so no `/ledger/vatType` call was needed.
- Bank account repair branch executed correctly when `POST /invoice` hit the known `Faktura kan ikke opprettes...` validation.
- In-script fallback from speculative productNumber query to catalog read kept the customer resolution intact (no duplicate customer read).
- Invoice totals were correct: `amountExcludingVatCurrency=33650`, `amountCurrency=38707.5`.

**What went poorly:**
- Used speculative `GET /product?productNumber=7765&productNumber=4369&productNumber=5331&fields=*` which returned only product `5331` (1 of 3), wasting 1 API call.
- The prompt gives both exact names AND parenthetical numbers — per the trusted standard's own guidance, the catalog read path should have been used directly.

**Mistakes:**
- Chose the wrong product-resolution path for this prompt shape. The standard clearly says: "if the prompt gives exact product names plus numeric refs that are not explicitly guaranteed Tripletex product numbers, prefer one decisive `GET /product?count=1000&fields=*`." The prompt `Nettverksteneste (7765)` fits this "names + parenthetical numbers" pattern, not the "exact product numbers only" pattern.

## Call Efficiency

**Not minimal.** The run used 7 API calls; the optimal path was 6 calls.

| # | Actual call | Needed? |
|---|---|---|
| 1 | `GET /customer?organizationNumber=810713909&fields=*` | Yes — resolve customer |
| 2 | `GET /product?productNumber=7765&productNumber=4369&productNumber=5331&fields=*` | **No — wasted call** (only returned 1/3 products) |
| 3 | `GET /product?count=1000&fields=*` | Yes — catalog fallback resolved all 3 |
| 4 | `POST /invoice?sendToCustomer=false` | Yes — hit bank account validation (expected) |
| 5 | `GET /ledger/account?isBankAccount=true&fields=*` | Yes — bank account repair |
| 6 | `PUT /ledger/account/{id}` | Yes — bank account repair |
| 7 | `POST /invoice?sendToCustomer=false` | Yes — retry after repair, success |

**Optimal path (6 calls):**
1. `GET /customer?organizationNumber=810713909&fields=*`
2. `GET /product?count=1000&fields=*` + local filter by `number`
3. `POST /invoice?sendToCustomer=false` (422 bank account)
4. `GET /ledger/account?isBankAccount=true&fields=*`
5. `PUT /ledger/account/{id}`
6. `POST /invoice?sendToCustomer=false` (retry, 201)

**Without bank account issue (3 calls):**
1. `GET /customer?organizationNumber=...&fields=*`
2. `GET /product?count=1000&fields=*`
3. `POST /invoice?sendToCustomer=false`

## Root Causes

1. **Speculative productNumber query chose wrong path for prompt shape.** The prompt gives both exact product names and parenthetical numbers. The trusted standard already says to use the catalog read for this pattern. The agent chose the speculative `productNumber` query anyway, likely because the numbers looked clean and numeric.

2. **productNumber multi-value filter returned partial results.** In the production account, `productNumber=7765&productNumber=4369&productNumber=5331` returned only product `5331`. All three products exist in the catalog by their `number` field. This behavior has been seen in multiple prior production runs — the `productNumber` query parameter does not reliably resolve all products in fresh accounts.

3. **Call-count arithmetic favors catalog read.** For the "names + parenthetical numbers" pattern:
   - Catalog read: always 1 call.
   - Speculative productNumber: 1 call if it works, 2 calls if partial.
   - The catalog read is never worse and sometimes strictly better.

## Sandbox Verification

1. **Multi-value productNumber query** works correctly in the persistent sandbox when products exist — tested with known products `2109/1175/9974`, `6744/2584/3739`, `4783/3343/4380` (all returned 3/3). When products don't exist, it returns 0 results. When only some exist, it returns the partial subset.

2. **Catalog-read + invoice-create path** proven in 3 calls:
   - `GET /customer?organizationNumber=919172657&fields=*` → resolved `Floresta Lda` (id 108247681)
   - `GET /product?count=1000&fields=*` → all products found, local filter by `number` field
   - `POST /invoice?sendToCustomer=false` → invoice 2147623278, `amountExcludingVatCurrency=33650`
   - Sandbox has only 0% outgoing VAT so `amountCurrency=33650` (equal to excl.), but the path shape is proven.

3. **Key sandbox insight:** The `productNumber` query parameter maps to the product `number` field and uses exact matching. The production partial-result issue likely stems from product number format differences in fresh accounts (string vs numeric, leading/trailing characters) that prevent exact matching on the API side but are resolved by local catalog filtering.

## Playbook Changes

Updated existing files (no new files created):

1. **`./trusted-standards/create-customer-invoice.md`**
   - Added clarification in Standard Flow step 2: when the prompt gives both exact names and parenthetical numbers, always choose the catalog read path; the speculative productNumber query is never fewer calls and can waste an extra call.
   - Added production evidence bullet for this run (810713909 / 7765+4369+5331): speculative productNumber returned only 1/3, wasted 1 call, correct path was catalog read.

2. **`./task-playbooks/create-customer-invoice.md`**
   - Added verified findings entry for this run's evidence.
   - Updated Avoidable Mistakes: split the old single productNumber guidance into two clear rules — use productNumber only when the prompt gives ONLY numbers without names; when names are present, always use catalog read.

3. **`./trusted-standards/common-endpoints.md`**
   - Added production evidence from this run reinforcing that for "names + parenthetical numbers," catalog read is always the right first choice.

## Commit

- **Hash:** `1626cd96`
- **Message:** `tripletex playbook: create-customer-invoice — add 810713909 production evidence: speculative productNumber query wasted 1 call, catalog read is always optimal for names+numbers pattern`

## Reusable Heuristics

1. **"Names + parenthetical numbers" → always catalog read.** When the prompt gives both exact product names and parenthetical numeric refs, use `GET /product?count=1000&fields=*` with local filtering. The speculative `productNumber` query is never fewer calls (both are 1 call) and risks wasting an extra call when `productNumber` returns partial results.

2. **"Numbers only, no names" → productNumber query.** Only use `GET /product?productNumber=...` when the prompt gives product numbers without accompanying exact names (because catalog filtering by name would be impossible).

3. **Product VAT inheritance works for mixed-rate invoices.** When products carry `vatType.id` for the intended rates (25%, 15%, 0%), reuse them directly on invoice lines — no `/ledger/vatType` call needed. This was confirmed in production with `vatType.id` values `3`, `31`, `6`.

4. **Bank account repair is a common branch in fresh accounts.** Always handle the `Faktura kan ikke opprettes...` validation in the same script: `GET /ledger/account?isBankAccount=true&fields=*` → `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` → retry same invoice payload.

5. **Keep fallbacks in the same script.** When a speculative product resolver returns partial results, do the catalog fallback in the same script and reuse the already-resolved customer. Never restart the whole flow from scratch.
