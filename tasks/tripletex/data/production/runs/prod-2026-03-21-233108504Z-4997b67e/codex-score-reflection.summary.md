# Score-Aware Reflection

## Task Attribution

- **Run ID**: prod-2026-03-21-233108504Z-4997b67e
- **Attributed task**: T02 (create-customer)
- **Tier**: T1 (max score: 2)
- **Prompt**: Norwegian — "Opprett kunden Skogheim AS med organisasjonsnummer 855954346. Adressa er Parkveien 17, 4611 Kristiansand. E-post: post@skogheim.no."

## Correctness Verdict

**Perfect.** Correctness = 1.0, score_raw = 8/8, normalized_score = 2/2 (tier maximum). All 7/7 checks passed. No checks failed.

## Efficiency Verdict

**Optimal.** The run used exactly 1 API call (1 POST, 0 GETs, 0 errors). This is the theoretical minimum — creating a customer requires at least one POST. The normalized score of 2 matches the leaderboard best_score of 2 for task 02, confirming no efficiency penalty. The leaderboard shows total_attempts went from 22 → 23, and best_score remained at 2, meaning this run tied the existing best.

No wasted calls. No avoidable errors. No retries.

## Likely Root Cause

No issues to diagnose. The run was both correct and maximally efficient.

## What Went Right

1. **Trusted standard recognition**: The agent immediately identified `create-customer.md` as an exact match and read it before writing any script.
2. **No openapi.json consultation**: Skipped unnecessary spec exploration since the trusted standard already covered this exact task shape.
3. **Minimal payload**: Sent only `name`, `organizationNumber`, `email`, and `postalAddress` — exactly the fields from the prompt, nothing more.
4. **No follow-up reads**: Trusted the `201` response body for verification instead of adding a wasteful `GET /customer/{id}`.
5. **No speculative fields**: Did not add `physicalAddress`, `invoiceEmail`, or any other fields not requested by the prompt.
6. **Correct address mapping**: Mapped the single address to `postalAddress` with `addressLine1`, `postalCode`, `city` — the proven standard shape.
7. **Unicode preservation**: Although this prompt had no special characters, the pattern of exact text preservation was correctly followed.

## What To Change Next Time

Nothing. This is the gold-standard execution path for create-customer tasks:

1. Read `trusted-standards/create-customer.md`
2. Write one `POST /customer` script with only the prompt-specified fields
3. Run it
4. Verify from `response.value`
5. Stop

This is the 16th consecutive optimal production run for this task shape across 7 languages (de, en, es, pt, fr, nb, nn). The one-call path is fully proven and stable. No changes needed to playbooks, trusted standards, or AGENTS.md.
