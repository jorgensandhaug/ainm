# Score-Aware Reflection: prod-2026-03-21-183342801Z-9aa6f4d7

## 1. Task Attribution

- **Submission ID**: `b10181fb-cb6c-4537-b504-2f91e1f71dd1`
- **Leaderboard task**: `tx_task_id=15` (T2, max 4 points)
- **Attribution confidence**: high — submission `queued_at=18:33:42` matches run `before_captured_at=18:33:42.850Z`; `completed_at=18:35:28` aligns with task completion at `18:35:17Z`
- **Second diff entry** (`tx_task_id=14`, completed 18:33:45) was from a different concurrent run queued at 18:32:44

## 2. Correctness Verdict

**PERFECT** — 8/8 raw score, 4/4 checks passed.

All checks passed:
- Fixed price set correctly (178450 kr)
- Project linked to correct customer (Stormberg AS, 957353681)
- Project manager set correctly (Magnus Haugen, magnus.haugen@example.org)
- Partial invoice created for 50% (89225 kr excl. VAT)

## 3. Efficiency Verdict

**Suboptimal** — normalized_score 3/4 (75%), below the task-15 best of 3.333.../4 (83.3%).

- **Production path**: 7 calls, 0 errors
  1. `GET /project` — found project, matched customer + manager
  2. `PUT /project` — set fixedprice=178450
  3. `GET /ledger/vatType` — outgoing 25% (id=3)
  4. `POST /order` — milestone line 89225
  5. `GET /ledger/account` — proactive hedge, found missing bank
  6. `PUT /ledger/account` — fixed bank number on account 1920
  7. `PUT /order/:invoice` — invoice created successfully
- **Task-15 best score** 3.333.../4 likely came from a 6-call run (update-needed + configured bank, proactive hedge wasted 1 call), or possibly a different scoring formula weight
- **Absolute minimum for this instance**: 7 calls (bank was truly missing, project truly needed update) — the run was instance-optimal but scored below the task ceiling because other instances of the same task shape have lower minimum call counts (4 calls on skip-PUT branch, 6 on update-needed + configured bank)

## 4. Likely Root Cause

**Not an agent error — the run was instance-optimal.** The 7-call count was unavoidable for this specific combination:
1. Project needed `fixedprice` update → `PUT /project` mandatory
2. Bank account was missing → `GET /ledger/account` + `PUT /ledger/account` both mandatory
3. `GET /project`, `GET /ledger/vatType`, `POST /order`, `PUT /order/:invoice` are all mandatory

The 3/4 normalized score reflects that task 15's scoring minimum is likely 4 calls (the skip-PUT branch), and 7 calls is 3 above that. The proactive hedge was strategically correct — without it, the run would have hit a 422, costing an extra call (8 total) AND an error penalty, for a worse score.

The gap to the task-15 best of 3.333... came from the luck of the draw: this instance had both a stale project (needing update) and a missing bank account. A 6-call instance (update-needed + configured bank) would have scored 3.333..., and a 4-call instance (skip-PUT) would have scored 4.0.

## 5. What Went Right

1. **Proactive hedge was correct**: bank account was missing; without the hedge, the run would have hit 422 → 8 calls + error penalty → worse score
2. **Project-first resolver worked perfectly**: single `GET /project?fields=*,customer(*),projectManager(*)` proved customer and manager in one call, avoiding separate `GET /customer` and `GET /employee`
3. **Perfect correctness**: all 4 checks passed, 8/8 raw score
4. **Exact milestone arithmetic**: `178450 * 0.50 = 89225` accepted directly
5. **Correct VAT selection**: 25% outgoing VAT (id=3) selected correctly on taxable account
6. **Followed trusted standard exactly**: the update-needed proactive-hedge path is documented as the default and was the right call here

## 6. What To Change Next Time

**Nothing actionable for the agent.** The run followed the trusted standard perfectly and achieved the minimum call count for its specific instance. The lower scores on task 15 are a function of instance-level variance (whether the bank is configured and whether the project already has the target fixedprice), not agent decisions.

Specific non-changes:
- **Do NOT switch back to optimistic path** for update-needed branch — 3/5 production runs had missing bank accounts (60%); the proactive hedge remains the better default
- **Do NOT remove the proactive hedge on update-needed** — the 422 double penalty (extra call + error) makes optimistic strictly worse in expectation at the current 60% missing rate
- **Continue using project-first resolver** — it correctly avoided separate `GET /customer` and `GET /employee` calls
- **The only way to score 4/4 on task 15** is to land on the skip-PUT branch (project already has correct fixedprice), which is determined by the Tripletex account state, not by the agent's choices

The trusted standard and playbook already document the correct conditional branching. No changes needed.
