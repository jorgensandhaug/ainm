# 1. Task

Post-run learning pass for the scored Tripletex run that created product `Softwarelizenz` with number `7986`, price `24900 NOK` excluding VAT, standard `25%` VAT.

# 2. Reflection

What went well:
- The production run matched the exact trusted-standard shape.
- Execution used the intended one-call path: `POST /product` only.
- No avoidable reads, no `4xx`, no retry loop.
- Verification reused the write response and proved the scored fields directly.

What went poorly:
- The learning docs still had stale ambiguity from the earlier `Stockage cloud` run. `task-playbooks/create-product.md` still described the older two-call branch in a way that could be misread as the winning path.
- `trusted-standards/common-endpoints.md` still phrased product create prerequisites as if `vatType` resolution were always required, even though the exact fresh-account standard-`25%` shortcut does not need that read.

Mistakes:
- No production API mistake in this run.
- The only real weakness was documentation drift: older evidence was still present and could have nudged a future agent into an unnecessary VAT read.

Correct approach:
- For the exact fresh-account create-one-product shape with prompt-provided `name`, `number`, excluding-VAT price, and standard `25%` VAT wording, do one `POST /product` with only `name`, `number`, and `priceExcludingVatCurrency`.
- Verify from `response.value` that `priceIncludingVatCurrency` reflects `25%` and that a `vatType` was assigned.
- Stop.

# 3. Call Efficiency

The production run was minimal-call.

Production call count:
- `POST /product`

Wasted production calls:
- None.

Exact lower-call path for the next agent:
- `POST /product` with:
  - `name`
  - `number`
  - `priceExcludingVatCurrency`
- Reuse `response.value` for verification.
- Do not add `GET /ledger/vatType`, `GET /product`, or `GET /product/{id}`.

Lower-call replacement:
- None. The run already used the floor.

# 4. Root Causes

Primary root cause risk:
- Product VAT behavior is account-dependent. Persistent sandbox still defaults omitted `vatType` to `0%`, while fresh production accounts for this exact task shape can default correctly to standard `25%`.

Secondary root cause risk:
- Older playbook wording still preserved a non-minimal historical branch (`GET /ledger/vatType` then `POST /product`) too prominently.

Pitfalls to avoid:
- Do not spend `GET /ledger/vatType?typeOfVat=OUTGOING...` on the exact fresh-account standard-`25%` product-create shape.
- Do not generalize the omitted-`vatType` shortcut to exact `0%`, reduced-rate, or other exact-VAT tasks.
- Do not choose VAT from the unfiltered catalog or `typeOfVat=LEDGER`.
- Do not add `GET /product` pre-reads or verification reads for pure create tasks when the write response already proves the result.

# 5. Sandbox Verification

Sandbox credentials used only for this follow-up.

Sandbox proof script behavior:
1. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
2. `POST /product` without `vatType`

Observed sandbox result:
- Filtered outgoing VAT list returned only:
  - `id=6`, `number="6"`, `percentage=0`
- Omitted-`vatType` product create succeeded, but returned:
  - `priceExcludingVatCurrency=24900`
  - `priceIncludingVatCurrency=24900`
  - `vatType.id=6`

Interpretation:
- Persistent sandbox still auto-fills `0%`.
- Therefore sandbox re-proved the caveat: omitted `vatType` is not portable across accounts.
- Combined with the production run, the correct heuristic stays:
  - exact fresh-account standard-`25%` create-product prompt: one `POST /product`
  - non-standard or account-sensitive exact VAT: resolve filtered outgoing VAT first

# 6. Playbook Changes

Updated existing files. No new trusted standard or playbook created.

Changed paths:
- `./AGENTS.md`
- `./trusted-standards/create-product.md`
- `./trusted-standards/common-endpoints.md`
- `./task-playbooks/create-product.md`

What changed:
- Added fresh-account production confirmation from the `Softwarelizenz` run that the one-call path still returns correct `25%` results.
- Clarified that the earlier `Stockage cloud` two-call branch was historical proof, not the minimal path.
- Tightened common-endpoint prerequisite wording so `vatType` resolution is required only outside the exact fresh-account standard-`25%` shortcut.
- Re-stated the persistent-sandbox caveat with current proof: omitted `vatType` still auto-fills `0%` there.

# 7. Commit

Commit hash:
- `551d1dedb473e250be7a292c991f2736bcfe7cc7`

Commit message:
- `tripletex playbook: tighten create-product fast path`

# 8. Reusable Heuristics

- Exact trusted-standard match beats local over-analysis. Do not re-check `openapi.json` on an exact match.
- For pure create tasks, the write response is the primary verification source.
- Fresh-account shortcuts and persistent-sandbox behavior must stay separated in docs and in execution logic.
- Historical successful paths are not automatically minimal paths; scoring feedback can demote them.
- If a shortcut is account-dependent, scope it narrowly and document the boundary explicitly.