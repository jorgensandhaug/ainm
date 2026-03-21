# Reflection: prod-2026-03-21-173948484Z-b86c64d8

## Task

Create free accounting dimension "Prosjekttype" with values "Forskning" and "Internt", then book a voucher on account 7000 for 32550 NOK linked to dimension value "Internt". Exact trusted-standard match for `create-free-accounting-dimension-and-book-voucher`.

## Reflection

**What went well:**
- Immediately identified the exact trusted-standard match
- First 4 API calls (dimension name, 2 values, account lookup) all succeeded on first try
- Correct `dimensionIndex` reuse (1), correct value linking ("Internt" id=18359)
- Perfect final state: 13/13 score_raw, 6/6 checks passed

**What went poorly:**
- First `POST /ledger/voucher` failed with 422 because postings omitted `row` field
- Required a retry (6th call), costing ~1 point in efficiency scoring

**Why it happened:**
- The trusted standard's Payload Rules section documented `voucherType: null` and amount fields but did not mention `row` as mandatory
- The playbook's "Winning Payload Shape" included `row: 1`/`row: 2` in the example but the agent read only the trusted standard (correct behavior for exact matches)
- Without explicit `row`, Tripletex defaults to row 0, which is reserved for system-generated postings

## Call Efficiency

**Not minimal.** 6 calls made, 5 were the minimum.

| # | Call | Status | Necessary? |
|---|------|--------|------------|
| 1 | POST /ledger/accountingDimensionName | 201 | Yes |
| 2 | POST /ledger/accountingDimensionValue (Forskning) | 201 | Yes |
| 3 | POST /ledger/accountingDimensionValue (Internt) | 201 | Yes |
| 4 | GET /ledger/account?number=7000,1920&fields=* | 200 | Yes |
| 5 | POST /ledger/voucher (without row) | 422 | **WASTED** |
| 6 | POST /ledger/voucher (with row) | 201 | Yes (recovery) |

**Wasted calls:** 1 (call 5, the failed voucher POST)
**Avoidable 4xx:** 1 (the 422 from missing `row`)

**Lower-call path:** The same 5-call path but with `row: 1` and `row: 2` on postings from the start.

## Root Causes

1. **Incomplete trusted standard**: The Payload Rules section listed voucher posting requirements but omitted `row` as mandatory. The "Winning Payload Shape" existed only in the playbook, not in the trusted standard.
2. **Agent followed the trusted standard correctly** — the fault was in the documentation, not in the agent's execution strategy.

## Sandbox Verification

Persistent sandbox on 2026-03-21 proved:
- `POST /ledger/voucher` without `row` → `422 Posteringene på rad 0 (guiRow 0) er systemgenererte`
- Same payload with only `row: 1`/`row: 2` added → `201` (voucher 609065728)
- `date`, `description`, `currency` on individual postings are optional (auto-filled)
- The true minimal posting shape is: `row`, `account.id`, `amount`, `amountCurrency`, `amountGross`, `amountGrossCurrency`, and optionally `freeAccountingDimension{n}.id`

## Playbook Changes

Updated existing files (no new files created):

1. **`./trusted-standards/create-free-accounting-dimension-and-book-voucher.md`**:
   - Added `row` requirement to Payload Rules under `POST /ledger/voucher`
   - Added note that `date`/`description`/`currency` on postings are optional
   - Added new "Minimal Voucher Posting Shape" section
   - Added `row` validation trap
   - Added 2026-03-21 sandbox proof and production run result to OpenAPI/Sandbox Status

2. **`./task-playbooks/create-free-accounting-dimension-and-book-voucher.md`**:
   - Simplified "Winning Payload Shape" to show true minimal shape (removed optional `date`/`description`/`currency` from postings)
   - Added `row` validation trap
   - Added 2026-03-21 sandbox verification and production run finding to Verified Findings

## Commit

```
5dc00f88 tripletex playbook: free-dimension-voucher — add mandatory row field, voucher postings must start at row 1 not 0
```

## Reusable Heuristics

1. **`row` is mandatory on voucher postings** — start at 1, never 0. Row 0 is reserved for system-generated postings.
2. **`date`, `description`, `currency` on individual postings are optional** — Tripletex auto-fills from voucher-level values. Don't over-specify.
3. **Trusted standards must include every field that causes a 422 if omitted** — if the "Winning Payload Shape" in the playbook has a field, and that field is required, the trusted standard's Payload Rules must also list it.
4. **Score impact of a single avoidable 422**: This run scored 2.96/4 instead of an estimated ~3.5+/4, costing approximately 0.5-1.0 points from a single retry.
5. **The 5-call path remains the minimum** for this task shape. The `GET /ledger/account` cannot be eliminated (number-only account refs on voucher postings fail with 422).
