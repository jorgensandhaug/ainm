## 1. Task
Post-run reflection for the blocked production task: create and send a no-VAT customer invoice for `Porto Alegre Lda` (`826870192`) for `22700 NOK`, line `Design web`, then update the Tripletex learning artifacts and commit the changes.

## 2. Reflection
What went well:
- I stopped immediately after the first production API call returned `403 {"error":"Invalid or expired token"}`. That matched the run rules and avoided wasting more scored calls.
- I used the sandbox to prove both relevant invoice-send branches instead of guessing.

What went poorly:
- Before the first production call, I over-prepared for the happy path.
- I read `openapi.json` even though the task was already an exact trusted-standard match.
- My planned customer logic was not minimal for the likely production shape. I started from `GET /customer` with fallback create, but real production runs use fresh accounts, and this prompt did not explicitly say the customer already existed.
- I initially committed the doc update too early, then needed one follow-up correction commit to keep the trusted standard factually precise.

Correct approach:
- For this exact fresh-account shape, do not pre-read the customer.
- Use `POST /customer` with `invoiceSendMethod: "MANUAL"`, then filtered `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`, then `POST /invoice` with default `sendToCustomer=true`.
- Only use `GET /customer?...` first when the prompt explicitly implies an already-existing customer.

## 3. Call Efficiency
The executed production run was minimal-call under blocked credentials:
- Actual calls made: `1`
- Call made: first API attempt, which returned `403 Invalid or expired token`
- Wasted production calls after the block: `0`

The intended happy-path logic was not minimal:
- Planned wasted call: speculative `GET /customer?organizationNumber=...&fields=*` for a fresh-account prompt that did not explicitly say the customer already existed

Exact lower-call path the next agent should follow:
- Fresh-account / customer-not-explicitly-existing shape: `POST /customer` -> `GET /ledger/vatType?...` -> `POST /invoice`
- Existing-customer shape: `GET /customer?organizationNumber=...&fields=*` -> `GET /ledger/vatType?...` -> `POST /invoice`

Critical note:
- Even for explicit no-VAT lines, still resolve the filtered outgoing `0%` VAT row and send `orderLines[].vatType`. Do not omit it.

## 4. Root Causes
- I overweighted the phrase “to customer X” as an existing-customer signal and underweighted the environment rule that real runs use fresh accounts.
- I treated an exact trusted-standard match as if it still needed spec confirmation.
- I optimized for robustness before auth had been proven, which is acceptable for correctness but not optimal for score.
- I made the first documentation commit before the wording was fully precise, which forced a second cleanup commit.

## 5. Sandbox Verification
Sandbox credentials used:
- `https://kkpqfuj-amager.tripletex.dev/v2`

Verified outcomes:
- Exact task identity, customer absent then created by fallback script:
  - customer created: `id 108258049`
  - VAT resolved: `id 6`, `0%`
  - invoice created/sent: `id 2147536447`, `invoiceNumber 57`, `amountExcludingVatCurrency 22700`, `amountCurrency 22700`
- Exact task identity, existing-customer branch:
  - customer resolved by `GET /customer?organizationNumber=826870192&fields=*`
  - VAT resolved: `id 6`, `0%`
  - invoice created/sent: `id 2147536466`, `invoiceNumber 58`, `amountExcludingVatCurrency 22700`, `amountCurrency 22700`
- Fresh-account-style direct-create proof on the same task shape with a fresh sandbox customer:
  - direct `POST /customer` succeeded without a pre-read
  - VAT resolved: `id 6`, `0%`
  - invoice created/sent: `id 2147536572`, `invoiceNumber 61`, `amountExcludingVatCurrency 22700`, `amountCurrency 22700`

What this proved:
- Default `POST /invoice` send path is correct.
- Filtered outgoing VAT resolution is still required for no-VAT direct lines.
- The fresh-account branch does not need `GET /customer` first.

## 6. Playbook Changes
Updated existing artifacts. No new trusted standard or playbook created.

Changed paths:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [trusted-standards/create-and-send-customer-invoice.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-and-send-customer-invoice.md)
- [trusted-standards/common-endpoints.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md)
- [task-playbooks/create-and-send-customer-invoice.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-and-send-customer-invoice.md)

What changed:
- Added explicit low-call rule for fresh-account create-and-send invoice tasks where the prompt only gives customer `name + organizationNumber`.
- Added explicit rule that prompt wording like `customer X (org)` is not enough to justify `GET /customer` in fresh-account runs.
- Added explicit no-VAT direct-line guidance: still resolve filtered outgoing `0%` VAT and send it on the line.
- Recorded sandbox proof for both fresh-account and existing-customer branches.

## 7. Commit
Committed documentation changes:
- `14d6054` `tripletex playbook: tighten create-and-send invoice fast path`
- `c1a8f58` `tripletex playbook: clarify fresh-account invoice sandbox proof`

## 8. Reusable Heuristics
- If the first production call returns `403 {"error":"Invalid or expired token"}`, stop immediately. Do not spend fallback calls.
- On exact trusted-standard matches, do not reopen `openapi.json` unless the standard itself says to.
- In fresh-account invoice tasks, business identity alone does not prove the customer already exists.
- For create-and-send invoice tasks, default send path is the invoice create itself. Do not split into create-then-send unless the prompt explicitly requires it.
- For direct invoice lines, including explicit no-VAT lines, do not omit `vatType`. Resolve it from filtered outgoing VAT on the invoice date.
- Reuse invoice write responses for totals and invoice number; do not add a verification `GET` unless the prompt scores fields missing from the write response.