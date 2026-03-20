## 1. Task
Post-run learning pass for the production task: create free accounting dimension `Region`, create values `Vestlandet` and `Midt-Norge`, then book one manual voucher on account `6860` for `47500 NOK` linked to `Midt-Norge`.

## 2. Reflection
Production run went well. It matched the exact trusted standard, used the intended five-call sequence, reused write responses for ids, and stopped without extra verification reads.

Nothing materially went wrong in production. The only weak spot was evidence breadth: docs already proved the pattern on `7000` and `6590`, but not yet on `6860`, so this follow-up mainly tightened the evidence rather than correcting a bad execution.

Correct approach remains:
`POST /ledger/accountingDimensionName` -> `POST /ledger/accountingDimensionValue` -> `POST /ledger/accountingDimensionValue` -> `GET /ledger/account?number=<target>,1920&fields=*` -> `POST /ledger/voucher`.

## 3. Call Efficiency
Production run was minimal-call for this exact task shape: 5 calls. Wasted calls: none.

There is no proven lower-call production path for this shape.
The next agent should use exactly:
1. `POST /ledger/accountingDimensionName`
2. `POST /ledger/accountingDimensionValue`
3. `POST /ledger/accountingDimensionValue`
4. `GET /ledger/account?number=6860,1920&fields=*`
5. `POST /ledger/voucher`

Rejected lower-call shortcut:
- `POST /ledger/voucher` with `account.number` instead of resolved `account.id` still fails `422 postings.account.name: Kan ikke være null.`

## 4. Root Causes
Main failure mode to avoid is not production behavior, but bad assumptions:
- assuming voucher postings accept ordinary ledger numbers without an account-id lookup
- assuming free-dimension slot `1` instead of reusing returned `dimensionIndex`
- interpreting `422 Maximum of 3 accounting dimensions allowed` as a cue to burn calls on speculative reuse/update/delete in a create-only production task
- comparing `/ledger/account` `number` as string instead of integer

## 5. Sandbox Verification
Used only sandbox creds.

Findings:
- `POST /ledger/accountingDimensionName` returned `422 Maximum of 3 accounting dimensions allowed` in the persistent sandbox. This confirms the documented blocker.
- Reused existing active dimension value `15253` under dimension `885` / `dimensionIndex=1` for voucher-path verification.
- Number-only shortcut on `6860` failed:
  - `POST /ledger/voucher` with `account: { "number": 6860 }`
  - response: `422`
  - validation: `postings.account.name: Kan ikke være null.`
- Account-id path succeeded:
  - `GET /ledger/account?number=6860,1920&fields=*` returned `6860 -> id 424191153` and `1920 -> id 424190862`
  - next `POST /ledger/voucher` succeeded with voucher `608829214`
  - write response proved linked `freeAccountingDimension1.id = 15253`

This proves again that the trusted fast path still needs the single account lookup and that the voucher write response is sufficient verification.

## 6. Playbook Changes
Updated existing artifacts; created no new files.

Changed paths:
- `AGENTS.md`
- `trusted-standards/common-endpoints.md`
- `trusted-standards/create-free-accounting-dimension-and-book-voucher.md`
- `task-playbooks/create-free-accounting-dimension-and-book-voucher.md`

What changed:
- added `6860` to the documented voucher-account shortcut failure evidence
- updated the trusted standard/playbook with the new same-day sandbox proof on `6860`
- kept canonical production flow unchanged at 5 calls

## 7. Commit
`fcf7a5c`  
`tripletex playbook: tighten free-dimension voucher evidence`

## 8. Reusable Heuristics
- Exact-match trusted standard was already correct; do not over-explore.
- For create-only free-dimension + voucher tasks, five calls is the minimum realistic path.
- Never try to save the `/ledger/account` read by sending only `account.number` on `POST /ledger/voucher`.
- Treat `Maximum of 3 accounting dimensions allowed` as an account-state blocker in production create-only runs.
- Reuse write responses aggressively; no follow-up `GET /ledger/voucher/{id}` is needed when the write already proves ids, amounts, and linked free-dimension value.