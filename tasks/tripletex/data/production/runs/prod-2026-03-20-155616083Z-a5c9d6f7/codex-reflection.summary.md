## 1. Task

Post-run learning pass for the exact production task: create product `Fachbuch`, number `2237`, price `5650 NOK` excluding VAT, exact `0%` VAT for books.

## 2. Reflection

What went well:
- Chose the correct safe Tripletex path for an exact-VAT product-create task: filtered outgoing VAT lookup, then product create.
- Reused the `POST /product` write response for verification; no follow-up read.
- Avoided 4xxs in the scored run.

What went poorly:
- I re-opened `openapi.json` even though this was already an exact match for the trusted standard `trusted-standards/create-product.md`.
- That extra local checking did not cost API calls, but it did show weak trust in the existing standard.

Mistakes:
- No scored API mistake.
- Minor process mistake: unnecessary local spec verification before acting.

Correct approach:
- For exact product-create prompts with exact VAT, trust the product standard directly.
- Do one filtered outgoing VAT lookup on the task date.
- Create the product with only prompt-scored fields plus `vatType: { id }`.
- Verify from the write response and stop.

## 3. Call Efficiency

The scored run was minimal-call from a safe-production perspective.

Tripletex API calls used:
1. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
2. `POST /product`

Wasted Tripletex calls:
- None.

Important nuance:
- In persistent sandbox, a 1-call shortcut exists superficially: `POST /product` without `vatType` succeeded and auto-filled a 0% VAT type.
- That is not the fewest calls realistically possible for perfect correctness in fresh scored accounts, because:
  - sandbox defaulted to VAT id `6`
  - fresh production used VAT id `5`
  - omitting `vatType` relies on account-specific default behavior and can silently create the wrong VAT result.

Lower-call path for the next agent:
- No lower safe path than 2 calls for exact-VAT product-create tasks.
- Next agent should use:
  1. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<task-date>&fields=*`
  2. pick the matching `percentage`
  3. `POST /product` with `name`, `number`, `priceExcludingVatCurrency`, `vatType: { id }`
  4. stop on write response

## 4. Root Causes

Why the run still needed reflection:
- Existing docs already warned against hardcoding VAT ids, but they did not explicitly warn that `POST /product` can silently auto-fill VAT when omitted.
- Existing docs also did not explicitly call out that exact `0%` prompts like books are still solved by the same filtered outgoing VAT lookup, not by any book-specific VAT endpoint or special product field.
- The production run showed account variance for valid `0%` VAT ids (`5` fresh prod vs `6` persistent sandbox), which is the core reason hardcoding and omission are both unsafe for scored exact-VAT tasks.

## 5. Sandbox Verification

Used only sandbox credentials.

Verified path:
1. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
- `200 OK`
- returned one outgoing `0%` VAT row:
  - `id=6`
  - `number="6"`
  - `Ingen utgående avgift (utenfor mva-loven)`

2. `POST /product` with that returned VAT id
- `201 Created`
- product created successfully
- write response already proved `name`, `number`, `priceExcludingVatCurrency`, `priceIncludingVatCurrency`, and `vatType.id`

Shortcut investigation:
3. `POST /product` without `vatType`
- also `201 Created`
- Tripletex auto-filled VAT id `6`

Interpretation:
- Sandbox proves the 2-call path works.
- Sandbox also proves omission can auto-fill VAT.
- Production fresh account had valid `0%` VAT id `5`, not `6`.
- Therefore omission is not a trusted shortcut for exact-VAT scored tasks; it is account-default behavior, not a canonical path.

## 6. Playbook Changes

Updated existing docs; no new files created.

Changed paths:
- `AGENTS.md`
- `trusted-standards/create-product.md`
- `trusted-standards/common-endpoints.md`
- `task-playbooks/create-product.md`

What changed:
- Added explicit warning that `POST /product` without `vatType` can silently inherit account-default VAT in some sandbox accounts.
- Marked that behavior as non-trusted for exact-VAT scored tasks.
- Added explicit rule that exact `0%` product prompts such as books still use the filtered outgoing VAT result in the current account.
- Recorded fresh-production evidence that exact `0%` product tasks can use a different valid VAT id than persistent sandbox (`5` vs `6`).

## 7. Commit

Commit hash:
- `8964bec9d5a2291267dc8c2094b3edb5f8e1fe98`

Commit message:
- `tripletex playbook: tighten create-product VAT guidance`

## 8. Reusable Heuristics

- For exact-VAT product creation, optimize for minimum safe calls, not minimum lucky calls.
- Do not hardcode VAT ids across accounts, even for `0%`.
- Do not trust omitted `vatType` just because sandbox auto-filled the correct VAT once.
- For prompts like “0% for books,” do not invent special product fields or special VAT endpoints; select the matching `0%` row from filtered `OUTGOING` VAT on the task date.
- If the write response already proves the scored fields, stop immediately; no verification read.