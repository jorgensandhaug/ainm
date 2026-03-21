# Score Reflection: prod-2026-03-21-153247538Z-69e8d73c

## 1. Task Attribution

- **tx_task_id**: 09 (T2 tier, max score 4)
- **Prompt**: Create an invoice for customer Ridgepoint Ltd (org no. 970844708) with three product lines: Software License (3957) at 3650 NOK / 25% VAT, Maintenance (8149) at 11000 NOK / 15% VAT (food), Web Design (8092) at 17700 NOK / 0% VAT (exempt)
- **Task shape**: Exact match for `create-customer-invoice` trusted standard — existing customer by orgNo, existing products by product number, mixed VAT rates, no send
- **Previous best_score**: 2.5333
- **This run's score**: 0
- **Leaderboard movement**: None (best_score stayed at 2.5333; total_attempts incremented 10→11)

## 2. Correctness Verdict

**Correctness: 0** — Complete failure. No Tripletex side effects were created.

The agent timed out after 300,148ms without making a single API call. The trace shows 5 local tool calls (file reads/globs) and 0 assistant messages. The agent identified the correct trusted standard (`create-customer-invoice.md`) but never wrote or executed a script. Zero checks passed because no invoice, no order, and no order lines existed in the Tripletex account at scoring time.

## 3. Efficiency Verdict

Not applicable — the run produced zero API calls and zero side effects. There is nothing to measure efficiency against. The theoretical optimal path for this exact task shape is **3 API calls** (or 6 with bank-account repair):

1. `GET /customer?organizationNumber=970844708&fields=*`
2. `GET /product?productNumber=3957&productNumber=8149&productNumber=8092&fields=*`
3. `POST /invoice?sendToCustomer=false` (reusing `product.vatType.id` from step 2)

If bank account is missing: +3 calls (`GET /ledger/account`, `PUT /ledger/account/{id}`, retry `POST /invoice`).

## 4. Likely Root Cause

**Timeout without execution.** The agent spent the entire 300s budget on local file operations and extended model generation without ever writing a script or calling the Tripletex API.

Detailed timeline from trace:
- **T+0s** (15:32:49): Prompt received
- **T+7s** (15:32:56): 3 parallel tool calls — `Read AGENTS.md` (failed: 27703 tokens > 25000 limit), `Glob trusted-standards/*invoice*` (ok), `Glob task-playbooks/*invoice*` (ok)
- **T+22s** (15:33:11): 2 parallel tool calls — `Read trusted-standards/create-customer-invoice.md` (ok, 99 lines), `Read AGENTS.md offset=1 limit=100` (ok)
- **T+22s → T+300s** (~278 seconds): Model was generating but never produced any tool calls or text output. The run timed out.

The agent was stuck in an extended generation phase for nearly 5 minutes after completing its reads. Possible causes:
1. The proxy backend (`claude-proxy`) may have introduced latency or the model generation was extremely slow for the `claude-opus-4-6` model at `effort: high`
2. The trusted standard file (`create-customer-invoice.md`) is 99 lines including extensive sandbox verification history notes — the agent may have been over-processing that content
3. AGENTS.md partial read (lines 1-100) returned the Tripletex Gotchas section which is extremely long and dense — the agent may have been attempting to process all of it before acting

**Core issue**: The agent treated this as a "plan before calling APIs" situation and over-invested in reading, when this was an exact trusted-standard match that should have been executed within the first 30 seconds.

## 5. What Went Right

- The agent correctly identified the task as a `create-customer-invoice` trusted standard match on its very first tool call batch
- The two glob calls were unnecessary (the trusted standard table in AGENTS.md already names the exact file) but at least ran in parallel with the AGENTS.md read
- The second batch correctly read the trusted standard file

## 6. What To Change Next Time

1. **Execute immediately after reading the trusted standard.** For an exact match like this, the agent should write and run the script within 30 seconds of reading the trusted standard. Do not re-read AGENTS.md, do not glob for playbooks, do not spend additional time "planning." The trusted standard already contains the complete flow.

2. **Skip AGENTS.md entirely for exact trusted-standard matches.** The prompt already says "Follow ./AGENTS.md exactly" and provides the trusted-standard table in the system instructions. The agent should go directly to `Read trusted-standards/create-customer-invoice.md` → `Write script` → `Bash bun run script.ts`.

3. **Trim the trusted standard's sandbox history.** The `create-customer-invoice.md` file is 99 lines, but only lines 1-71 contain actionable flow instructions. Lines 72-99 are verbose sandbox verification logs from prior reflections. These add token pressure and slow down the agent's generation. Future reflections should condense these into compact summary bullets rather than appending full narrative logs.

4. **Budget a hard 60s wall for file reads.** If the agent has not started writing a script within 60 seconds of receiving the prompt, it should immediately write a best-effort script from whatever it has read so far. For a well-documented exact trusted-standard match, no more than 2 file reads should be needed.

5. **Use the proven 3-call path.** The optimal script for this exact task shape:
   ```
   GET /customer?organizationNumber=970844708&fields=*  → customerId
   GET /product?productNumber=3957&productNumber=8149&productNumber=8092&fields=*  → product IDs + vatType.ids
   POST /invoice?sendToCustomer=false  → with product.id and product.vatType.id on each line
   ```
   With in-script bank-account repair branch if the POST returns the known `bankkontonummer` validation error.

6. **Previous best for task 09 is 2.5333/4.** This means prior runs achieved correctness but with suboptimal efficiency (likely 4+ API calls, possibly including GET /ledger/vatType or bank-account repair). The 3-call path proven in sandbox should achieve max efficiency bonus on next attempt.
