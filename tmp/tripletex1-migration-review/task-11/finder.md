# Task 11 Finder Review

## Concise proposal summary

The proposal argues that Tripletex1 already has stronger T11 guidance than Tripletex2, and that the only worthwhile import from T2 is a small duplicate-supplier recovery branch: if `POST /supplier` fails with duplicate-like `409`/`422`, fall back to `GET /supplier?organizationNumber=...&fields=*` instead of retrying blindly.

## Candidate findings

### 1. High: "No AGENTS.md changes" is not defensible because AGENTS is internally contradictory on T11

- The proposal says `AGENTS.md` is already "correct and comprehensive" and proposes no changes.
- But the live file contains two conflicting T11 instructions:
  - `tasks/tripletex/codex-environment/AGENTS.md:147-149` says both T11 and T20 must use `importDocument`, then do two PUTs.
  - `tasks/tripletex/codex-environment/AGENTS.md:381-383` says the lower-call replacement is direct `POST /ledger/voucher` and explicitly says "Do NOT use importDocument".
- On a production-score axis, this matters more than the duplicate-supplier note. Conflicting top-level agent guidance can easily send future runs onto a known weaker path.
- Impact: high. If this queue item touches T11 guidance at all, AGENTS cleanup is the most score-relevant doc delta it should call out.
- Score: +10

### 2. High: the proposal misses a stronger T2 regression signal than the one it highlights

- The proposal correctly notes that T2 v2 omits `PaymentMeans`, supplier address/bank data, and `voucherType`.
- It misses an even more dangerous divergence: T2 hardcodes buyer org `999999999` in the XML (`tasks/tripletex2/src/tasks/task-16/strategies/import-and-book-voucher-v2.ts:563-583`), while T1 explicitly documents that the buyer org must be a valid mod11 number and standardizes on `987654325` (`tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md:87-94,198-200`; playbook `:52-70,157-158`).
- That is known 422/import failure territory, so it is stronger negative evidence than "no verification GETs".
- Impact: high. A review focused on production leverage should surface the highest-risk T2 divergence, not only the more cosmetic omissions.
- Score: +10

### 3. Medium: the only genuine net-new import is real, but the proposal overstates its score leverage

- The duplicate-supplier `409`/`422` recovery branch is genuinely not spelled out in T1's current "Known Recovery Branches".
- But T1 already tells the operator to go lookup-first in explicit-existing-supplier or retry/persistent-account contexts (`trusted-standards/register-supplier-invoice.md:40-42,186-190`).
- Real production accounts are also documented as fresh by default in `AGENTS.md`, so the create-first branch usually will not hit this duplicate case.
- Result: safe additive note, but probably not leaderboard-moving.
- Impact: medium.
- Score: +5

### 4. Medium: the proposal names stale target paths instead of the actual live Tripletex1 surfaces

- The proposal lists targets as `trusted-standards/register-supplier-invoice.md`, `task-playbooks/register-supplier-invoice.md`, and `AGENTS.md`.
- In this repo, the live T1 surfaces are actually under `tasks/tripletex/codex-environment/`.
- For a migration-queue document whose job is to drive concrete doc changes, inaccurate destinations are a practical execution risk.
- Impact: medium. It does not change the technical conclusion, but it weakens the proposal's portability and could cause no-op edits.
- Score: +5

### 5. Low: the score-gap analysis is not materially net-new

- T2 RESEARCH adds useful color by citing the T20 booked-vs-unbooked comparison (`tasks/tripletex2/src/tasks/task-16/RESEARCH.md:19-23,43-49`).
- But T1 already contains the two operational conclusions that matter:
  - booking likely unlocks one more check (`trusted-standards/register-supplier-invoice.md:56-59`; playbook `:40-42,179`)
  - immutable importDocument description is likely the remaining blocker (`trusted-standards/register-supplier-invoice.md:58-59,252`; mirrored in production history)
- So this is background context, not a meaningful markdown import.
- Impact: low.
- Score: +1

### 6. Low: the proposal underuses the strongest framing clue in T2 README

- `tasks/tripletex2/src/tasks/task-16/README.md` says the intended deterministic solve path should follow `codex-environment/trusted-standards/register-supplier-invoice.md`.
- That makes this less of a "port T2 learnings into T1" case and more of a "harvest one minor defensive detail while rejecting several weaker T2 choices" case.
- The proposal gets to that conclusion eventually, but it could have stated it much more directly.
- Impact: low.
- Score: +1

### 7. Strength: the proposal's additive-only posture is directionally correct

- The proposal is right that T1 is already ahead of T2 on this task.
- It is also right that anything borrowed from T2 should be additive only, not a simplification or replacement of the current T1 standard.
- That overall posture is supported by the live docs and by the T2 runtime stub/README.
- Impact: low.
- Score: +1

## Explicit call: is this actually net-new?

Partially, but only narrowly.

- Net-new: the specific create-first recovery note for duplicate-like `POST /supplier` failures (`409`/duplicate-shaped `422` -> lookup existing supplier).
- Not net-new: booking hypothesis, immutable-description hypothesis, importDocument mandate, response-shape pitfall, supplier address/bank guidance, `PaymentMeans`, `voucherType`, verification GET posture, and the broader conclusion that T1 is already the stronger artifact.

## Explicit call: is the evidence strong enough for production-porting now?

Not for the task as framed.

- Strong enough now for one narrow doc addition: the duplicate-supplier recovery note is concrete, low risk, and directly evidenced in T2 strategy code.
- Not strong enough to justify this as a high-priority production-score migration task, because that import is defensive rather than score-moving, and the proposal misses more important doc hygiene work in `AGENTS.md`.

## Production score leverage score

18/100

Reason: the only real import is a robustness hedge for duplicate supplier creation in non-fresh contexts. It may prevent crashes, but it does not address the main known T11 score gap and is unlikely to change the leaderboard outcome on fresh-account production runs.

## Confidence

90/100

The key conclusions are directly supported by the live T1 docs, the cited T2 files, and the AGENTS contradiction in the current repo.

## Provisional one-line recommendation

hold

## Bottom line

This proposal is mostly a validation exercise, not a meaningful migration. Its only actionable import is a minor duplicate-supplier recovery note. More importantly, it misses that one of its named target surfaces, `AGENTS.md`, still contains conflicting T11 guidance, which is a bigger production-risk issue than the proposed delta.

## Finder score

- High-impact findings: 2 x 10 = 20
- Medium-impact findings: 2 x 5 = 10
- Low-impact findings: 3 x 1 = 3
- Total score: 33

## Best insight in this task

The single best import is the narrow `POST /supplier` duplicate-recovery branch: if create-first hits duplicate-like `409`/`422`, resolve the existing supplier by `organizationNumber` instead of retrying the write.
