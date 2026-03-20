Likely cause: I got the accounting shape right, but I lost entity correctness.

What I did right:
- gross/net/VAT math was right: `61150 -> 48920 + 12230`
- account `7300` was right
- incoming VAT `25%` was right
- voucher flow itself was plausible

What I did wrong:
- I treated the task as a pure fresh-account create flow and created/used a supplier without proving that was the correct supplier record for this run.
- After a partial side effect had already happened, I reran and then resolved supplier by duplicate-prone search plus heuristic tie-break instead of reusing the exact created supplier id or stopping to investigate state.
- In the final script, the supplier selection is literally “pick newest matching supplier” at [register-supplier-invoice.ts](/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-165244395Z-bc4931a3/scripts/register-supplier-invoice.ts#L116), which is not a correctness-safe assumption once duplicates exist.

Why that can produce `0/8`:
- If Tripletex/scorer expected the invoice on an existing Fossekraft supplier record, and I attached it to a newly created duplicate, none of the scored fields anchored to the intended object would match.
- Once duplicates existed, “same org number/name” was no longer enough. I needed exact target resolution, not heuristic resolution.
- So this was probably not an amount/VAT bug. More likely wrong supplier object / polluted state.

The core reasoning miss:
- When the first run hit the VAT-selector issue, I should have kept the fix inside the same script and continued from the successful `POST /supplier` response.
- I should not have restarted into a new supplier-resolution strategy after a successful write.
- And once duplicates were observed, I should have treated that as a blocker/red flag, not as permission to guess.

So yes: your duplicate suspicion is probably the reason. I optimized for low-call happy path, but after the run stopped being a clean happy path, I did not re-anchor the task correctly to the prompt’s intended supplier entity.