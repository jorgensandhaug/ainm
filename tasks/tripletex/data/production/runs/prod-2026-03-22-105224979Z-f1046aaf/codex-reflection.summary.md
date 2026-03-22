# Reflection: prod-2026-03-22-105224979Z-f1046aaf

## Task
Overdue invoice reminder fee and partial payment (English prompt). Find the one overdue invoice, book a 55 NOK reminder fee (debit 1500 / credit 3400), create and send a fee invoice for 55 NOK, register a partial payment of 5000 NOK on the overdue invoice.

## Reflection

**What went well:**
- Correctly identified the trusted-standard match (`overdue-invoice-reminder-fee-and-partial-payment.md`)
- Read the trusted standard before writing the script
- All 3 GETs (locate, paymentType, accounts) succeeded on first attempt
- Found exactly 1 overdue invoice (Blueshore Ltd, #1, outstanding 31625, due 2026-02-13)
- Recovery after the 422 was fast — hardcoded known IDs from the first run's GETs, removed `currency`, and re-ran
- All 3 writes (voucher, fee invoice, payment) succeeded on the retry
- Verification GETs confirmed correct final state

**What went poorly:**
- First `POST /ledger/voucher` failed with `422 currency: Feltet eksisterer ikke i objektet` because the script placed `currency: { id: 1 }` at the voucher body level
- This was a **trusted-standard documentation bug** — the `currency: { "id": 1 }` bullet in Payload Rules was at voucher-level indentation, making it ambiguous whether it belongs on the voucher or on each posting
- The wasted 422 cost 1 extra API call and required a second script

## Call Efficiency

**Was the run minimal-call?** No — 1 avoidable 422.

| Call | Endpoint | Status | Needed? |
|------|----------|--------|---------|
| 1 | GET /invoice?... | 200 | Yes — locate overdue invoice |
| 2 | GET /invoice/paymentType?... | 200 | Yes — resolve payment type |
| 3 | GET /ledger/account?number=1500,3400 | 200 | Yes — resolve account IDs |
| 4 | POST /ledger/voucher (with currency at voucher level) | 422 | **Wasted** — currency trap |
| 5 | POST /ledger/voucher (without currency) | 201 | Yes — book reminder fee |
| 6 | POST /invoice | 201 | Yes — create fee invoice |
| 7 | PUT /invoice/{id}/:payment | 200 | Yes — partial payment |
| 8-10 | 3x verification GETs | 200 | Free (logging) |

**Optimal path:** 6 calls (3 GETs + 3 writes) + verification GETs. This run used 7 write-path calls (1 wasted 422).

**Lower-call path for next agent:** Same 6-call path, but with `currency` removed from the voucher body entirely. The `6`-call path is confirmed optimal; no `5`-call standalone path exists (paymentTypeId is mandatory, account IDs require GET, account.number alone doesn't work).

## Root Causes

1. **Trusted standard documentation bug:** The `currency: { "id": 1 }` bullet in the Payload Rules section was at the same indentation level as "one positive posting on account 1500" and "one negative posting on account 3400", making it read as a voucher-level field. VoucherDTO does not have a `currency` field; it exists only on PostingDTO and is optional there.
2. **Playbook payload mismatch:** The playbook's Winning Payload had `currency: { id: 1 }` inside each posting (PostingDTO-level), which is valid but unnecessary. This contradicted the trusted standard's ambiguous voucher-level placement.

## Sandbox Verification

Tested all three `currency` placements on `2026-03-22` (sandbox `kkpqfuj-amager`):

| Placement | Result |
|-----------|--------|
| `currency: { id: 1 }` on voucher body | `422 Feltet eksisterer ikke i objektet` |
| `currency: { id: 1 }` on each posting | `201` (works, but unnecessary) |
| No `currency` anywhere | `201` (works — simplest and safest) |

**Conclusion:** Omitting `currency` entirely is the safest approach. It avoids the voucher-level trap and is the simplest payload.

## Playbook Changes

**Updated existing files (not new):**

1. `./trusted-standards/overdue-invoice-reminder-fee-and-partial-payment.md`:
   - Replaced the ambiguous `currency: { "id": 1 }` bullet with an explicit "do NOT include `currency` at the voucher level" warning
   - Added production proof for run `f1046aaf` (English, fee 55, 1 wasted 422)
   - Added sandbox verification of all three currency placements

2. `./task-playbooks/overdue-invoice-reminder-fee-and-partial-payment.md`:
   - Removed `currency: { id: 1 }` from both postings in the Winning Payload
   - Added new pitfall: "Do NOT include `currency` at the voucher level — VoucherDTO has no `currency` field"
   - Added reflection delta entry for run `f1046aaf`

## Commit

- Hash: `13370ac2`
- Message: `tripletex playbook: overdue-invoice — fix currency field placement trap (VoucherDTO has no currency field)`

## Reusable Heuristics

1. **VoucherDTO vs PostingDTO field confusion:** When a trusted standard lists fields under "on POST /ledger/voucher, send:", be explicit about whether each field belongs on the voucher body or inside each posting object. Ambiguous indentation causes agents to guess wrong.
2. **`currency` is optional on PostingDTO:** Omitting it defaults to the company's base currency (NOK). Including it is harmless but unnecessary for single-currency NOK tasks. Never place it on VoucherDTO.
3. **Winning Payload as source of truth:** When the trusted standard's prose is ambiguous, agents should cross-reference the playbook's Winning Payload example. In this case, the playbook correctly had `currency` inside postings, but the agent followed the trusted standard's prose instead.
4. **Recovery pattern:** When a voucher POST fails 422, the 3 prior GETs' data is still valid. Hardcode known IDs and retry without re-reading. This saves 3 calls on recovery.
