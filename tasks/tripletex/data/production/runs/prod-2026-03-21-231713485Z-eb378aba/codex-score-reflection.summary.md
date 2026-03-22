# Score-Aware Reflection

## 1. Task Attribution

- **Run ID:** prod-2026-03-21-231713485Z-eb378aba
- **Attributed task:** T08 (create-project)
- **Tier:** T1 (max score 2)
- **Prompt:** Opprett prosjektet "Analyse Sjøbris" knytt til kunden Sjøbris AS (org.nr 883693329). Prosjektleiar er Steinar Berge (steinar.berge@example.org).

## 2. Correctness Verdict

**Perfect.** score_raw=7/7, correctness=1.0, normalized_score=2 (max for T1). All 4/4 checks passed. The final Tripletex state was exactly correct: project name, startDate, customer link, and project manager link all verified.

## 3. Efficiency Verdict

**Optimal.** normalized_score=2 equals the leaderboard best_score=2 for T08. The run used 3 API calls with 0 errors — the proven minimum for this task shape (GET customer, GET employee, POST project). No efficiency penalty applied. Duration was 42.9s which is well within the 300s budget.

## 4. Likely Root Cause

No issues. The run achieved maximum score with minimum calls. The trusted standard was followed exactly with no deviations.

## 5. What Went Right

- **Immediate pattern recognition:** Correctly identified this as an exact create-project trusted-standard match on the first read
- **Read-before-write discipline:** Read the trusted standard file before writing any script, avoiding all documented pitfalls
- **Minimal call path:** Executed exactly 3 calls — the proven minimum. No extra verification GETs, no retries, no 4xx errors
- **Correct field mapping:** startDate defaulted to run date (2026-03-22), customer resolved by organizationNumber, manager resolved by email with `assignableProjectManagers=true`
- **Response reuse:** Verified all scored fields from the POST response without any follow-up reads
- **Language handling:** Nynorsk prompt keywords (`Prosjektleiar`, `knytt til`) correctly mapped to the standard create-project flow without any extra disambiguation

## 6. What To Change Next Time

Nothing. This is the 18th consecutive optimal run for the create-project task shape across 7 languages (en/pt/es/nb/nn/fr/de). The standard is fully stable. The next agent should continue to:

1. Read the trusted standard before writing any script
2. Execute the 3-call path: GET customer → GET employee (assignable) → POST project
3. Default startDate to run date when prompt omits it
4. Trust the POST response for verification — no follow-up GETs
5. Not attempt 2-call shortcuts (inline customer silently drops, inline PM without id returns 422)
