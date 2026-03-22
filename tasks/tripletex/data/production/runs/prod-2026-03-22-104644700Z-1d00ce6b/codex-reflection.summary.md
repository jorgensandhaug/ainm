# Codex Reflection Summary

## Task
T24 — Correct ledger errors. German (de) prompt. Four errors: wrong account (6500→6540, 3000 NOK), duplicate (6540, 2600 NOK), missing VAT (7000, 7100 NOK excl. VAT), wrong amount (6540, 8350→7000 NOK). Correction via single combined voucher.

## Reflection
**What went well:**
- Template executed flawlessly — 1 POST, 0 errors, 6/6 score (maintained perfect)
- All 10 prompt values extracted correctly from German text
- Layer 3 (description keyword "uten MVA") correctly identified missing-VAT error voucher V#29
- Template handled 3 of 4 errors on the same account (6540) without collisions — amounts are unique discriminators
- Supplier.id correctly propagated on contra account 2400 for the missing-VAT correction

**What could be improved:**
- Agent read AGENTS.md first (which failed at 32k tokens) plus both trusted-standard AND playbook. AGENTS.md explicitly says: "After reading the matched standard, immediately write and execute the script. Do not also read AGENTS.md, openapi.json, the playbook, or any other file." Reading the playbook was unnecessary — the trusted standard contains the complete script template. This wasted ~3 tool calls and processing time.
- For future runs: read ONLY `trusted-standards/correct-ledger-errors.md`, fill in constants, execute immediately.

## Call Efficiency
**Minimal-call: YES.** The run used the absolute minimum:
- 1 GET `/ledger/account` (account ID lookup — required, cannot be eliminated)
- 1 GET `/ledger/voucher` (voucher discovery — required for detection)
- 1 POST `/ledger/voucher` (the correction — the only scored call)
- 1 GET `/ledger/voucher` (verification — free, explicitly encouraged)

Total: 3 GETs (free) + 1 POST (scored) = optimal. No wasted calls. Zero 4xx errors.

## Root Causes
No failures in this run. The template has been stable across 3 consecutive 6/6 runs.

Key insight discovered: **Voucher descriptions are always in Norwegian** regardless of prompt language. The German prompt produced error vouchers with Norwegian descriptions like "Varekjøp uten MVA" and "Kontorrekvisita duplikat". This means Layer 3's Norwegian keyword "uten MVA" is sufficient — the German/French/Spanish/Portuguese keywords in the detection pattern are insurance against a hypothetical future change, but have never been needed.

## Sandbox Verification
Confirmed sandbox accessibility and template structure:
- Account lookup with `number=6500,6540,7000,2710&fields=id,number,vatType(id)` returns correct IDs and vatType locks
- Voucher endpoint with nested field expansion `postings(id,account(id,number),amountGross,vatType(id))` returns full posting details
- No structural changes needed — template is production-proven

## Playbook Changes
Updated existing files (no new files created):
- `./trusted-standards/correct-ledger-errors.md` — added Production Run 1d00ce6b evidence (German prompt, overlapping accounts, Layer 3 match, 3rd consecutive 6/6)
- `./task-playbooks/correct-ledger-errors.md` — added run 1d00ce6b to production history, added key insight about Norwegian voucher descriptions

## Commit
- Hash: `3d2277bf`
- Message: `tripletex playbook: correct-ledger-errors — 3rd consecutive 6/6 (de prompt, overlapping accounts)`

## Reusable Heuristics
1. **Voucher descriptions are always Norwegian**: Regardless of prompt language (de, en, es, fr, pt, nn), error voucher descriptions like "Varekjøp uten MVA" and "Kontorrekvisita duplikat" are always in Norwegian. Layer 3 detection with Norwegian keywords is sufficient.
2. **Overlapping accounts are safe**: When multiple errors reference the same account number (e.g., 3 of 4 errors on 6540), the amounts uniquely discriminate them. The template's detection by `(account, amount)` pair never collides.
3. **Don't read playbook for exact trusted-standard matches**: The trusted standard contains the complete runnable script template. Reading the playbook in addition wastes tool calls and context budget.
4. **Layer 3 dominates in production**: In all 3 production runs with the 4-layer template, Layer 1 (vatType=0) and Layer 2 (no-2710) returned 0 candidates. Layer 3 (description keyword) was the successful detection method every time. The error voucher consistently has vatType=1 with has2710=true, making Layers 1+2 ineffective. Layer 3 is the de facto primary detection method.
5. **1 POST is optimal**: The combined correction voucher with all 4 error fixes in a single POST is the minimum possible scored call count. Never split corrections into multiple vouchers.
