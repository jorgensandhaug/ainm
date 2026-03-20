## Task
Reflect the exact production run for creating free accounting dimension `Marked`, values `Privat` and `Offentlig`, then booking `44950 NOK` on `6300` linked to `Offentlig`; audit call efficiency; re-prove the path in persistent sandbox; update the reusable docs; commit the doc changes.

## Reflection
The production run went well. It matched the existing trusted standard exactly, used the standard five-call path, reused write responses, and avoided all avoidable `4xx` errors. The created production objects were correct on first attempt: dimension `Marked`, values `Privat` and `Offentlig`, and voucher `608864752` with the `6300` posting linked to the new `Offentlig` value.

Nothing went poorly in the scored run itself. The only subtle risk surfaced during reflection: the persistent sandbox was already full on free-dimension slots, so a sandbox research script needed a reuse branch for an existing dimension value. That is a sandbox-only artifact and must not leak into the fresh-account production playbook.

## Call Efficiency
The scored run was minimal-call for this exact task shape.

Wasted calls: none.

Exact lower-call path for the next agent: there is no proven lower-call replacement. Keep using:
1. `POST /ledger/accountingDimensionName`
2. `POST /ledger/accountingDimensionValue`
3. `POST /ledger/accountingDimensionValue`
4. `GET /ledger/account?number=6300,1920&fields=*`
5. `POST /ledger/voucher`

Why no four-call shortcut exists: same-day sandbox re-proof showed `POST /ledger/voucher` with `account: { number: 6300 }` still fails `422` with `postings.account.name: Kan ikke være null.`

## Root Causes
There was no production-side mistake. The relevant failure modes for future agents are:
- assuming `account.number` is enough on `POST /ledger/voucher`
- assuming the created dimension will always be `freeAccountingDimension1`
- spending speculative reads such as `GET /ledger/accountingDimensionName/search` or `GET /ledger/accountingDimensionValue/search` in a fresh-account create task
- overgeneralizing a persistent-sandbox “max 3 dimensions” blocker into production
- filtering `/ledger/account` results as strings instead of numeric `account.number`

## Sandbox Verification
Persistent sandbox proof used only sandbox credentials.

Findings:
- The sandbox had no free dimension slots left, so the proof reused existing dimension value `15253` under `dimensionIndex=1`.
- `POST /ledger/voucher` with `account: { number: 6300 }` returned `422` and validation message `postings.account.name: Kan ikke være null.`
- `GET /ledger/account?number=6300,1920&fields=*` returned usable ids `424191117` for `6300` and `424190862` for `1920`.
- The next id-based `POST /ledger/voucher` succeeded with voucher `608864963` and linked value id `15253`.

This confirms the production standard remains correct: the decisive account-id lookup is still required, and the five-call fresh-account path is still the minimum realistic scorer-safe path.

## Playbook Changes
Updated existing docs; created no new trusted standard or playbook.

Changed paths:
- [create-free-accounting-dimension-and-book-voucher.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-free-accounting-dimension-and-book-voucher.md)
- [create-free-accounting-dimension-and-book-voucher.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-free-accounting-dimension-and-book-voucher.md)

What changed:
- added exact production confirmation for `Marked` / `Privat` / `Offentlig` / `6300` / `44950`
- added exact sandbox re-proof for `6300`
- documented that sandbox search/reuse fallback is reflection-only and not part of the scored fresh-account path

## Commit
Commit hash: `e4ba5b7923a0a756bb77a39340ae0928d7b5c9a9`

Commit message: `tripletex playbook: refine free-dimension voucher path`

## Reusable Heuristics
- For exact create-free-dimension-plus-voucher tasks, trust the existing five-call standard; do not reopen `openapi.json`.
- Create the dimension first and always derive `freeAccountingDimension{1|2|3}` from returned `dimensionIndex`.
- Create each requested dimension value with its own `POST`; `/ledger/accountingDimensionValue/list` is not a batch-create shortcut.
- Resolve voucher accounts once with `GET /ledger/account?number=<target>,1920&fields=*`; use returned ids, not `account.number`.
- If a persistent sandbox is full on free-dimension slots during reflection, keep any search/reuse branch inside the research script only; do not import that branch into scored fresh-account guidance.