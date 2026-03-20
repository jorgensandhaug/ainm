## 1. Task

Post-run learning pass for the production task that created an outgoing invoice for customer `Lysgård AS` (`organizationNumber=851635874`) with three lines:

- `Analyserapport (2934)` at `29800` ex VAT, target VAT `25%`
- `Datarådgivning (8699)` at `5200` ex VAT, target VAT `15%`
- `Nettverkstjeneste (1355)` at `18050` ex VAT, target VAT `0%`

The run achieved perfect correctness (`8/8`) but only `3/4` task score because the API flow was not minimal.

## 2. Reflection

What went well:

- The final Tripletex side effect was correct.
- The invoice write succeeded without any Tripletex `4xx` API error.
- The script correctly reused the final write response and did not spend a follow-up invoice read.

What went poorly:

- I treated the parenthetical numeric refs as if they were proven Tripletex `productNumber` keys even though the prompt also gave exact product names.
- The first `GET /product?productNumber=2934&productNumber=8699&productNumber=1355&fields=*` did not resolve all lines.
- Instead of keeping the fallback inside the same script, I let the script abort locally and then reran the full flow. That duplicated earlier successful reads.

Correct approach:

- For this exact task shape, the names were rich enough that the lower-call resolver should have been one decisive `GET /product?count=1000&fields=*` with local exact filtering by `name` and/or `number`.
- Resolver fallback should stay inside one script callback/branch. Never restart the whole script after a partial resolver miss if the customer is already resolved.

## 3. Call Efficiency

This run was not minimal-call.

Actual production calls:

1. `GET /customer?organizationNumber=851635874&fields=*`
2. `GET /product?productNumber=2934&productNumber=8699&productNumber=1355&fields=*`
3. `GET /customer?organizationNumber=851635874&fields=*`
4. `GET /product?productNumber=2934&productNumber=8699&productNumber=1355&fields=*`
5. `GET /product?count=1000&fields=*`
6. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
7. `POST /invoice?sendToCustomer=false`

Wasted calls:

- Call 2: speculative numeric product resolver; unnecessary for this name-rich prompt shape.
- Call 3: duplicate customer read caused by restarting the script.
- Call 4: duplicate speculative numeric product resolver caused by restarting the script.

Lower-call path the next agent should follow for this exact shape:

1. `GET /customer?organizationNumber=851635874&fields=*`
2. `GET /product?count=1000&fields=*`
3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
4. `POST /invoice?sendToCustomer=false`

So the correct replacement is `4` calls, not `7`.

## 4. Root Causes

- Weak assumption: I assumed numeric refs in parentheses were real `productNumber` lookup keys because they looked plausible.
- Control-flow bug: I handled the partial product miss by terminating the script instead of invoking a broader in-script fallback callback.
- State reuse failure: because the script restarted, it failed to reuse the already-known customer resolution.
- Missing heuristic: I had the general “exact names + ambiguous refs => catalog read” rule in the docs, but I did not apply it aggressively enough to this exact prompt shape.

## 5. Sandbox Verification

I used sandbox-only credentials and wrote the proof script under:

- `/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164443065Z-17460256/scripts/sandbox_verify_ambiguous_customer_invoice_path.ts`

What I proved:

- I created an analog sandbox customer with `organizationNumber=851635875`.
- I created exact-name analog products whose stored product numbers intentionally differed from prompt-like refs:
  - `Analyserapport 17460256` stored as `52934` while prompt-like ref was `2934`
  - `Dataradgivning 17460256` stored as `58699` while prompt-like ref was `8699`
  - `Nettverkstjeneste 17460256` stored as `51355` while prompt-like ref was `1355`
- After setup, the winning proof path was exactly:
  1. `GET /customer?organizationNumber=851635875&fields=*`
  2. `GET /product?count=1000&fields=*`
  3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
  4. `POST /invoice?sendToCustomer=false`
- That proof invoice succeeded with:
  - `invoiceId=2147532744`
  - `invoiceNumber=48`
  - `amountExcludingVatCurrency=53050`
  - `amountCurrency=53050`

Sandbox limitation:

- This persistent sandbox still exposed only outgoing VAT `0%`, so I could not replay the exact mixed `25% / 15% / 0%` combination there.
- The sandbox proof still validated the important efficiency lesson: exact-name catalog resolution is the right low-call path when numeric refs are not proven lookup keys, and the fallback must stay inside one script.

## 6. Playbook Changes

Updated existing artifacts. No new trusted standard or playbook was created.

Changed paths:

- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-customer-invoice.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer-invoice.md`

What changed:

- Added a production reflection for the exact `851635874` invoice shape.
- Recorded that the speculative `productNumber=` read was wasted for this name-rich prompt.
- Recorded that aborting and rerunning the script duplicated the customer read.
- Strengthened the canonical guidance that fallback must stay in the same script callback/branch.
- Added sandbox proof for the four-call exact-name catalog path.

## 7. Commit

- Commit hash: `a9e0f3760605cb59cacd4ba7cf2ac6ed30a2ec8e`
- Commit message: `tripletex playbook: optimize name-rich invoice product resolution`

## 8. Reusable Heuristics

- If a create-invoice prompt gives exact product names plus parenthetical numeric refs, do not assume the refs are real Tripletex product numbers just because they are numeric.
- For name-rich invoice prompts with explicit VAT, the default low-call path is usually customer read -> product catalog read -> filtered outgoing VAT read -> invoice write.
- Keep resolver fallback inside one script callback/branch. Do not abort and rerun the whole script after a partial product miss.
- Reuse successful early reads. If customer resolution already succeeded, never pay for it twice.
- Do not add a verification `GET /invoice/{id}` when the write response already proves totals and the payload already fixed the scored line fields.