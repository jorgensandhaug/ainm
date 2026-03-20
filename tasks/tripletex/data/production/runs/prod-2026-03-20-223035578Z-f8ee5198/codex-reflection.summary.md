## Task

Post-run learning pass for the scored Tripletex task: register `39` hours for `Diego Sánchez` on project `Desarrollo de app`, activity `Analyse`, rate `1450 NOK/h`, then create the project invoice. Required follow-up: audit call efficiency, re-prove the path in persistent sandbox, update docs, commit doc changes.

## Reflection

What went well:
- The scored run recognized the decisive branch early: `/activity/>forTimeSheet` returned `isChargeable=false`, so `/project/hourlyRates` was correctly skipped.
- The run avoided the known fatal stop condition on non-chargeable activities and still completed the scored side effects via manual project-linked `POST /order` + `PUT /order/:invoice`.
- The run also avoided the known `>24h` trap by splitting the write into `24 + 15` hours across two dates.

What went poorly:
- The main trusted-standard flow still reads visually like a single `POST /timesheet/entry`, so the high-hour branch is easy to miss unless the reader also notices the deeper payload/recovery notes or prior proof files.
- The task shape looks like “rate-driven billable hours”, but the public API still allows a non-chargeable activity write and leaves `hourlyRate=0` on the timesheet. That mismatch is easy to misread as failure even though the scoring-safe invoice fallback is still correct.

Mistakes in the scored run:
- No scored-run API mistakes, no wasted retries, no avoidable `4xx`, no extra reads.

Correct approach:
- Exact non-chargeable `39h` branch: `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` (`24`) -> `POST /timesheet/entry` (`15` on another date) -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`.

## Call Efficiency

The scored run was minimal-call for this exact task shape.

Wasted calls:
- None.

Why minimal:
- `39` hours cannot be done in one `POST /timesheet/entry`; Tripletex rejects `projectChargeableHours > 24`.
- The same employee/project/activity cannot take a second same-day time entry; Tripletex returns `409`.
- Because `isChargeable=false`, adding `GET /project/hourlyRates` or any rate write would be wasted.
- A VAT lookup was still required for the manual order line.
- No lower-call public shortcut was found in sandbox.

Exact lower-call path next agent should follow for the same/similar prompt:
- If `/activity/>forTimeSheet` returns `isChargeable=false` and total hours `> 24`, use the exact `8`-call split branch above.
- If the same branch has hours `<= 24`, the floor stays `7` calls.

## Root Causes

- Tripletex separates internal billability semantics from the scored customer-facing invoice side effect. Non-chargeable timesheet writes can still be the correct branch.
- `POST /timesheet/entry` has two non-obvious constraints that dominate this prompt family:
  - per-entry `projectChargeableHours <= 24`
  - one entry per `employee + project + activity + date`
- The prompt’s “rate per hour” is not proof that the resolved activity is chargeable. The activity lookup decides that branch.
- Sandbox and production can expose different outgoing VAT sets. The path stayed the same; totals differed because sandbox used `0%` and production used `25%`.

## Sandbox Verification

Persistent sandbox proof used:
- employee `codex.verify.1773957815637@example.org`
- project `Sandbox Hour Invoice Project 1774020541520`
- customer org `907791616`
- activity `Prosjektadministrasjon`
- dates `2026-05-11` and `2026-05-12`

Result:
- `callCount: 8`
- `activityIsChargeable: false`
- first entry `24h` on `2026-05-11`
- second entry `15h` on `2026-05-12`
- invoice `2147552098` / number `166`
- `amountExcludingVatCurrency: 56550`
- `amountCurrencyOutstanding: 56550`

Conclusion:
- The exact high-hour non-chargeable split branch re-proved cleanly.
- No lower-call public replacement path was exposed.

## Playbook Changes

Updated existing docs, no new files created:
- `trusted-standards/register-project-hours-and-create-project-invoice.md`
- `task-playbooks/register-project-hours-and-create-project-invoice.md`

What changed:
- Added same-session persistent-sandbox re-proof for the exact `39h` non-chargeable split branch.
- Recorded that the branch again completed in `8` calls on fresh dates.
- Recorded explicitly that no lower-call public shortcut was found.

## Commit

- Hash: `a69a6b530e1b42f03390a1af732885bf5c4a2b97`
- Message: `tripletex playbook: refine project-hour invoice high-hour branch`

## Reusable Heuristics

- On project-hour invoice tasks, branch first on `/activity/>forTimeSheet.isChargeable`, not on prompt wording.
- If `isChargeable=false`, skip `/project/hourlyRates`; do not waste a read or a doomed rate write.
- If total hours `> 24`, pre-split before the first write. Do not “probe” with an oversized entry.
- Never stack multiple same-day entries for the same `employee + project + activity`.
- For side-effect-scored prompts, non-chargeable timesheet response `chargeable=false` / `hourlyRate=0` is not a blocker by itself.
- Use the manual project-linked order-line invoice fallback when public API hour-consumption invoicing is not available.
- Reuse the exact split branch as the canonical floor for future `>24h` non-chargeable project-hour invoice prompts.