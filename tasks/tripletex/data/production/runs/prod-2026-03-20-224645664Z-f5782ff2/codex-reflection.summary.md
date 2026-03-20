## 1. Task

Post-run learning pass for the scored Tripletex run that created free accounting dimension `Marked`, values `Offentlig` and `Privat`, then booked a `6340` voucher for `25200` linked to `Offentlig`.

## 2. Reflection

What went well:
- Production run executed the trusted-standard path exactly enough to finish with perfect state and zero Tripletex errors.
- The script reused write responses correctly and stopped after the voucher write.
- The final state matched the prompt: dimension `Marked`, both values created, voucher linked to `Offentlig`.

What went poorly:
- I still opened the playbook after the trusted standard even though this was an exact trusted-standard match. That cost local time, not API calls.
- I introduced a local fallback bug around missing `1920` handling, but caught and fixed it before the first network call.

Correct approach:
- Stay on the exact trusted-standard path.
- Create values in prompt order.
- Link the voucher by exact returned value `displayName`, not by assumed first/second position.
- Resolve voucher accounts with one decisive `GET /ledger/account?number=<target>,1920&fields=*`, then use account ids in `POST /ledger/voucher`.

## 3. Call Efficiency

The production run was minimal-call for this exact task shape.

Exact call path used:
1. `POST /ledger/accountingDimensionName`
2. `POST /ledger/accountingDimensionValue` for `Offentlig`
3. `POST /ledger/accountingDimensionValue` for `Privat`
4. `GET /ledger/account?number=6340,1920&fields=*`
5. `POST /ledger/voucher`

Wasted Tripletex API calls:
- None.

Lower-call path for the next agent:
- Same 5-call path above. No trusted 4-call shortcut exists.
- `PUT /ledger/accountingDimensionValue/list` is not a create shortcut.
- Number-only `account.number` voucher postings are still invalid for this family.

## 4. Root Causes

- Main risk in this task family is false optimization: trying to skip the account lookup and send `account: { "number": ... }` in `POST /ledger/voucher`.
- Secondary risk is wrong value linkage logic: assuming the linked dimension value is always the first or second created value.
- Persistent sandbox can mislead here because all three free-dimension slots may already be occupied; that blocker does not change the fresh-account production standard.

## 5. Sandbox Verification

Used sandbox credentials only.

Results:
- `POST /ledger/accountingDimensionName` hit `422 Maximum of 3 accounting dimensions allowed`, confirming the persistent sandbox is full on free dimensions.
- Reused existing sandbox value `15253` only for voucher-path proof.
- Number-only `POST /ledger/voucher` on account `6340` failed with `422 postings.account.name: Kan ikke være null.`
- `GET /ledger/account?number=6340,1920&fields=*` followed by id-based `POST /ledger/voucher` succeeded with voucher `608868815`.

Conclusion:
- Fresh-account exact path remains the 5-call create-dimension-plus-voucher flow.
- Persistent-sandbox full-dimension state is a blocker artifact, not a reason to add reuse/search logic to the production standard.

## 6. Playbook Changes

Updated existing docs. No new trusted standard or playbook created.

Changed paths:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [create-free-accounting-dimension-and-book-voucher.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-free-accounting-dimension-and-book-voucher.md)
- [create-free-accounting-dimension-and-book-voucher.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-free-accounting-dimension-and-book-voucher.md)

What changed:
- Added the reusable rule that value creation order should follow the prompt, but voucher linkage must select by exact returned `displayName`, not by assumed position/create order.

## 7. Commit

`42ed64645e3c8ee9156805bcccefeea1c08ae63a`

`tripletex playbook: clarify dimension value selection`

## 8. Reusable Heuristics

- For exact free-dimension-create-plus-voucher tasks, the floor is still 5 Tripletex calls.
- Do not use `account.number` inside `POST /ledger/voucher`; resolve ids first.
- Do not use `/ledger/accountingDimensionValue/list` for creation.
- Do not add lookup reads for dimensions or values in fresh-account create-only runs.
- Create new dimension values in prompt order.
- Pick the voucher-linked value by exact returned `displayName`, not by first/second position.
- In persistent sandbox, `422 Maximum of 3 accounting dimensions allowed` means sandbox-state blocker, not production-path change.