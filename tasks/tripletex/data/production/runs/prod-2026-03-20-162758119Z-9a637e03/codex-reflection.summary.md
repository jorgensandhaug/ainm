## 1. Task

Post-run learning pass for the production task: create free accounting dimension `Marked`, add values `Offentlig` and `Privat`, then book a voucher on account `7300` for `37250 NOK` linked to `Privat`.

## 2. Reflection

What went well:
- The original run matched the correct trusted standard immediately.
- The production write sequence reached the right objects and final state.
- No production `4xx` was triggered.

What went poorly:
- The first production script misread `/ledger/account` response `account.number` as a string instead of an integer.
- That local bug caused a false “missing account 7300” stop after the correct account lookup had already succeeded.
- Recovery was done by adding idempotency/search reads against production credentials instead of fixing the local type bug and recognizing that the first 4 calls had already completed successfully.

Correct approach:
- Use the exact 5-call trusted path.
- Treat `account.number` as numeric when filtering `/ledger/account` results locally.
- After the first successful `GET /ledger/account?number=7300,1920&fields=*`, go straight to `POST /ledger/voucher`.

## 3. Call Efficiency

The production run was not minimal-call.

Minimal realistic path for this exact task:
1. `POST /ledger/accountingDimensionName`
2. `POST /ledger/accountingDimensionValue` for `Offentlig`
3. `POST /ledger/accountingDimensionValue` for `Privat`
4. `GET /ledger/account?number=7300,1920&fields=*`
5. `POST /ledger/voucher`

Actual production path:
1. `POST /ledger/accountingDimensionName`
2. `POST /ledger/accountingDimensionValue`
3. `POST /ledger/accountingDimensionValue`
4. `GET /ledger/account?number=7300,1920&fields=*`
5. local script abort from string-vs-integer bug
6. `GET /ledger/accountingDimensionName?activeOnly=true&fields=*&count=1000`
7. `GET /ledger/accountingDimensionValue/search?dimensionIndex=1&activeOnly=true&showInVoucherRegistration=true&fields=*&count=1000`
8. `GET /ledger/account?number=7300,1920&fields=*`
9. `POST /ledger/voucher`

Wasted production calls:
- `GET /ledger/accountingDimensionName?activeOnly=true&fields=*&count=1000`
- `GET /ledger/accountingDimensionValue/search?...`
- duplicate `GET /ledger/account?number=7300,1920&fields=*`

Net:
- Minimal path: 5 calls
- Actual production path: 8 Tripletex calls before completion
- Wasted calls: 3
- Avoidable `4xx`: 0 in production

## 4. Root Causes

- Weak local typing: assumed `account.number` was a string.
- Recovery bias: after a local bug, the run switched to production-side re-discovery instead of repairing the local parser.
- Missing explicit heuristic in docs: `/ledger/account` returns integer account numbers, and the 3-slot free-dimension limit is a real blocker.

## 5. Sandbox Verification

Sandbox credentials were used only for follow-up verification.

Findings:
- `POST /ledger/accountingDimensionName` in persistent sandbox returned `422` with validation message `Maximum of 3 accounting dimensions allowed`.
- `GET /ledger/accountingDimensionName?fields=*&count=1000` proved all three free-dimension slots were already occupied:
  - slot `1`: `Post Run Dim 951976`
  - slot `2`: `Kostsenter 389254`
  - slot `3`: `KS154433946`
- `GET /ledger/accountingDimensionValue/search?...` confirmed existing active values for those slots.

Voucher-path proof in sandbox:
- `GET /ledger/account?number=7300,1920&fields=*` returned both accounts and showed `account.number` as integers `7300` and `1920`.
- `POST /ledger/voucher` then succeeded using existing dimension value `15253` on slot `1`.
- Result: voucher `608829052` / number `25`, with linked `freeAccountingDimension1.id = 15253`.

Conclusion:
- The create-new-dimension path is blocked in the current persistent sandbox by account state.
- The manual-voucher half of the trusted flow is still proven correct.
- The production exact 5-call path remains the right path for fresh accounts.

## 6. Playbook Changes

Updated existing docs; no new trusted standard or playbook created.

Changed paths:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [trusted-standards/common-endpoints.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md)
- [trusted-standards/create-free-accounting-dimension-and-book-voucher.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-free-accounting-dimension-and-book-voucher.md)
- [task-playbooks/create-free-accounting-dimension-and-book-voucher.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-free-accounting-dimension-and-book-voucher.md)

What changed:
- Added explicit note that `/ledger/account` returns integer `account.number`.
- Added explicit blocker rule for `422 Maximum of 3 accounting dimensions allowed`.
- Added warning not to spend speculative idempotency reads in fresh-account create-only runs after a local bug.
- Kept the canonical exact path at 5 calls.

## 7. Commit

Commit hash:
- `cfed1f85ad4588776077e5a7de4fbed5157ed837`

Commit message:
- `tripletex playbook: tighten free-dimension voucher flow`

## 8. Reusable Heuristics

- For create-only free-dimension tasks on fresh accounts, do not pre-read existing dimensions or values; the canonical path is still 5 calls.
- For manual vouchers, never use `account.number` in `POST /ledger/voucher`; resolve ids with one decisive `/ledger/account` read.
- When filtering `/ledger/account` results locally, compare `account.number` numerically.
- If a local script fails after successful writes, fix the local logic first; do not add production-side search reads unless the task itself requires lookup.
- If `POST /ledger/accountingDimensionName` returns `422 Maximum of 3 accounting dimensions allowed`, treat the run as blocked by account state unless the prompt explicitly asks for reuse/update/delete behavior.