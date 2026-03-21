# Codex Reflection Summary

## 1. Task

Create and send a customer invoice for **Brückentor GmbH** (Org. 804379010) with three product lines:
- Schulung (2626) at 17300 NOK, 25% VAT
- Beratungsstunden (7746) at 12850 NOK, 15% VAT (food)
- Cloud-Speicher (5675) at 7050 NOK, 0% VAT (exempt)

German-language prompt. Multi-VAT-rate invoice with product numbers. Existing customer (German definite article "den Kunden"). Matched trusted standard: `create-and-send-customer-invoice.md`.

## 2. Reflection

### What went well
- Correctly matched the create-and-send trusted standard
- Correctly identified "den Kunden" as definite article → existing customer → GET /customer
- Multi-VAT rate selection (25%, 15%, 0% exempt) worked correctly once the string comparison was fixed
- Bank account repair branch executed correctly
- Final invoice state was correct: `amountExcludingVatCurrency=37200`, `amountCurrency=43452.5`

### What went poorly
1. **Blindly attempted POST /product/list on an existing-customer account**: products 2626, 7746, 5675 already existed. The 422 "Produktnummeret 2626 er i bruk" wasted 1 call and 1 error.
2. **String/number comparison bug**: Tripletex returns `product.number` and `vatType.number` as strings (`"2626"`, `"5"`), not numbers. The script compared with `=== 2626` and `=== 5`, which silently returned false. This bug cascaded across 3 script restarts.
3. **Lost local state between script restarts**: vatType was fetched 3 times because each script crash lost the previously fetched IDs.
4. **Debug call**: an extra GET /product to inspect the string type, which should have been handled in the original script.

## 3. Call Efficiency

**Run was NOT minimal-call.**

| Call | Endpoint | Status | Needed? |
|------|----------|--------|---------|
| 1 | GET /customer?organizationNumber=804379010 | 200 | YES |
| 2 | POST /product/list (3 products) | 422 | NO — products already existed |
| 3 | GET /ledger/vatType | 200 | YES (but result lost) |
| 4 | GET /product?fields=id,number,name&count=1000 | 200 | YES (but result discarded due to string bug) |
| 5 | GET /ledger/vatType | 200 | NO — redundant, already fetched in call 3 |
| 6 | GET /product?fields=id,number,name&count=10 | 200 | NO — debug call |
| 7 | GET /ledger/vatType | 200 | NO — 3rd fetch of same data |
| 8 | POST /invoice?sendToCustomer=true | 422 | YES — bank account repair |
| 9 | GET /ledger/account?isBankAccount=true | 200 | YES — repair branch |
| 10 | PUT /ledger/account/{id} | 200 | YES — repair branch |
| 11 | POST /invoice?sendToCustomer=true | 201 | YES — retry |

**Actual: 11 calls (1 avoidable 422 error)**
**Optimal: 7 calls (0 avoidable errors)**

### Optimal path for this exact task shape

1. **Parallel**: GET /customer + GET /ledger/vatType + GET /product?fields=id,number&count=1000 → 3 calls
2. Match products by `String(p.number)` client-side → all 3 found, no creation needed
3. Select vatType IDs: 25% (percentage===25), 15% (percentage===15), 0% exempt (percentage===0 && Number(v.number)===5)
4. POST /invoice?sendToCustomer=true → 422 bank account → 1 call
5. GET /ledger/account → 1 call
6. PUT /ledger/account/{id} → 1 call
7. POST /invoice?sendToCustomer=true → 201 → 1 call

**Total: 7 calls, 0 avoidable errors**

### Wasted calls
- Call 2 (POST /product/list → 422): should have used GET /product for existing customer
- Call 5 (GET /ledger/vatType): redundant, state lost between scripts
- Call 6 (GET /product debug): should have been handled in-script
- Call 7 (GET /ledger/vatType): redundant, 3rd fetch

## 4. Root Causes

1. **Trusted standard gap**: The standard said "batch-create all products in one call: POST /product/list" without handling the case where products already exist in existing-customer accounts. The definite-article heuristic for customers was documented, but its implication for products was not.

2. **Type coercion blind spot**: Tripletex API returns `number` fields as strings on both products and vatTypes. The script used strict equality (`===`) against numeric literals, which silently failed. This is a JavaScript/TypeScript trap that the trusted standard did not warn about.

3. **Script restart pattern**: Writing separate scripts for each retry (instead of one resilient script) caused local state loss. Each restart re-fetched already-known data.

## 5. Sandbox Verification

Verified in persistent sandbox (kkpqfuj-amager.tripletex.dev):

1. **Product number is always string**: `typeof p.number === "string"` for all 77 sandbox products
2. **GET /product?number=9796 works**: exact filter, returns 1 matching result
3. **GET /product?number=99999 returns empty**: non-existent numbers return `count=0, values=[]`, no error
4. **POST /product/list with existing number returns 422**: `"Produktnummeret 9796 er i bruk"` — confirmed as the wasted-call pitfall
5. **GET /product?fields=id,number&count=1000 + client-side filter works**: correctly identifies all existing products and any missing ones by comparing `String(p.number)`
6. **VatType number is string**: `typeof v.number === "string"` — `v.number === 5` fails, `Number(v.number) === 5` works
7. Sandbox still only has vatType code 6 (0%), so multi-VAT not testable there

## 6. Playbook Changes

Updated existing files (no new files created):

- **`./trusted-standards/create-and-send-customer-invoice.md`**:
  - Step 3: split into new-customer (POST /product/list) vs existing-customer (GET /product first, POST only if missing)
  - "Do Not Use" section: clarified that product-number lookups ARE supported (only exclude description-based product searches)
  - Added German definite-article heuristic ("den Kunden" → existing customer)
  - Added CRITICAL string comparison pitfall for product.number and vatType.number
  - Added existing-product + string-comparison pitfalls with Brückentor production confirmation
  - Added sandbox verification: GET /product filtering, POST /product/list 422 on existing numbers, type evidence

- **`./task-playbooks/create-and-send-customer-invoice.md`**:
  - Rewrote "Product-Line Invoices" section: separate flows for new-customer vs existing-customer
  - Added German definite-article heuristic
  - Added CRITICAL type pitfall section with WRONG/RIGHT code examples
  - Updated multi-VAT section: note that vatType.number is string, use `Number(v.number)`
  - Added Brückentor production run confirmation

## 7. Commit

```
41d97405 tripletex playbook: create-and-send-customer-invoice — add existing-product handling for existing-customer variant (GET /product instead of POST /product/list to avoid 422), add German definite-article heuristic ("den Kunden"), add CRITICAL string comparison pitfall (product.number and vatType.number are strings not numbers), add Brückentor GmbH production confirmation (804379010, 3 product lines, multi-VAT 25%+15%+0%, 11 calls actual vs 7 optimal due to existing-product + string-comparison bugs)
```

Files changed: `trusted-standards/create-and-send-customer-invoice.md`, `task-playbooks/create-and-send-customer-invoice.md`

## 8. Reusable Heuristics

1. **Definite article extends to products**: When "den Kunden" / "the customer" / "kunden" implies existing customer, products with given numbers may also already exist. Use GET /product (parallel) instead of POST /product/list to avoid 422. Only POST missing products.

2. **Always use string-safe comparison for Tripletex number fields**: `product.number` and `vatType.number` are strings. Use `String(x) === String(y)` or `Number(x) === y`. Never use `array.includes(stringField)` with numeric array elements.

3. **One resilient script > multiple retry scripts**: Write a single script that handles all branches (product lookup fallback, bank repair, vatType retry) with local state retained throughout. Separate scripts lose in-memory state and re-fetch already-known data.

4. **Existing-customer product-line optimal call count**:
   - Products exist, no bank repair: **4 calls** (3 parallel + 1 invoice)
   - Products exist, with bank repair: **7 calls** (3 parallel + 1 fail + 3 repair)
   - Products missing, no bank repair: **5 calls** (3 parallel + 1 create + 1 invoice)
   - Products missing, with bank repair: **8 calls** (3 parallel + 1 create + 1 fail + 3 repair)

5. **New-customer product-line optimal call count** (unchanged):
   - No bank repair: **4 calls** (3 parallel [POST customer + POST product/list + GET vatType] + 1 invoice)
   - With bank repair: **7 calls**
