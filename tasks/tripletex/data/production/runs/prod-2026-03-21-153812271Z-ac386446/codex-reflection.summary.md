# Codex Reflection: prod-2026-03-21-153812271Z-ac386446

## Task
Book the "Kontorstoler" line (13 500 kr) from an IKEA receipt as an expense voucher on department "Drift" with correct expense account and VAT treatment. Attach the receipt PDF.

## Reflection
The agent scored **0/0** — it never executed a single API call. It spent the entire 300s budget reading documentation (AGENTS.md, trusted standard, common-endpoints, openapi.json) across 17 tool calls. The existing trusted standard only covered the Forretningslunsj/representation branch (account 7360, no VAT). The agent recognized Kontorstoler didn't match that branch but got stuck researching rather than writing and executing a script.

## Call Efficiency
- **Agent's calls**: 0 API calls (only file reads)
- **Optimal path**: 4 API calls
  1. `POST /department` — create "Drift"
  2. `GET /ledger/account?number=6540,1920&fields=id,number,name,vatType(*)` — resolve IDs + extract vatType
  3. `POST /ledger/voucher` — book with account 6540, vatType id from step 2, amountGross=13500
  4. `POST /ledger/voucher/{id}/attachment` — attach receipt PDF
- **Waste**: 100% — zero productive calls made

## Root Causes
1. **Analysis paralysis on unfamiliar branch**: The agent recognized Kontorstoler != Forretningslunsj but couldn't decide what to do without an exact trusted-standard match. It kept reading more documentation instead of writing a script.
2. **No timeout discipline**: With 300s budget, the agent should have started writing API scripts within the first 60s. Instead it consumed the entire budget on reads.
3. **Missing Branch B in trusted standard**: The standard only documented one receipt-line type (representation/7360). A deductible purchase branch (furniture/6540 with incoming VAT) was not covered.

## Sandbox Verification
Verified in persistent sandbox on 2026-03-21:

- `GET /ledger/account?number=6540,1920&fields=id,number,name,vatType(*)`:
  - 6540 "Inventar": id=424191132, vatLocked=false, vatType.id=1 (incoming 25%)
  - 1920 "Bankinnskudd": id=424190862, vatLocked=true, vatType.id=0
- `POST /ledger/voucher` with amountGross=13500, vatType={id:1}, account 6540, dept 927069 -> voucher 609014744:
  - expense posting: amount=10800, amountGross=13500, vatType.id=1, dept=927069
  - bank posting: amount=-13500 on 1920
  - auto-generated VAT posting: amount=2700 on account 2710
- `POST /ledger/voucher/609014744/attachment` -> attachment.id=1024249955
- Confirmed: omitting vatType defaults to code 0 (no VAT) — WRONG
- Confirmed: account.number refs fail 422 — must use account.id

## Playbook Changes
- **trusted-standards/register-receipt-expense-voucher.md**: expanded from single Forretningslunsj branch to two branches:
  - Branch A (non-deductible representation): account 7360, VAT code 0 (unchanged)
  - Branch B (deductible purchase): account 6540, incoming 25% VAT with explicit vatType from account response (NEW)
  - Added account selection rules, Branch B payload shape, Branch B sandbox proof, Branch B recovery notes
- **task-playbooks/register-receipt-expense-voucher.md**: parallel expansion with account selection table, both payload shapes, updated validation traps
- **AGENTS.md**: no change needed — existing entry "Register receipt expense voucher" is generic enough

## Commit
`c2c93e50` — `tripletex playbook: expand receipt voucher standard to cover deductible purchases (Kontorstoler/6540 with incoming 25% VAT)`

## Reusable Heuristics
1. **vatType must be explicit on deductible postings**: Tripletex does NOT inherit the account's default vatType. Omitting it silently defaults to code 0 (no VAT). Always send `vatType: { id: <from account response> }`.
2. **vatType.id from account response saves a call**: `GET /ledger/account?fields=id,number,name,vatType(*)` gives the vatType.id directly — no separate `GET /ledger/vatType` needed.
3. **Receipt line prices are gross amounts**: For Norwegian receipts, use the line price directly as `amountGross`. Tripletex auto-computes net and generates the VAT posting.
4. **Branch on receipt line text, not vendor**: The expense account depends on what was bought (Forretningslunsj -> 7360, Kontorstoler -> 6540), not who sold it.
5. **Execution discipline**: On a 300s budget, start writing API scripts within 60s. Reading documentation beyond that is waste if the pattern is close enough to adapt from.
