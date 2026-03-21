# Post-Run Reflection: prod-2026-03-21-180354595Z-419dbb16

## 1. Task

Create an order for customer Horizonte Lda (org nr 904130338) with products Serviço de rede (6247) at 15250 NOK and Desenvolvimento de sistemas (5919) at 13250 NOK. Convert the order to an invoice and register full payment. Portuguese-language prompt, exact match for the `create-order-invoice-and-register-payment` trusted standard.

## 2. Reflection

**What went well:**
- Correctly identified the exact trusted-standard match immediately
- Used the canonical 5-call path with `count=1000` product lookup
- Used `paidAmount=0.01` seed for combined invoice+payment in one write
- Zero 4xx errors across all API calls
- Final state correct: invoice created, outstanding=0

**What went poorly:**
- Initial script used strict integer comparison `p.number === 6247` to match products
- `product.number` is always a string in the API response (`"6247"`), so the strict equality silently returned `undefined`
- The script threw locally after 2 API calls (GET customer + GET product), wasting those calls
- Had to fix the comparison and re-run the full 5-call flow
- Total API calls: 7 instead of the ideal 5

## 3. Call Efficiency

**Was the run minimal-call?** No. The run used 7 API calls; the ideal is 5.

**Wasted calls:**
1. `GET /customer?organizationNumber=904130338&fields=*` — first attempt, result discarded after local throw
2. `GET /product?count=1000&fields=*` — first attempt, result discarded after local throw

**Exact lower-call path (5 calls):**
1. `GET /customer?organizationNumber=904130338&fields=*`
2. `GET /product?count=1000&fields=*` → filter locally with `String(p.number) === "6247"` (string comparison)
3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
4. `POST /order` with embedded orderLines
5. `PUT /order/{id}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false&paymentTypeId=<id>&paidAmount=0.01&paymentTypeIdRestAmount=<id>`

## 4. Root Causes

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| 2 wasted API calls | `p.number === 6247` used strict integer equality against a string field | Use `String(p.number) === String(ref)` or loose equality `==` |
| Silent product mismatch | No type awareness in trusted standard about `product.number` being a string | Added explicit type pitfall warning to trusted standard, playbook, and common-endpoints |

The core mistake is a JavaScript type coercion issue: the Tripletex API returns `product.number` as a string (e.g. `"6247"`) but the agent wrote the comparison with an integer literal. Strict equality `===` in JavaScript does not coerce types, so `"6247" === 6247` is `false`.

## 5. Sandbox Verification

- Sandbox `GET /product?count=10&fields=*` confirmed `product.number` type is `string` across all products
- `productNumber` remains `undefined` in sandbox, consistent with production
- No additional lower-call path exists — the 5-call canonical flow is already optimal for this exact task shape

## 6. Playbook Changes

**Updated existing files (no new files created):**

| File | Change |
|------|--------|
| `./trusted-standards/create-order-invoice-and-register-payment.md` | Added CRITICAL type pitfall: `product.number` is always a string, use `String()` comparison |
| `./task-playbooks/create-order-invoice-and-register-payment.md` | Added same type pitfall to Product Resolution Rules + production run 419dbb16 entry in Key Findings |
| `./trusted-standards/common-endpoints.md` | Added type pitfall note under Product standard search notes |

## 7. Commit

- **Hash:** `611aeae1`
- **Message:** `tripletex playbook: create-order-invoice-and-register-payment — add product.number string type pitfall from 419dbb16 production run`

## 8. Reusable Heuristics

1. **`product.number` is always a string** — never compare with `=== intLiteral`. Use `String(p.number) === String(ref)` or loose `==`. This applies to all Tripletex product lookups.
2. **Test comparisons before API calls** — when writing a script that filters API responses locally, verify the comparison logic will work with the actual response types before making the API calls. A local `console.log(typeof field)` on the first response prevents wasted retries.
3. **The 5-call path remains optimal** for this exact task shape (existing customer by org number + existing products by number + order + invoice + payment). No lower-call alternative exists.
4. **`paidAmount=0.01` seed** continues to work reliably for NOK invoice settlement in the combined `PUT /order/{id}/:invoice` call.
