# Task prioritization — score-gated research plan (2026-03-21)

Based on:
- the updated visual leaderboard chart shared in Discord on 2026-03-21 (~20:14 UTC)
- the current interpretation that max-score tasks should be endpoint-killed for live routing and score-chasing

## Policy

For research and live experimentation, we should stop burning endpoint budget on tasks that have already reached the tier max.

In this document:
- **kill** = do not spend more live endpoint calls on this task for score-chasing right now
- **watch** = not maxed, but not the best current research target
- **focus** = active strategy research target

Important nuance: **kill is only a score-chasing decision**, not a claim that `tripletex2` has perfect deterministic consolidation for that task. A task can be kill-for-now on the leaderboard and still be worth offline cleanup later.

## Tier maxima

- **Tier 1 (01-08):** max score = `2`
- **Tier 2 (09-18):** max score = `4`
- **Tier 3 (19-30):** max score = `6`

---

## Tier 1 snapshot

Tier total: **15.4 / 16**

### Kill
- `01` — 2 / 2
- `02` — 2 / 2
- `03` — 2 / 2
- `04` — 2 / 2
- `05` — 2 / 2
- `07` — 2 / 2
- `08` — 2 / 2

### Focus
- `06` — **1.4 / 2**
  - the only open Tier 1 hole
  - this should stay hot until closed

### Tier 1 conclusion
Tier 1 is basically done. **Task 06 is the only task that should receive live endpoint research.** Everything else in this tier is kill-for-now.

---

## Tier 2 snapshot

Tier total: **27.0 / 40**

### Kill
- `09` — 4 / 4
- `14` — 4 / 4
- `18` — 4 / 4

### Focus: fast / medium ROI
- `17` — **3.5 / 4**
- `15` — **3.33 / 4**
- `10` — **3 / 4**
- `16` — **3 / 4**

These are not perfect, but they are already functional enough that strategy improvements may pay off without huge discovery cost.

### Focus: high-upside but harder
- `12` — **0 / 4**
- `13` — **1.13 / 4**
- `11` — **1 / 4**

Notes:
- `11`, `12`, and `13` are the ugly Tier 2 cluster.
- Historical note in research says these are difficult and involve file-upload style flows.
- `12` has especially high upside because the current leaderboard gap is the full `4` points.

### Tier 2 conclusion
Tier 2 splits into two lanes:
1. **Execution lane:** `17`, `15`, `10`, `16`
2. **Hard research lane:** `12`, `13`, `11`

If we want quick score movement, start with the execution lane. If we want biggest raw upside, eventually we have to crack the `11-13` cluster.

---

## Tier 3 snapshot

Tier total: **36.6 / 72**

### Kill
- `25` — 6 / 6
- `26` — 6 / 6
- `27` — 6 / 6
- `28` — 6 / 6

### Focus: immediate strategy targets
- `24` — **2.25 / 6**
  - known classifier/variant routing bug: a 4-error German ledger prompt was misrouted to task `21`
  - this looks like a good score-per-fix candidate
- `22` — **0 / 6**
  - known zero-score task with suspected account/VAT heuristic problems
- `29` — **0 / 6**
  - implemented and research-draftable, but not yet proven

### Focus: secondary open frontier
- `30` — **1.8 / 6**
- `23` — **0.6 / 6**

### Watch / park for now
- `19` — **2.7273 / 6**
- `21` — **2.5714 / 6**
- `20` — **2.1 / 6**

These are not solved, but they are not the highest-leverage place to spend the next live research cycles compared with `22`, `24`, and `29`.

### Tier 3 conclusion
For Tier 3, the best current live-research wedge is:
1. `24`
2. `22`
3. `29`
4. `30`
5. `23`

`19`, `20`, and `21` should be parked unless a very specific strategy idea appears.

---

## Global research queue

If we want one practical queue instead of thinking tier-by-tier, use this:

1. `06` — only remaining Tier 1 gap
2. `24` — classifier mismatch looks fixable and high leverage
3. `22` — zero-score known-bad heuristic
4. `29` — implemented but unproven, large upside
5. `17` — near-max Tier 2 cleanup
6. `15` — near-max Tier 2 cleanup
7. `10`
8. `16`
9. `12` — huge upside, but likely heavier work
10. `13`
11. `11`
12. `30`
13. `23`
14. `19`
15. `21`
16. `20`

## Score-kill set

These tasks should currently be considered **endpoint-killed for score chasing**:

- Tier 1: `01`, `02`, `03`, `04`, `05`, `07`, `08`
- Tier 2: `09`, `14`, `18`
- Tier 3: `25`, `26`, `27`, `28`

That gives us a current kill set of **14 tasks**.

## Operational implication

When the research/operator flow classifies a prompt into one of the killed tasks above, the default assumption should be:
- do **not** schedule that task for more live endpoint experimentation just to chase score
- only reopen it if:
  - we discover regression,
  - we need deterministic consolidation in `tripletex2`, or
  - we have a concrete efficiency idea that is too good to ignore
