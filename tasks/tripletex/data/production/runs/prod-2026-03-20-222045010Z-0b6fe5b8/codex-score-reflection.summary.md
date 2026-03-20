## 1. Task Attribution

`task-attribution.json` is officially ambiguous: no single `tx_task_id` was attributed there.

Likely attribution is `tx_task_id = 11` because:
- `prompt-task-labels.jsonl` maps this supplier-invoice prompt family to task `11`
- `leaderboard.diff.json` shows task `11` changed exactly at `2026-03-20T22:22:49.686206+00:00`
- `submissions.after.json` shows submission `f1252bdc-f7e6-4858-9457-63739a1fb64f` completed at that same timestamp
- that completion time matches this run’s `task_complete_timestamp`

## 2. Correctness Verdict

Not perfect.

`submission-score.json` stayed ambiguous, but the local submissions artifact strongly suggests this run’s submission was:

- id: `f1252bdc-f7e6-4858-9457-63739a1fb64f`
- `score_raw = 4`
- `score_max = 8`
- `normalized_score = 1`
- feedback: `2/4 checks failed`

By the stated decision rule, correctness was not perfect.

## 3. Efficiency Verdict

Efficiency was not the main issue.

Reason:
- correctness appears to be below perfect
- leaderboard task `11` moved from `0` to `1`, which matches the likely submission’s `normalized_score = 1`
- there is no sign here of “perfect correctness but weaker score”
- therefore the score loss is much more likely wrong/missing final state than extra calls

The run was also not obviously wasteful on calls:
- safe path shape was followed
- no extra verification `GET`
- no visible retry loop
- no visible `4xx`

## 4. Likely Root Cause

Most likely a final-state mapping problem inside the imported supplier invoice, not an efficiency problem.

What the run did:
- `GET /supplier`
- conditional `POST /supplier`
- `GET /ledger/account`
- `GET /ledger/vatType`
- `POST /ledger/voucher/importDocument`
- `PUT /ledger/voucher/{id}?sendToLedger=false`

What likely went wrong:
- the run probably created a real supplier-invoice object and some correct accounting state, but two scored fields were still wrong
- the most suspicious parts are the imported XML/header defaults:
  - fallback `IssueDate` and `DueDate` were both forced to run date
  - line description was normalized to `services de bureau` rather than preserving the full prompt phrase literally
  - XML used placeholder buyer/address data

Most likely failure class:
- hidden scorer fields on the supplier-invoice document/header were stricter than the sandbox proof suggested
- dates are the strongest candidate because two checks failed and both were omitted in the prompt, so the run had to invent them

Less likely cause:
- call inefficiency
- duplicate-supplier mistake
- missing VAT posting
- wrong expense account

Those less likely causes are weaker because the run used the correct lookup-first flow and sandbox proof showed the accounting branch itself works.

## 5. What Went Right

- Used the correct supplier-invoice family instead of plain `POST /ledger/voucher`
- Avoided `POST /incomingInvoice`
- Avoided avoidable `4xx`
- Reused write responses instead of adding verification reads
- Used correct gross/net/VAT math: `72350 / 57880 / 14470`
- Used correct account family: `6300`
- Used correct incoming VAT resolver family: `typeOfVat=INCOMING`

## 6. What To Change Next Time

- Treat this as a correctness problem first, not an efficiency problem.
- Do not assume sandbox-valid fallback dates are scorer-correct in production.
- Preserve prompt text even more literally in imported document fields; avoid paraphrasing/normalizing description text.
- Be more suspicious of hidden supplier-invoice header fields than of the ledger postings, since the ledger shape likely accounted for the passed checks.
- Keep the same lookup-first call structure; there is no evidence that fewer calls would have fixed this run.
- Add explicit production-run logging of branch and final imported header values so later score review can separate document-field mistakes from posting mistakes.