## 1. Task

Post-run learning pass for the scored Tripletex task: create free accounting dimension `Marked`, create values `Offentlig` and `Privat`, then book a manual voucher on `7300` for `37250 NOK` linked to `Privat`.

## 2. Reflection

The production run went well. It matched the existing trusted standard exactly and executed the known low-risk path without extra reads or avoidable `4xx`s.

Nothing went materially wrong in production. The only weak spot was evidence freshness: before this reflection pass, the docs already proved the five-call path for nearby accounts (`6300`, `6590`, `6860`, `7000`), but not yet this exact `7300` prompt variant. The correct approach was still the same trusted-standard path, and the sandbox re-proof now closes that evidence gap.

## 3. Call Efficiency

The run was minimal-call.

Used path:
1. `POST /ledger/accountingDimensionName`
2. `POST /ledger/accountingDimensionValue`
3. `POST /ledger/accountingDimensionValue`
4. `GET /ledger/account?number=7300,1920&fields=*`
5. `POST /ledger/voucher`

Wasted calls: none.

Lower-call replacement path for the next agent: none. The realistic floor for this exact task shape is still 5 calls.

Why no 4-call shortcut exists:
- `PUT /ledger/accountingDimensionValue/list` is update-only, not create.
- `POST /ledger/voucher` with `account: { "number": 7300 }` still fails `422` with `postings.account.name: Kan ikke være null.`.
- Therefore one decisive `GET /ledger/account?...` is still required before the voucher write.

## 4. Root Causes

- No production mistake occurred.
- The only documentation gap was exact-task evidence for account `7300`.
- Root cause of potential future inefficiency: an agent might over-generalize from other Tripletex writes and assume `account.number` is enough on voucher postings.
- Root cause of potential future wrong recovery: an agent might see a full persistent sandbox and back-port sandbox reuse/search behavior into fresh-account production runs.

## 5. Sandbox Verification

Used only the provided sandbox credentials.

Findings:
- Persistent sandbox was already full on free dimensions. `POST /ledger/accountingDimensionName` could not be used as a fresh-create proof there.
- I reused existing active dimension value `15253` only for voucher-path verification in sandbox.
- The attempted shortcut `POST /ledger/voucher` with `account: { "number": 7300 }` failed with `422` and validation message `postings.account.name: Kan ikke være null.`.
- `GET /ledger/account?number=7300,1920&fields=*` returned both needed accounts, with `number` as integers.
- The next id-based `POST /ledger/voucher` succeeded as voucher `608867443`.

This confirms the same conclusion as production: exact `7300` free-dimension voucher tasks still require the 5-call standard path in fresh accounts.

## 6. Playbook Changes

Updated existing docs. No new trusted standard or playbook was created.

Changed paths:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [trusted-standards/create-free-accounting-dimension-and-book-voucher.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-free-accounting-dimension-and-book-voucher.md)
- [task-playbooks/create-free-accounting-dimension-and-book-voucher.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-free-accounting-dimension-and-book-voucher.md)

What changed:
- Added the exact `Marked` / `Offentlig` / `Privat` / `7300` / `37250` production proof.
- Added the same-day sandbox re-proof that `7300` still rejects the number-only voucher shortcut.
- Extended the AGENTS gotcha to include `7300` and stated explicitly that the exact prompt shape still has no trusted four-call shortcut.

## 7. Commit

`65a8e70`  
`tripletex playbook: refresh free-dimension voucher proof`

## 8. Reusable Heuristics

- For exact create-free-dimension-plus-manual-voucher tasks, default to the 5-call standard path. Do not re-open `openapi.json` if the trusted standard matches exactly.
- Reuse `dimensionIndex` from the dimension-name create response. Never assume slot `1`.
- Create each new dimension value with its own `POST /ledger/accountingDimensionValue`; there is no batch-create shortcut.
- On `POST /ledger/voucher`, use `account: { "id": ... }`, not `account.number`.
- When filtering `/ledger/account` results locally, compare `account.number` numerically, not as strings.
- If the persistent sandbox is full on free dimensions, keep any reuse/search fallback confined to sandbox research. Do not import that behavior into fresh-account create-only production runs.