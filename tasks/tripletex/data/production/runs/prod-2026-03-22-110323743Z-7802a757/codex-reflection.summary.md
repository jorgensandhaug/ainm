# Reflection Summary — prod-2026-03-22-110323743Z-7802a757

## 1. Task

Create custom accounting dimension "Produktlinje" with values "Basis" and "Standard", then book a voucher on account 6540 for 25900 NOK linked to dimension value "Basis". German-language prompt. Task ID: 17.

## 2. Reflection

**What went well:**
- Perfect correctness: 13/13 raw score, 6/6 checks passed, 0 errors.
- Followed the trusted standard exactly — read the standard, wrote the script, executed it. No wasted steps.
- Clean 5-call execution: 4 writes (dimension + 2 values + voucher) + 1 GET (account IDs).
- Second successful German-language run confirming the standard handles multi-language prompts identically.
- 11th consecutive correct run for this task shape.

**What went poorly:**
- Score dropped from the established 3.5/4 ceiling to 3.0/4, despite using the identical call pattern (5 calls, 0 errors) that scored 3.5 in 10 consecutive prior runs.
- Duration was 111s vs 50-75s for the 3.5 runs, possibly due to reading AGENTS.md (which failed at 32K tokens), then reading both trusted standard and playbook.

**Root cause of score drop:**
- Unknown. Extensively investigated: duration does NOT affect scoring (other task types scored identically at 69s vs 155s). The inference_status, candidate_count, and call pattern are identical to 3.5 runs.
- Best hypothesis: either the scoring formula changed to count ALL API calls (not just writes), giving `4 - 0.5*(5-3) = 3.0`, or the proxy now counts the GET as a write.

## 3. Call Efficiency

**Was the run minimal-call?** Yes — 5 calls is the proven minimum for this task shape:
- 3 writes: dimension name + 2 dimension values (cannot be batched — sandbox-verified)
- 1 GET: account ID resolution (mandatory — voucher API requires `account.id`, all number-only variants fail with 422)
- 1 write: voucher

**Wasted calls:** None. Zero errors, zero retries, zero speculative reads.

**Lower-call path:** None exists. Exhaustively verified in sandbox:
- `account:{number:N}` → 422 (name null)
- `account:{number:N, name:"..."}` → 422 (id required)
- `account:{id:0, number:N, name:"..."}` → 422
- Batch value creation (`POST /list`, `POST` with array) → 400/422

## 4. Root Causes

| Issue | Root Cause | Impact |
|-------|-----------|--------|
| Score 3.0 instead of 3.5 | Unknown — identical flow to 3.5 runs; possible scoring formula change | -0.5 points (leaderboard best remains 3.5 from earlier runs) |
| Slower execution (111s) | Agent read AGENTS.md (failed at 32K tokens limit), then read both trusted standard AND playbook before scripting | No direct scoring impact, but wasted ~30s of budget |

## 5. Sandbox Verification

Tested 4 alternative approaches to eliminate the GET /ledger/account call:
1. `account: { number: 6540, name: "Inventar" }` (no id) → 422 "Feltet må fylles ut"
2. `account: { number: "6540", name: "Inventar" }` (string number) → 422 same
3. `account: { id: <real_id>, number: 6540, name: "Inventar" }` → 422 "Posteringer kan ikke gjøres i en periode der det finnes en avstemt kontoutskrift" (sandbox-specific bank statement conflict, but confirms id is accepted when present)
4. `account: { number: 6540 }` (integer only) → 422 "Kan ikke være null" (name field)

**Conclusion:** Account ID resolution via GET is mandatory. The 5-call path is the true minimum. No 4-call optimization exists.

## 6. Playbook Changes

Updated existing files (no new files created):
- `./trusted-standards/create-free-accounting-dimension-and-book-voucher.md`:
  - Added 11th production run entry (7802a757, German, Produktlinje/Basis/Standard/6540/25900)
  - Updated efficiency analysis to note 3.0 scoring anomaly and possible formula change
  - Changed "3.5/4 is the proven ceiling" to "3.0–3.5/4" range acknowledging the anomaly
- `./task-playbooks/create-free-accounting-dimension-and-book-voucher.md`:
  - Added 11th production run entry
  - Updated Exact-Match Fast Path scoring note from "3.5/4" to "3.0–3.5/4" with explanation

No AGENTS.md changes needed — task 17 entries already present in both Trusted Standards and Task Playbooks tables.

## 7. Commit

- Hash: `6c37da85`
- Message: `tripletex playbook: free-dimension-voucher — add 11th correct run (7802a757, German/6540/25900), note 3.0 scoring anomaly`

## 8. Reusable Heuristics

1. **5 calls is the true minimum for dimension+voucher tasks.** No shortcut avoids the GET — account ID resolution is mandatory. Do not waste reflection time searching for 4-call alternatives.
2. **Scoring may now count GETs.** The formula `4 - 0.5*(total_calls - 3)` gives 3.0 for 5 calls, matching this run. Monitor future runs to confirm.
3. **Skip reading AGENTS.md during scored runs.** At 32K+ tokens it exceeds the read limit and wastes time. The AGENTS.md instruction to "read only the matched standard, skip AGENTS.md" should be followed strictly.
4. **Don't read both trusted standard AND playbook.** They contain heavily overlapping content. Read only the trusted standard for execution; the playbook adds no new information for this task shape.
5. **German-language prompts work identically.** "verknüpft mit dem Dimensionswert" maps to the same linked-value resolution as Norwegian "knyttet til" / Portuguese "vinculado ao" / Spanish "vinculado al".
6. **Duration does not affect scoring** — confirmed by cross-task analysis (task 9: 69s and 155s scored identically at 2.5333).
