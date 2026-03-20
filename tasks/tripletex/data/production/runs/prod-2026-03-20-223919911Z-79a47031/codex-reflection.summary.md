## 1. Task

Post-run learning pass for the production task: register full payment on the unpaid customer invoice for `Montagne SARL` / `913245539` / `36450` ex VAT / `Session de formation`, then update the Tripletex guidance docs, commit the doc changes, and summarize the result.

## 2. Reflection

The production run itself went well. It used the exact trusted-standard path, located the correct invoice in one decisive read, resolved one valid incoming payment type, and paid the live outstanding balance to zero with no avoidable `4xx`.

What went poorly was not the API execution but the follow-up git hygiene. The repo was dirty, and staging `AGENTS.md` pulled in one pre-existing unrelated AGENTS hunk along with the intended payment-guidance edit. I did not rewrite history after noticing it because that would have required amending or selectively reverting work in a shared dirty tree.

Correct approach for the original task remains:
`GET /invoice?...fields=*` -> `GET /invoice/paymentType?...fields=*` -> `PUT /invoice/{id}/:payment?...paidAmount=<live outstanding>`.

## 3. Call Efficiency

The production run was minimal-call for the exact standalone task shape.

Used calls:
1. `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))`
2. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
3. `PUT /invoice/2147541030/:payment?paymentDate=2026-03-20&paymentTypeId=27087363&paidAmount=45562.5`

Wasted calls: none.

Lower-call path for the next agent:
- Same exact standalone task with no same-run cached payment type: no lower public path than the same 3 calls above.
- Very similar task later in the same run with a proven reusable incoming `paymentTypeId`: `GET /invoice?...fields=*` -> `PUT /invoice/{id}/:payment?...paymentTypeId=<cached>&paidAmount=<live outstanding>`.

## 4. Root Causes

The task shape was already fully covered by the trusted standard, so there was no API-shape discovery failure.

The main correctness risks were:
- paying the prompt lookup amount `36450` instead of the live outstanding `45562.5`
- adding a wasted `GET /customer`
- adding a wasted `GET /invoice/{id}`
- guessing or hardcoding `paymentTypeId`
- rejecting a valid payment type because `name` is null or `creditAccount` is null

The follow-up-process mistake came from staging a whole dirty file instead of isolating only the intended hunk in `AGENTS.md`.

## 5. Sandbox Verification

Persistent sandbox proof used only sandbox credentials and the same standalone payment shape.

Verified 3-call path:
1. `GET /invoice?...fields=*` located unpaid invoice `2147552467` for org `907791616`, text `Prosjektadministrasjon`, ex VAT `7000`, outstanding `7000`
2. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` resolved payment type `32813748` on debit account `1920`
3. `PUT /invoice/2147552467/:payment?paymentDate=2026-03-20&paymentTypeId=32813748&paidAmount=7000` returned remaining outstanding `0`

Sandbox proof also reconfirmed:
- the locate read did not expose a reusable `paymentTypeId`
- the 3-call standalone path is still the minimum safe public path
- a bank-style incoming payment type on debit `1920` remains valid

## 6. Playbook Changes

Updated existing guidance; created no new files.

Changed paths:
- `./AGENTS.md`
- `./trusted-standards/register-customer-invoice-payment.md`
- `./task-playbooks/register-customer-invoice-payment.md`

What changed:
- added the new production proof for `913245539` / `36450` / `Session de formation` -> paid `45562.5`
- added another same-day sandbox re-proof that invoice read still exposes no reusable `paymentTypeId`
- made the `paymentType.name == null` rule explicit in the payment guidance
- kept the canonical path at 3 calls for uncached standalone runs

## 7. Commit

Commit hash: `a72798fdd85dae0c6404a91489be02364b970f3d`

Commit message: `tripletex playbook: refine invoice payment path evidence`

Note: the commit also includes one unrelated pre-existing AGENTS hunk from the dirty worktree because I staged the whole file.

## 8. Reusable Heuristics

- For exact standalone customer-invoice-payment tasks identified by `organizationNumber + ex-VAT amount + exact line text`, start with one decisive `GET /invoice`, not `GET /customer`.
- Treat the prompt amount as a locator only. Pay `amountCurrencyOutstanding`, else `amountOutstanding`.
- Search invoice text across both top-level `orderLines[]` and nested `orders[].orderLines[]`.
- Read `GET /invoice/paymentType` unless the same run already has a proven reusable incoming `paymentTypeId`.
- Prefer ordinary bank-style incoming payment types with debit account `19xx`, especially `1920`.
- Do not require `paymentType.name`.
- Do not require `creditAccount`.
- Do not omit `paymentTypeId`; that is a proven `422`.
- Do not add `GET /invoice/{id}` after payment if the write response already proves remaining outstanding `0`.