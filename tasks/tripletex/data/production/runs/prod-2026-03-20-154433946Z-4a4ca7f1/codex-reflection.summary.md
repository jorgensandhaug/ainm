## 1. Task
Post-run learning pass for the failed production run that was supposed to create a free accounting dimension, create two values, and book a manual voucher tied to one value.

## 2. Reflection
The original run matched the correct trusted standard quickly, built the right id-based voucher flow, and stopped immediately after the first live API call returned `403 {"error":"Invalid or expired token"}`. That stop was correct per repo rules.

What went poorly was external: the production credentials were unusable, so no Tripletex side effect could be completed. The main documentation gap I found was not in the production script itself, but in the learning artifacts: they did not explicitly state that `/ledger/accountingDimensionValue/list` is update-only, which left unnecessary room to wonder whether a 4-call batch-create path existed.

The correct approach for valid credentials is:
`POST /ledger/accountingDimensionName` -> `POST /ledger/accountingDimensionValue` -> `POST /ledger/accountingDimensionValue` -> `GET /ledger/account?number=6590,1920&fields=*` -> `POST /ledger/voucher`.

## 3. Call Efficiency
For the blocked-credentials branch, the production run was minimal-call: 1 API call, then stop on first-call `403 Invalid or expired token`. Wasted API calls: none.

For the actual task shape with valid credentials, the original run did not reach completion, so the relevant lower-call completion path is the proven 5-call path:
1. `POST /ledger/accountingDimensionName`
2. `POST /ledger/accountingDimensionValue` for `Innkjøp`
3. `POST /ledger/accountingDimensionValue` for `Logistikk`
4. `GET /ledger/account?number=6590,1920&fields=*`
5. `POST /ledger/voucher`

There is no trusted 4-call shortcut for this exact shape because:
- `account.number` on `POST /ledger/voucher` is not reliable; it has already failed with `422 postings.account.name: Kan ikke være null.`
- `/ledger/accountingDimensionValue/list` is `PUT` batch update, not batch create.

## 4. Root Causes
Primary root cause: unusable production session token. The first live call proved that conclusively.

Secondary root cause: docs were slightly underspecified for minimum-call analysis on this task shape.
- They did not explicitly call out that `/ledger/accountingDimensionValue/list` cannot create the two requested new values.
- They used a concrete prior example with `dimensionIndex=2`, but the real rule is broader: the created slot can be `1`, `2`, or `3`, and the voucher field must always be derived from the write response.

## 5. Sandbox Verification
Using the sandbox credentials, I proved the valid path with a clean 5-call run:
- Created dimension `KS154433946` -> `id=1006`, `dimensionIndex=3`
- Created value `Innkjøp` -> `id=15519`
- Created value `Logistikk` -> `id=15520`
- Resolved accounts via `GET /ledger/account?number=6590,1920&fields=*`
- Created voucher `id=608827949`, `number=21`

The successful voucher write proved:
- target posting amount `34250`
- counterposting amount `-34250`
- target posting linked under `freeAccountingDimension3.id=15519`
- therefore the field must be chosen dynamically from returned `dimensionIndex`, not assumed as `freeAccountingDimension1`

## 6. Playbook Changes
Updated existing artifacts; created no new files.
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [trusted-standards/common-endpoints.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md)
- [trusted-standards/create-free-accounting-dimension-and-book-voucher.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-free-accounting-dimension-and-book-voucher.md)
- [task-playbooks/create-free-accounting-dimension-and-book-voucher.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-free-accounting-dimension-and-book-voucher.md)

Changes made:
- documented that `/ledger/accountingDimensionValue/list` is update-only, so multi-value create still needs one POST per new value
- tightened the trusted-standard claim that 5 calls is the minimal realistic successful path
- added fresh sandbox proof for exact `6590` voucher flow with linkage on `freeAccountingDimension3`
- clarified again that returned `dimensionIndex` must drive the `freeAccountingDimension{1|2|3}` field choice

## 7. Commit
Commit hash: `20b2e5bd5c38a8014120c7fe047ee741eaa18127`

Commit message: `tripletex playbook: tighten free-dimension voucher path`

## 8. Reusable Heuristics
- On first-call `403 {"error":"Invalid or expired token"}`, stop immediately; do not spend recovery calls.
- For new free dimensions, never assume slot `1`; derive `freeAccountingDimension{n}` from the create response.
- For this task shape, do not waste time on `/ledger/accountingDimensionValue/list`; it does not create values.
- For manual vouchers, do not use `account.number` alone; resolve account ids first with one decisive `GET /ledger/account?...`.
- If the prompt does not score a balancing account, the proven fallback is a two-line voucher against existing bank account `1920`.
- Reuse write responses for dimension ids, value ids, voucher id, voucher number, posting amounts, and linked free-dimension id; no follow-up verification GET is needed when those fields are already present.