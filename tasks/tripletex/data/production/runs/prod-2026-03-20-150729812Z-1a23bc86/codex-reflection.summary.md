## Task

Post-run learning pass for the production task: create free accounting dimension `Kostsenter`, create values `IT` and `HR`, then book a voucher on account `6590` for `38100 NOK` linked to `HR`. Audited scored-run efficiency, re-proved the path in sandbox, updated docs, and committed only the learning artifacts.

## Reflection

The original production run went well on the important axis: it matched the trusted standard exactly, used the right dependency order, reused write responses, and finished with the correct side effects and no extra verification reads.

What was weak was not the scored execution but the documentation around it. The docs already said number-only voucher account refs fail, but only with `7000` as the example. They did not explicitly call out that `dimensionName` is capped at `20` chars or that `dimensionIndex` can come back as `2` or `3`, not only `1`. In the sandbox follow-up, I immediately hit the missing length constraint because I used an overlong unique test name and got `422`.

Correct approach:
- Keep the production flow at 5 calls for the exact two-value task.
- Reuse `dimensionIndex` from the create response every time.
- Never assume `freeAccountingDimension1`.
- Never try to skip the account lookup with `account.number` only.
- Treat `dimensionName > 20` as blocked for exact-name tasks; do not truncate.

## Call Efficiency

The production run was minimal-call for this exact task shape.

API calls used:
1. `POST /ledger/accountingDimensionName`
2. `POST /ledger/accountingDimensionValue` for `IT`
3. `POST /ledger/accountingDimensionValue` for `HR`
4. `GET /ledger/account?number=6590,1920&fields=*`
5. `POST /ledger/voucher`

Wasted calls: none.

Exact lower-call path for the next agent: none lower was proven realistic. The only theoretical 4-call variant is to skip the account lookup and post the voucher with account numbers directly, but sandbox re-proved that this fails with `422 postings.account.name: Kan ikke være null.`. So the next agent should use the same 5-call path.

## Root Causes

- Documentation gap: `dimensionName` max length `20` was not captured.
- Documentation gap: `dimensionIndex` variability was not captured strongly enough; persistent sandbox assigned `2`.
- Documentation gap: number-only voucher-account failure was documented with `7000` only, leaving room for a bad assumption that `6590` might work.
- No scored-run execution bug occurred; the issue was incomplete reusable guidance.

## Sandbox Verification

Sandbox base URL used: `https://kkpqfuj-amager.tripletex.dev/v2`

Proof points:
- First probe with an overlong `dimensionName` failed:
  - `POST /ledger/accountingDimensionName`
  - `422`
  - validation: `dimensionName` length must be between `0` and `20`
- Successful create flow then used short unique names:
  - dimension id `971`
  - dimension name `Kostsenter 389254`
  - returned `dimensionIndex=2`
  - values:
    - `IT389254` id `15444`
    - `HR389254` id `15445`
- Lower-call shortcut disproved:
  - `POST /ledger/voucher` with `account: { "number": "6590" }` and balancing `1920`
  - `422`
  - validation: `postings.account.name: Kan ikke være null.`
- Correct path proved:
  - `GET /ledger/account?number=6590,1920&fields=*`
  - resolved `6590` id `424191138` name `Annet driftsmateriale`
  - resolved `1920` id `424190862` name `Bankinnskudd`
  - `POST /ledger/voucher` with account ids succeeded
  - voucher id `608827002`, number `17`
  - target posting amount `38100`
  - linked dimension value id `15445`

## Playbook Changes

Updated existing artifacts; created no new files.

Changed paths:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [trusted-standards/common-endpoints.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md)
- [trusted-standards/create-free-accounting-dimension-and-book-voucher.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-free-accounting-dimension-and-book-voucher.md)
- [task-playbooks/create-free-accounting-dimension-and-book-voucher.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-free-accounting-dimension-and-book-voucher.md)

What changed:
- Added `dimensionName <= 20` constraint.
- Added explicit guidance to reuse returned `dimensionIndex` and not assume slot `1`.
- Strengthened voucher guidance to note that number-only account refs also fail on `6590`, so the 5-call path remains minimal realistic.
- Tightened common-endpoint notes to reflect the same.

## Commit

Commit hash: `f60ed85`

Commit message: `tripletex playbook: tighten free-dimension voucher guidance`

## Reusable Heuristics

- For exact create-free-dimension-plus-voucher tasks, default to 5 calls, not 4.
- If the prompt creates multiple new values, each value needs its own `POST /ledger/accountingDimensionValue`.
- Reuse the returned `dimensionIndex`; derive `freeAccountingDimension{n}` from it.
- Treat free-dimension names as exact scored text, but they still must fit Tripletex validation; never silently truncate.
- For manual vouchers, resolve account ids first with one decisive `GET /ledger/account?number=<target>,1920&fields=*`.
- Trust write responses for proof; do not add `GET /ledger/voucher/{id}` unless the task explicitly scores fields missing from the write response.