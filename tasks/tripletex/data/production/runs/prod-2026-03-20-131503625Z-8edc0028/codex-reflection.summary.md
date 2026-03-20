## 1. Task

Do post-run learning for the exact customer-invoice run, verify the corrected path in sandbox, update the playbook system, commit only the learning docs, and write this summary.

## 2. Reflection

What went well:
- The original run recovered to the correct production outcome.
- The invoice payload shape was correct: `POST /invoice?sendToCustomer=false` with embedded `orders[].orderLines`.
- The bank-account validation was read correctly and fixed with one precise repair.
- The rerun was made idempotent enough to avoid creating a duplicate after the first successful `POST /invoice`.

What went poorly:
- The first script hard-failed after `GET /product?productNumber=...` returned only 1 product.
- I treated `orderLines.length === 3` on the `POST /invoice` response as if line verification might already be possible.
- That led to a bad local verification failure after the invoice had already been created.
- I had to add recovery logic after the fact instead of having the fallback chain and sparse-response check built in from the start.

Correct approach:
- Resolve customer.
- Resolve products with a fallback chain, not a single assumption:
  - `GET /product?productNumber=...`
  - if partial subset: `GET /product?ids=...`
  - if still unresolved and names exist: one decisive `GET /product?count=1000&fields=*` and local exact filtering
- `POST /invoice?sendToCustomer=false`
- If `422` says missing company bank account, do exactly one repair branch:
  - `GET /ledger/account?isBankAccount=true&fields=*`
  - `PUT /ledger/account/{id}` with `bankAccountNumber`
  - retry `POST /invoice` once
- If exact line proof is needed and the write response is link-only sparse, do one immediate expanded `GET /invoice/{id}`.

## 3. Root Causes

- Weak assumption 1: numeric refs in parentheses were treated as definitely resolvable by the first `productNumber` lookup. They were not.
- Weak assumption 2: matching line count in `POST /invoice` response was treated as potentially enough for verification. It was not; the response was still sparse link-only.
- Missing guard: the initial script did not distinguish “partial product resolution” from “hard failure”.
- Missing guard: the initial script did not check whether returned lines actually contained `product.number`, `description`, `unitPriceExcludingVatCurrency`, and `vatType.percentage` before attempting exact verification.

## 4. Sandbox Verification

Used sandbox only, via TS + `bun`, in the run scripts directory.

Proved:
- `GET /product?productNumber=<a>&productNumber=<b>&productNumber=<c>&fields=*` can return all requested products when the refs are true product numbers.
- `GET /product?ids=<id>,<id>,<id>&fields=*` also resolves the same product set decisively.
- `POST /invoice?sendToCustomer=false` can return `orderLines.length === 3` while each line is still only `{id,url}`.
- One immediate expanded `GET /invoice/{id}?fields=*,orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))` returns the exact line details needed for proof.

Sandbox evidence:
- Customer used: `108124240` (`Logging Probe AS`)
- Products resolved by repeated `productNumber`: `3`
- Products resolved by `ids`: `3`
- Sandbox invoice created: `2147526074`
- `POST /invoice` response: `sparseOrderLineCount=3`, `createdLinesSparse=true`
- Expanded `GET /invoice/{id}` returned all 3 detailed lines with `productNumber`, `description`, `vatPercentage`, `unitPriceExcludingVatCurrency`

## 5. Playbook Changes

Updated existing playbook. No new playbook created.

Changed paths:
- `./AGENTS.md`
- `./task-playbooks/create-customer-invoice.md`

What changed:
- Added that a `POST /invoice` response can still be sparse even when `orderLines.length` matches the requested line count.
- Tightened the product-resolution guidance: a partial `productNumber` result is a recovery condition, not proof the remaining refs are absent.
- Made the fallback chain explicit in the create-customer-invoice playbook:
  - first `productNumber`
  - then `ids`
  - then one decisive full-list fallback filtered by exact `number` and/or exact names
- Updated verified findings to reflect the production run needing the bank-account repair branch and the sandbox proving the sparse-response trap.

## 6. Commit

Hash: `2e17329070cebf38ac16f1ad09302a0fab029af8`

Message: `tripletex playbook: tighten customer invoice recovery`

## 7. Reusable Heuristics

- Treat partial search results as ambiguity to resolve, not as a stop condition.
- In Tripletex invoice writes, line-count alone is not verification.
- Only trust a write response for exact line proof if the scored fields are actually present.
- For create-only invoice tasks, keep bank-account repair as a conditional branch, not a default pre-read.
- If a write likely succeeded but local verification crashed afterward, switch to locate-and-reuse mode before considering another write.