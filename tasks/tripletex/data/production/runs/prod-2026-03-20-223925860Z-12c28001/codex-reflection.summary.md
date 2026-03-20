## 1. Task

Post-run learning pass for the blocked production task: create and send one taxed customer invoice to `Nordhav AS` (`876520427`) for `Analyserapport`, `7850` NOK excluding VAT, then update the docs and commit the learning.

## 2. Reflection

What went well:
- The scored run stopped after the first API call when the proxy returned `403 {"error":"Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.","source":"nmiai-proxy"}`.
- That matched `AGENTS.md`. No alternate endpoint guesses, auth variations, or extra wasted production calls.

What went poorly:
- The run could not reach the actual invoice flow because credentials were unusable.
- I initially added a temporary note to `AGENTS.md` during reflection, then removed it when I saw unrelated pre-existing worktree edits there. The final commit stayed limited to the relevant trusted standard and playbook.

Correct approach:
- For this exact production run, the correct approach was exactly what happened operationally: first call, observe proxy-token `403`, stop immediately.
- For the same task shape with valid credentials, the correct path remains the existing trusted `3`-call branch:
  1. `POST /customer` with `name`, `organizationNumber`, `invoiceSendMethod: "MANUAL"`
  2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
  3. `POST /invoice` with default `sendToCustomer=true`

## 3. Call Efficiency

The scored run was minimal-call for the blocked-credentials case.

Wasted calls:
- None.

Exact lower-call path for the next agent when credentials are valid:
1. `POST /customer`
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
3. `POST /invoice`

Conditional repair only if invoice create fails with missing company bank account:
4. `GET /ledger/account?isBankAccount=true&fields=*`
5. `PUT /ledger/account/{id}`
6. Retry the same `POST /invoice`

Pitfalls that would waste calls or trigger avoidable `4xx`:
- Do not spend `GET /customer` first on this fresh-account shape.
- Do not split sending into `POST /invoice?sendToCustomer=false` plus `PUT /invoice/{id}/:send`.
- Do not omit `orderLines[].vatType`; that can silently create a wrong untaxed invoice.
- Do not hardcode `vatType.id=3`.
- If the first call returns the proxy-token `403`, stop immediately.

## 4. Root Causes

- Primary blocker: unusable production proxy token.
- No evidence of a task-flow mistake in the scored run itself.
- Secondary environment constraint from sandbox verification: this persistent sandbox still exposes only outgoing VAT `0%` on `2026-03-20`, so it cannot fully execute this taxed branch without becoming incorrect.

## 5. Sandbox Verification

Used only the provided sandbox credentials and a TS script under the run `scripts/` directory.

Sandbox proof:
- `POST /customer` succeeded for `Nordhav Reflection 12c28001 AS` / `999280012`, returning `customerId=108285998`.
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only:
  - `id=6`
  - `percentage=0`
  - `name="Ingen utgående avgift (utenfor mva-loven)"`
- No exact `25%` outgoing VAT row existed.
- Therefore the sandbox is blocked for this exact Norwegian taxed `eksklusiv MVA` branch; using `0%`, omitting `vatType`, or guessing a hardcoded VAT id would be wrong.

## 6. Playbook Changes

Updated existing docs, no new files created.

Changed paths:
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-and-send-customer-invoice.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-and-send-customer-invoice.md`

What changed:
- Added the exact Norwegian wording nuance: `eksklusiv MVA` belongs to the taxed ex-VAT branch, not a no-VAT branch.
- Added the exact sandbox analog proof for `Nordhav Reflection 12c28001 AS` / `999280012` / `Analyserapport` / `7850`, showing the sandbox still exposes only `0%` outgoing VAT and is therefore blocked for this taxed branch.

## 7. Commit

Commit hash:
- `a81a51fabd841c6bc9971816ee0347cf4ffcae4f`

Commit message:
- `tripletex playbook: clarify norwegian taxed invoice branch`

## 8. Reusable Heuristics

- For fresh-account create-and-send one-line service prompts with only `name + organizationNumber`, default to direct `POST /customer`, not `GET /customer`.
- Treat `excluding VAT`, `excluding MVA`, `hors TVA`, and `eksklusiv MVA` as the same taxed direct-line branch; require an exact filtered outgoing `25%` VAT row.
- If the filtered outgoing VAT read exposes only `0%`, the taxed branch is blocked in that account. Do not downgrade to `0%`.
- For create-and-send invoice tasks, the send step is usually the `POST /invoice` itself with default `sendToCustomer=true`.
- A first-call proxy-token `403` is a hard stop, not a signal to explore alternate auth or endpoints.