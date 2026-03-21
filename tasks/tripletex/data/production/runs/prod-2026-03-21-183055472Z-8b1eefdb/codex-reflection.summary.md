# Codex Reflection Summary

## Task

Create a free accounting dimension "Region" with values "Sør-Norge" and "Midt-Norge", then book a voucher on account 6540 for 5150 NOK linked to dimension value "Sør-Norge".

## Reflection

This run was a perfect execution of the trusted standard `create-free-accounting-dimension-and-book-voucher`. The agent:

1. Correctly identified the task as an exact match for the trusted standard
2. Read the trusted standard before writing any code
3. Wrote a single script executing all 5 calls sequentially
4. All 5 calls succeeded on the first attempt with 0 errors
5. Correctly used `row: 1` and `row: 2` on voucher postings (avoiding the trap that burned the previous run)
6. Correctly used the returned `dimensionIndex` to pick the right `freeAccountingDimension{n}` field
7. Correctly matched the scored value by `displayName` rather than by creation order

What went well:
- The `row` trap documented from the previous run (Prosjekttype/7000/32550) was successfully avoided
- All payload shapes matched the proven winning format exactly
- No unnecessary calls, no recovery branches needed

What could be improved:
- Nothing — this was a textbook optimal execution

## Call Efficiency

**Minimal-call: YES** — 5 calls, 0 errors.

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | `POST /ledger/accountingDimensionName` | 201 | Create dimension "Region" |
| 2 | `POST /ledger/accountingDimensionValue` | 201 | Create value "Sør-Norge" |
| 3 | `POST /ledger/accountingDimensionValue` | 201 | Create value "Midt-Norge" |
| 4 | `GET /ledger/account?number=6540,1920&fields=*` | 200 | Resolve account IDs |
| 5 | `POST /ledger/voucher` | 201 | Book balanced voucher linked to Sør-Norge |

No wasted calls. This is the proven minimum for the create-dimension + two-values + voucher task shape.

**Why 5 is the minimum:**
- Call 1: required — dimension must be created before values
- Calls 2-3: required — no batch POST exists for dimension values (PUT /list is update-only)
- Call 4: required — voucher postings require `account.id`; number-only, number+name, and id=0+number+name all fail with 422
- Call 5: required — the voucher itself

## Root Causes

No mistakes occurred in this run. The previous run (Prosjekttype / 7000 / 32550) scored 2.96/4 because it omitted `row` on voucher postings. That trap was documented and this run avoided it by including `row: 1` and `row: 2` from the start.

## Sandbox Verification

Three shortcut attempts were tested in the persistent sandbox to confirm no lower-call path exists:

1. **`account: { number: 6540, name: "Inventar" }` (no id)** → `422 Internt felt (account) - Feltet må fylles ut.`
2. **`account: { number: "6540" }` (string, no name/id)** → `422 postings.account.name: Kan ikke være null.`
3. **`account: { id: 0, number: 6540, name: "Inventar" }` (id=0)** → `422 Internt felt (account) - Feltet må fylles ut.`

All three confirm: account ID resolution via `GET /ledger/account` is mandatory. There is no 4-call shortcut for this task shape.

## Playbook Changes

Updated existing files (no new files created):

- `./trusted-standards/create-free-accounting-dimension-and-book-voucher.md` — added 8b1eefdb production evidence (first perfect 5-call 0-error run) and sandbox proof that number+name without id also fails
- `./task-playbooks/create-free-accounting-dimension-and-book-voucher.md` — added same production evidence and sandbox finding

No AGENTS.md changes needed — the trusted standard and playbook were already correctly listed.

## Commit

- **Hash:** `40f21ed4`
- **Message:** `tripletex playbook: create-free-accounting-dimension-and-book-voucher — add 8b1eefdb production evidence: first perfect 5-call 0-error run, sandbox proves number+name without id also fails`

## Reusable Heuristics

1. **`row` is mandatory on voucher postings** — always include `row: 1`, `row: 2` etc. starting at 1 (never 0). This was the sole difference between the previous 6-call run and this perfect 5-call run.
2. **Account ID is the only valid reference for voucher postings** — three different number-based shortcuts were tested (number-only, number+name, id=0+number+name) and all fail. The `GET /ledger/account` call is mandatory.
3. **Use `dimensionIndex` from the create response** — it may be 1, 2, or 3 depending on existing dimensions in the account. Never hardcode `freeAccountingDimension1`.
4. **Match the scored value by `displayName`** — the value linked to the voucher is determined by the prompt, not by creation order. Always select by exact name match.
5. **The 5-call path is the proven optimum** — no batch create for dimension values, no number-only voucher shortcut. This has been confirmed across 5 production runs and 10+ sandbox verifications.
