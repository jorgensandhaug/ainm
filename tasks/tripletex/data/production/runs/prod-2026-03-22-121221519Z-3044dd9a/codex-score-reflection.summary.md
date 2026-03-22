# Score-Aware Reflection: prod-2026-03-22-121221519Z-3044dd9a

## 1. Task Attribution

- **Attributed task**: T02 (create customer)
- **Inference**: `ambiguous` (2 leaderboard entries changed), but T02 is the best match — `total_attempts` 26→27 and `last_attempt_at` changed to `2026-03-22T12:13:04` (2 seconds after task completion at 12:13:02). T08 also incremented but with a 12-second gap, likely a concurrent submission from another run.
- **Task tier**: T1 (max score 2)

## 2. Correctness Verdict

**Perfect.** `correctness: 1.0`, `score_raw: 8/8`, `normalized_score: 2/2`.

All 7 checks passed. The final Tripletex state exactly matched expectations:
- Customer name: `Oakwood Ltd`
- Organization number: `980094863`
- Email: `post@oakwood.no`
- Postal address: `Torggata 10, 6003 Ålesund`

## 3. Efficiency Verdict

**Optimal.** `normalized_score: 2` equals the T1 tier maximum of 2 and matches the existing `best_score: 2` for T02 on the leaderboard. The run used 1 write (`POST /customer`) + 1 verification GET, 0 errors. No wasted calls, no 4xx errors. Duration was 73s which is well within the 300s budget.

## 4. Likely Root Cause

No issues. This is a perfect run — maximum correctness, maximum efficiency, 0 errors.

## 5. What Went Right

1. **Immediate trusted-standard identification**: The agent recognized this as an exact match for `create-customer.md` without hesitation.
2. **Read-before-write discipline**: Read the trusted standard before writing the script, as mandated by AGENTS.md.
3. **No time wasted on secondary docs**: Did not read AGENTS.md, openapi.json, or the playbook — went straight from trusted standard to script execution.
4. **Correct payload shape**: Sent only `name`, `email`, `organizationNumber`, and `postalAddress` — no invented fields.
5. **Unicode preservation**: `Ålesund` preserved correctly through the entire flow.
6. **Verification GET included**: Added a `GET /customer/{id}?fields=*` readback after the write for logging purposes (free, no score impact).
7. **Zero 4xx errors**: No failed calls, no retries, no recovery branches triggered.

## 6. What To Change Next Time

**Nothing.** This task shape is fully solved. The create-customer trusted standard has been verified across 20+ consecutive production runs in 6 languages (en, nb, de, fr, es, pt) with 0 errors every time. The 1-write + 1-verification-GET path is the proven optimal flow.

The only minor documentation improvement (already applied in the prior reflection commit): noting that `GET /customer/{id}?fields=*` returns postalAddress as a sparse link, while the POST 201 response includes the fully expanded address. For future runs, the POST response remains the primary address verification source.
