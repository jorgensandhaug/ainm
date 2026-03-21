# Post-Run Reflection: prod-2026-03-21-210809925Z-2f10e207

## Task

Reconcile bank statement CSV (Nynorsk prompt) against open invoices in Tripletex. Match 5 incoming customer payments, 3 outgoing supplier payments, and 2 non-invoice "Renteinntekter" lines in the Ut (outgoing) column. Handle partial payments (Aasen AS: 6500 of 13000 outstanding).

## Reflection

**What went well:**
- Exact trusted-standard match identified immediately (`reconcile-bank-statement-open-invoices.md`)
- Optimal 11 API calls (5 reads + 5 customer payments + 1 combined voucher), 0 errors
- All customer invoices matched correctly, including partial payment
- Supplier payments + non-invoice lines combined into single voucher (10 postings)
- API execution completed in 4 seconds
- Non-invoice lines (Renteinntekter in Ut column) were NOT skipped — booked to 8050 with reversed direction

**What went poorly:**
- **Scored 0/1** due to `endpoint_unreachable` — the proxy expired before the scorer could verify the Tripletex state
- **Root cause: LLM generation took 4.5 minutes** (21:08:26 → 21:12:52) to produce the script, leaving only ~15 seconds of the 300s budget for API execution. The proxy token had already expired by the time the script ran.
- Agent unnecessarily read AGENTS.md (200 lines) and ran Glob searches for trusted-standard/playbook directories — all unnecessary for an exact trusted-standard match
- The extended context from AGENTS.md likely slowed LLM generation further

**What should have been different:**
- Read ONLY `./trusted-standards/reconcile-bank-statement-open-invoices.md` and the CSV attachment
- Skip AGENTS.md, Glob searches for file listings, all other documentation
- Write a more compact script (less logging, fewer comments) to reduce LLM output tokens

## Call Efficiency

**The run was minimal-call**: 11 calls (5 reads + 5 customer payments + 1 combined voucher) matches the proven optimal count. Zero errors. No wasted API calls.

**No lower-call path exists** for this task shape (5 customer + 3 supplier + 2 non-invoice, no supplier invoices):
- 5 parallel reads are required (invoice, paymentType, supplier, supplierInvoice, accounts)
- 5 customer payments are required (1 per bank line)
- 1 combined voucher is required (supplier + non-invoice postings)
- Total floor: 11 calls

## Root Causes

1. **Primary: LLM generation time** — Opus 4.6 took 4.5 minutes to generate the TypeScript script. This is the model's inherent output speed, not fixable by documentation changes. However, reducing context window content (skipping AGENTS.md) and script verbosity could help.

2. **Secondary: Unnecessary file reads** — Reading AGENTS.md (200 lines), running 2 Glob searches for trusted-standard and playbook directories added ~8 seconds of tool calls and expanded the context, likely slowing LLM generation.

3. **Infrastructure: proxy token expiry** — The scoring system's fail_reason was `endpoint_unreachable`, meaning the Tripletex proxy's 300s session token expired before the scorer could check the final state. The API calls themselves succeeded.

## Sandbox Verification

- Verified both account options for Renteinntekter in Ut column:
  - Voucher #609157175: Renteinntekter -> 8050 (interest income account with reversed direction) — **posted successfully**
  - Voucher #609157179: Renteinntekter -> 8150 (interest expense account) — **also posted successfully**
- Both approaches are mechanically valid; chose 8050 per the trusted standard's keyword->account mapping rule (consistent with Bankgebyr->7770 and Skattetrekk->2600 regardless of direction)
- Confirmed sandbox has account 8150 "Annen rentekostnad" but it's not needed when following the keyword-based mapping

## Playbook Changes

Updated existing files (no new files created):

1. **`./trusted-standards/reconcile-bank-statement-open-invoices.md`**:
   - Added table row for "Renteinntekter (negative interest / reversal) | Ut (-)" -> account 8050
   - Added code example for Renteinntekter Ut posting pattern
   - Added explicit **direction rule**: keyword determines account, column determines sign
   - Added production result (2f10e207: 11 calls, 0 errors, endpoint_unreachable)
   - Strengthened TIMEOUT RISK warning with three-timeout evidence
   - Updated sandbox verification line with voucher #609157175

2. **`./task-playbooks/reconcile-bank-statement-open-invoices.md`**:
   - Added Renteinntekter Ut row to non-invoice line types table
   - Added production result (2f10e207) with detailed timeout analysis
   - Updated Critical Timing Rule: three timeouts, actual API time is ~4s not ~15s
   - Updated sandbox verification line
   - Corrected timeout count from "second" to "third"

## Commit

```
9f765011 tripletex playbook: reconcile-bank-statement — add 9th production result (2f10e207, Nynorsk prompt, 11 calls 0 errors, endpoint_unreachable proxy timeout — LLM took 4.5 min, API 4s), document Renteinntekter in Ut column (negative interest / reversal -> 8050 with reversed direction), sandbox-verify voucher #609157175 with Renteinntekter Ut/8050, add direction rule (keyword->account, column->sign), strengthen TIMEOUT RISK to three-timeout evidence, add code example for Renteinntekter Ut posting pattern
```

## Reusable Heuristics

1. **For exact trusted-standard matches, read ONLY the trusted standard file** — skip AGENTS.md, Glob searches, playbook reads, and openapi.json. Every extra file read expands context and slows LLM output generation.

2. **Non-invoice line direction rule**: keyword determines the account (Renteinntekter->8050, Bankgebyr->7770, Skattetrekk->2600). The column (Inn/Ut) determines only the sign direction. This holds even when "Renteinntekter" appears in the Ut column.

3. **This is the most timeout-prone task shape**: 3 of the last production runs scored 0 due to timeout. The API execution itself takes ~4 seconds. All remaining time is consumed by documentation reading and LLM generation. Future agents should minimize context to maximize generation speed.

4. **Combine supplier + non-invoice postings in one voucher**: adding non-invoice postings to the supplier payment voucher costs zero extra API calls. Never create a separate voucher for non-invoice lines when a supplier voucher is already being created.

5. **Proxy expiry is the hard constraint, not just 300s**: the scoring system checks the Tripletex state via the same proxy token. If the agent finishes at T=299s and the scorer takes 10s to run, the proxy may have expired. Aim to finish API execution well before 300s, not just at 300s.
