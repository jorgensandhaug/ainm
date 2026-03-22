# Score Reflection: prod-2026-03-22-054216330Z-de228487

## Task Attribution

- **Task ID**: T20 — Register supplier invoice from PDF
- **Task tier**: T3 (tasks 19–30) → **max score: 6**
- **Prompt language**: German ("Lieferantenrechnung … beigefugte PDF")
- **PDF**: Nordlicht GmbH / 871162069 / INV-2026-7611 / 2026-04-06 / net 35650 / VAT 8912 / gross 44562 / account 6300

## Correctness Verdict

- **Correctness**: 0 — **total failure**
- **Score**: 0/6 (raw 0/1)
- **Feedback**: "0/0 checks passed" — no checks were even evaluated
- **Reason**: The agent made **zero API calls**. No supplier, no invoice, no voucher — nothing was created in Tripletex. The submission was scored as "failed" because no side effects existed.

## Efficiency Verdict

Not applicable — no API calls were made. The run timed out at 304,881ms with 0 calls and 0 scripts written. Efficiency cannot be evaluated when correctness is 0.

**Leaderboard context**: T20 best_score remained at 2.4 (unchanged); attempt count went from 12 → 13. This 0-score run wasted the attempt.

## Likely Root Cause

**Timeout-during-thinking with zero output.**

The agent trace shows:
1. **05:42:17** — received prompt
2. **05:42:22** — Read AGENTS.md (100 lines) + Read PDF (parallel) → completed instantly
3. **05:42:31** — Glob for trusted standards → found `register-supplier-invoice-from-pdf.md`
4. **05:42:34** — Read trusted standard (277 lines) → completed

Then: **nothing**. Zero assistant messages. Zero more tool calls. The agent had all information it needed by second 17 of the 300s budget but stalled in thinking for the remaining ~4 minutes 26 seconds.

The trace shows `assistant_messages: 0` — the model never even generated a first response. It was still in the thinking/generation phase when the 300s timeout fired.

This is the **third** documented instance of this exact failure mode for T20:
- prod-4c255d98 (referenced in AGENTS.md line 143): same pattern — read trusted standard, never wrote script
- This run (de228487): identical pattern

The root cause is likely the trusted standard's size (277 lines including full XML template, multiple code blocks, and extensive check-by-check analysis). Combined with `effort: high` model setting, the model entered a prolonged reasoning phase trying to plan the perfect script, and exceeded the time budget before producing any output.

## What Went Right

1. **Correct task identification**: Recognized German "Lieferantenrechnung" + "beigefügte PDF" as T20
2. **Correct standard matched**: Found and read `register-supplier-invoice-from-pdf.md`
3. **PDF parsed**: Extracted all invoice fields (supplier, amounts, dates, account, bank)
4. **Efficient file reads**: Read AGENTS.md (only first 100 lines, not full file) + PDF in parallel
5. **Fast setup**: All necessary information was available by second 17

## What To Change Next Time

1. **Emit output immediately after reading the trusted standard.** The AGENTS.md already says "After reading the matched standard, immediately write and execute the script." The problem is the model getting stuck in extended thinking. Solutions:
   - **Reduce trusted standard length.** The current 277-line file with full XML template, verbose check analysis, and sandbox proof history is too large. The condensed version (142 lines) that was being deployed in the earlier reflection session is better.
   - **Add a time-pressure comment at the very top of the file** — e.g., "IMMEDIATELY write and run the script after reading. Do NOT spend time planning."

2. **The correct 5-call path is well-established and sandbox-verified:**
   1. `POST /supplier` (with postalAddress + physicalAddress + country + bankAccountPresentation)
   2. `GET /ledger/account?number=<XXXX>,2400&isApplicableForSupplierInvoice=true&fields=id,number` (comma-separated gets both expense + supplier-ledger account in one call)
   3. `POST /ledger/voucher/importDocument` (FormData with EHF XML) → `values[0].id`, `values[0].version`
   4. `PUT /ledger/voucher/{id}?sendToLedger=false` (postings with vatType `{id:1}`)
   5. `PUT /ledger/voucher/{id}?sendToLedger=true` (book with `{version, voucherType:{name:"Leverandørfaktura"}}`)

3. **Alternative: use `supplier.ledgerAccount.id` from the POST /supplier response** instead of a second account number in the GET. The supplier response includes `ledgerAccount: { id: <2400-id> }`, so the agent can skip looking up account 2400 separately. This was discovered in the reflection sandbox investigation.

4. **The prior reflection identified the comma-separated account trick** (`number=6300,2400` returns both in one GET) — sandbox-verified 2026-03-22 with 5 calls, 0 errors, voucher booked as number 780. This optimization should be in the trusted standard.

5. **Do not read AGENTS.md at all for exact trusted-standard matches.** The first 100 lines of AGENTS.md were read before the trusted standard. For a clear T20 match (German "Lieferantenrechnung" + PDF attachment), the agent should skip AGENTS.md entirely and go straight to the trusted standard. Every second saved on file reads reduces timeout risk.
