## 1. Task

Reflect on the scored production run for the exact prompt shape: create product `Maintenance`, product number `1327`, `3700 NOK` excluding VAT, standard `25%` VAT. Then audit call efficiency, re-prove the shape in persistent sandbox, update learning artifacts, commit the docs change, and record reusable heuristics.

## 2. Reflection

What went well:
- The scored run matched the existing exact trusted standard for fresh-account standard-`25%` product creation.
- The agent used the correct one-write production path: `POST /product` with `name`, `number`, and `priceExcludingVatCurrency`, with no speculative VAT lookup.
- Verification stayed on the write response only. The response proved `name=Maintenance`, `number=1327`, `priceExcludingVatCurrency=3700`, `priceIncludingVatCurrency=4625`, and returned `vatType.id=3`.

What went poorly:
- No API-flow mistake happened in the scored run.
- Minor non-scored inefficiency: the run also read `trusted-standards/common-endpoints.md` before acting even though `trusted-standards/create-product.md` alone already covered the exact match. That did not cost API calls or correctness, but it was unnecessary local exploration.

Correct approach:
- For this exact fresh-account shape, trust `./trusted-standards/create-product.md` directly.
- Do exactly one `POST /product`.
- Verify from `response.value` that Tripletex assigned a VAT type and computed `priceIncludingVatCurrency` as `4625`.

## 3. Call Efficiency

The scored run was minimal-call.

Wasted API calls:
- None.

Exact lower-call path for the next agent:
1. `POST /product` with:
   - `name: "Maintenance"`
   - `number: 1327`
   - `priceExcludingVatCurrency: 3700`
2. Stop after verifying in `response.value`:
   - `priceIncludingVatCurrency = 4625`
   - `vatType` exists, in this production run `vatType.id = 3`

Calls that would have been wasted for this exact task:
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`
- `GET /product`
- `GET /product/{id}`

## 4. Root Causes

Why the run succeeded:
- The prompt was an exact trusted-standard match.
- Fresh production accounts can auto-assign the standard outgoing `25%` VAT on `POST /product` for this shape.
- The write response already exposes the scored computed field `priceIncludingVatCurrency`, so no read-back is needed.

Main failure risk for future agents:
- Letting persistent-sandbox behavior contaminate fresh-account strategy.
- In sandbox, omitted `vatType` can silently inherit `0%`, so an agent might wrongly add a VAT lookup or guess a VAT code for fresh production tasks.
- Localized French wording `hors TVA` could tempt unnecessary branching, but it is still the same exact trusted-standard shape.

## 5. Sandbox Verification

Persistent sandbox credentials were used, not the original production credentials.

Sandbox proof executed:
1. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
2. `POST /product` with unique number, omitted `vatType`, and `priceExcludingVatCurrency: 3700`

Observed sandbox results:
- Filtered outgoing VAT returned only one row: `id=6`, `percentage=0`.
- The sandbox create succeeded but auto-filled `vatType.id=6`.
- The sandbox write response returned `priceIncludingVatCurrency=3700`, not `4625`.

What that proves:
- Persistent sandbox cannot prove an exact `25%` product-create path for this prompt family.
- The one-write shortcut remains correct only for the exact fresh-account standard-`25%` shape.
- In persistent sandbox, the same French wording is blocked for exact `25%` resolution because the filtered outgoing VAT result does not expose a valid `25%` row.

## 6. Playbook Changes

Updated existing files:
- `./trusted-standards/create-product.md`
- `./task-playbooks/create-product.md`

No new trusted standard created.
No new playbook created.
No `AGENTS.md` table change was needed.
No `common-endpoints.md` change was committed because the canonical path did not change; only additional evidence was added to the product-specific docs.

What changed:
- Added fresh-account production proof that the exact French wording `Maintenance` / `1327` / `3700 NOK hors TVA` / standard `25%` succeeds with one `POST /product`.
- Added persistent-sandbox proof that the same French wording still auto-fills `0%` in sandbox.
- Added an explicit warning that French `hors TVA` wording does not justify a VAT pre-read or alternate price-field search.

## 7. Commit

Commit hash:
- `6559c6cc52d4da466dcafda444565fc184a2eee2`

Commit message:
- `tripletex playbook: document french create-product fast path`

## 8. Reusable Heuristics

- If a create-product prompt is an exact fresh-account shape with standard `25%` VAT, trust the product standard and try the one-write path first.
- For this exact shape, omit `vatType`; prove correctness from `priceIncludingVatCurrency` plus returned `vatType`.
- Do not spend `GET /ledger/vatType` on exact fresh-account standard-`25%` product-create prompts.
- Do not let persistent-sandbox `0%` defaults override fresh-account production evidence.
- Do not treat localized excluding-VAT wording like `hors TVA`, `sem IVA`, `sans TVA`, or `ohne MwSt.` as a reason to abandon the exact trusted-standard shortcut.
- If the task is not the exact standard-`25%` shape, use the filtered outgoing VAT read and stop if the requested percentage is absent there instead of guessing a broader VAT code.