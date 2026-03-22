# Task 15 — Register Project Hours and Create Project Invoice

**Status: `review-ready`**

## Snapshot

- Tripletex1 current best score: 3.3333 / 4 (Tier 2, near-max cleanup target)
- Priority: 6 in the global research queue (execution lane)
- Target Tripletex1 surface:
  - `codex-environment/trusted-standards/register-project-hours-and-create-project-invoice.md`
  - `codex-environment/task-playbooks/register-project-hours-and-create-project-invoice.md`
- Source Tripletex2 materials reviewed:
  - `tasks/tripletex2/src/tasks/task-15/RESEARCH.md` (frontier memory, 2026-03-22)
  - `tasks/tripletex2/src/tasks/task-15/task.ts` (canonical task spec, txTaskId=16)
  - `tasks/tripletex2/src/tasks/task-15/strategies/register-hours-then-project-order-invoice.ts` (v1 active pin)
  - `tasks/tripletex2/src/tasks/task-15/strategies/register-hours-direct-invoice.ts` (v2 challenger)
  - `tasks/tripletex2/configs/active-strategies.json` (pin: `15.register-hours-then-project-order-invoice.v1`)
  - `tasks/tripletex2/research/task-to-prioritize.md` (score-gated research plan)

## Current Tripletex1 coverage

The T1 trusted standard and playbook for this task are **exceptionally thorough** (248 and 319 lines respectively, updated 2026-03-22). They already cover:

- Optimized 3-step parallel layout (timesheet + invoice in parallel at step 3)
- `POST /invoice?sendToCustomer=false` with embedded orders (replacing old 2-step `POST /order` + `PUT /order/:invoice`)
- Non-chargeable and chargeable activity branches with full branching logic
- Proactive bank account handling (parallel `GET /ledger/account` in step 1)
- Multi-day splitting for >24h (`POST /timesheet/entry/list` batch)
- `invoiceDueDate` is required on `POST /invoice` (422 if omitted)
- Create From Scratch variant (11-call 4-step layout)
- Extensive avoidable-mistakes catalog (18+ items)
- Activity resolution: `/activity/>forTimeSheet` is the ONLY valid resolver
- Multiple sandbox re-proofs and production run confirmations

### Important gap

**`invoiceDueDate` derivation is unspecified.** The trusted standard says the field is required (lines 41, 69, 227, 314) and the example payload shows a hardcoded date (`"invoiceDueDate": "2026-04-20"` for `"invoiceDate": "2026-03-20"`, implying +31 days), but there is **no guidance on how to compute it** from available data. This matters because:

1. The old `PUT /order/:invoice` auto-derived `invoiceDueDate` — agents never had to compute it.
2. The new `POST /invoice` requires an explicit `invoiceDueDate` — agents must now supply one.
3. Without derivation guidance, agents will hardcode arbitrary offsets (+30, +31 days), which is semantically wrong when the customer has a configured payment term.

### No other contradictions or stale guidance found

The T1 standard is consistent with all Tripletex2 research findings. The anti-patterns, payload rules, recovery branches, and call-count analysis in T1 all align with the v1 and v2 strategy implementations.

## Candidate imports from Tripletex2

### Import 1 — `invoiceDueDate` derivation from `customer.invoicesDueIn`

- **Insight:** Derive `invoiceDueDate` by reading `customer.invoicesDueIn` from the already-expanded project/customer response (`GET /project?...&fields=*,customer(*)`), then adding that many days to `invoiceDate`. Fall back to 14 days if the field is missing or null.
- **Why it seems new:** The T1 trusted standard requires `invoiceDueDate` but never specifies how to compute it. The T2 v2 challenger strategy (lines 725–733 of `register-hours-direct-invoice.ts`) implements this derivation and the RESEARCH.md documents the fix.
- **Evidence:**
  - v2 strategy `resolveInvoiceDueInDays()` reads `customer?.invoicesDueIn` with a 14-day fallback (`register-hours-direct-invoice.ts:725-733`).
  - RESEARCH.md (lines 46–51): "v2 originally hardcoded `+30 days`, which was semantically wrong. Fixed to read `customer.invoicesDueIn` from the already-expanded project/customer response (no extra call). Sandbox-verified: computed dueDate matches PUT /order/:invoice auto-derived dueDate exactly (14 days for this sandbox customer)."
  - Zero extra API calls — `customer.invoicesDueIn` is already available from `GET /project?...&fields=*,customer(*)` which T1 step 1 already performs.
  - The OpenAPI spec (`openapi.json:41231-41241`) confirms `invoicesDueIn` (int32, 0–10000) and `invoicesDueInType` (enum: `DAYS`, `MONTHS`, `RECURRING_DAY_OF_MONTH`) exist on the Customer schema.
- **Confidence:** **High** for the `DAYS` type (sandbox-verified, zero-cost). **Low** for `MONTHS` and `RECURRING_DAY_OF_MONTH` types (not tested in any T2 strategy or sandbox proof).

### Import 2 — Anti-pattern: do not hardcode `invoiceDueDate`

- **Insight:** Add an explicit anti-pattern warning against hardcoding `invoiceDueDate` to a fixed offset (e.g., +30 days). The correct approach is to read the customer's configured payment terms.
- **Why it seems new:** The T1 avoidable-mistakes list (18+ items) does not include this. The T1 example payload implicitly suggests hardcoding by showing `"invoiceDueDate": "2026-04-20"` for `"invoiceDate": "2026-03-20"`.
- **Evidence:**
  - RESEARCH.md (line 97): "Do NOT hardcode invoiceDueDate — read `customer.invoicesDueIn` from expanded project data."
  - The v2 strategy development history shows hardcoded +30 days was the first implementation and was sandbox-proven wrong (dueDate did not match auto-derived value).
- **Confidence:** **High.** This is a direct T2 anti-pattern finding, backed by sandbox verification.

## Proposed markdown deltas

### Trusted standard

- **Target file:** `codex-environment/trusted-standards/register-project-hours-and-create-project-invoice.md`
- **Proposed addition 1 — Payload Rules section**, after the existing `invoiceDueDate` 422 rule (line 69):
  ```
  - derive `invoiceDueDate` from the customer's payment terms: read `customer.invoicesDueIn` from the expanded project response (`GET /project?...&fields=*,customer(*)`), add that many days to `invoiceDate`; if `invoicesDueIn` is missing or null, fall back to 14 days; this field is already available from step 1 at zero extra cost
  - this derivation only handles `invoicesDueInType=DAYS` (the most common case); `MONTHS` and `RECURRING_DAY_OF_MONTH` types are not yet proven in sandbox and should be treated as unsupported edge cases
  ```
- **Proposed addition 2 — Avoidable Mistakes section**, new entry:
  ```
  - Do not hardcode `invoiceDueDate` to a fixed offset like +30 days; the customer may have a configured `invoicesDueIn` that differs; read it from the expanded project/customer response instead; sandbox-verified that the derived value matches what `PUT /order/:invoice` auto-computed
  ```
- **Proposed addition 3 — Recommended Shapes section**, update the direct invoice example (line 204 area) to show derivation:
  ```
  Replace the static `"invoiceDueDate": "2026-04-20"` with a comment noting the value is computed from `customer.invoicesDueIn` (e.g., 14 days → "2026-04-03" for a "2026-03-20" invoice date).
  ```
- **Reason:** When T1 migrated from `PUT /order/:invoice` (which auto-derived `invoiceDueDate`) to `POST /invoice` (which requires it explicitly), a derivation gap opened. This delta closes it with a zero-cost, sandbox-verified approach.

### Playbook

- **Target file:** `codex-environment/task-playbooks/register-project-hours-and-create-project-invoice.md`
- **Proposed addition — Verified Findings section**, new entry:
  ```
  - `customer.invoicesDueIn` is available from the expanded `GET /project?...&fields=*,customer(*)` response and can be used to derive `invoiceDueDate` for `POST /invoice` at zero extra cost; sandbox-verified 2026-03-22 that adding `invoicesDueIn` days to `invoiceDate` produces the same due date that `PUT /order/:invoice` auto-derived; default fallback is 14 days when the field is missing
  ```
- **Reason:** Documents the derivation as a verified finding so future agents can cite it.

### AGENTS.md

- No changes proposed. The general AGENTS.md invoicing notes already say `invoiceDueDate` is required; the derivation detail belongs in the task-specific trusted standard, not the top-level classifier.

## Risks / caveats

- **Mapping ambiguity:** None. Task 15 (canonical) maps cleanly to txTaskId 16 via `legacy-tripletex1-task-bridge.ts`. The T1 trusted standard filename matches exactly.
- **Conflicting evidence:** None found. The `invoicesDueIn` derivation aligns with all sandbox and production evidence.
- **`invoicesDueInType` edge cases:** The OpenAPI spec shows `invoicesDueIn` can operate in three modes: `DAYS`, `MONTHS`, and `RECURRING_DAY_OF_MONTH`. The v2 strategy and all sandbox proofs only cover `DAYS`. If a production customer uses `MONTHS` or `RECURRING_DAY_OF_MONTH`, the simple `addDays` derivation would be wrong. The proposal explicitly flags this as unsupported.
- **Score impact uncertainty:** RESEARCH.md notes that tx_task_id 15 leaderboard attribution is noisy (attributed runs are often from different task types). The 3.3333/4 score and the 0.6667 gap being "efficiency-based" are plausible but not fully proven. The `invoiceDueDate` fix is unlikely to directly improve the score — it improves semantic correctness, not call count.
- **Not safe to port yet:** The v2 challenger strategy (`15.register-hours-direct-invoice.v2`) is sandbox-verified but not yet production-confirmed and has not been promoted to the active pin. However, the `invoiceDueDate` derivation from v2 is **independent** of the v2 invoice creation method — it works equally well with T1's current `POST /invoice` approach. The derivation itself is safe to port.
- **14-day fallback:** The v2 strategy defaults to 14 days when `invoicesDueIn` is missing. This matches the sandbox customer's actual value but may not be the universal best default. The old `PUT /order/:invoice` auto-derivation presumably used the same customer data server-side, so 14 days is likely correct for the common case.

## Recommendation

- **Adopt now** (narrow scope)
- The `invoiceDueDate` derivation is a small, concrete, zero-cost addition to the trusted standard that fills a real gap created by the migration from `PUT /order/:invoice` to `POST /invoice`. It is sandbox-verified and requires no structural changes to the existing flow. The only caveat (`invoicesDueInType` edge cases) is explicitly flagged and does not block the common-case improvement.
- No other imports are needed — the T1 standard is already remarkably comprehensive and up-to-date. The remaining score gap (0.6667/4) appears to be efficiency-based and is unlikely to be closed by markdown changes alone; it depends on the scoring formula and whether GETs count toward the score.
