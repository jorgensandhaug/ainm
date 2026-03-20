# Task

Post-run learning pass for the production run that reversed the returned payment on Brightstone Ltd's outgoing invoice. Required work: reflect, prove the right path in sandbox, update docs/playbooks, commit those doc changes.

# Reflection

The production run finished the business task correctly, but not cleanly. The reversal itself was correct: locate paid invoice, extract payment voucher, reverse voucher, verify reopened outstanding amount. What went well was the final operational choice: `PUT /ledger/voucher/{paymentVoucherId}/:reverse` followed by invoice verification reopened the balance exactly as intended.

What went poorly was the first invoice read. I sent `fields=...payments(...)` on `GET /invoice` and burned one avoidable `400`. The corrected path should have been selected before the first live call: use `postings(...)`, not `payments(...)`, to discover the payment voucher on outgoing invoice reads.

# Root Causes

- I trusted a nearby invoice-related schema mention of `payments` instead of the endpoint's real outgoing `InvoiceDTO` behavior.
- I had no dedicated trusted standard or playbook for reversing a registered customer-invoice payment, so I improvised from payment-registration material.
- I did not anchor the first field-filter decision tightly enough to the chosen endpoint response shape.
- The exact mistake cost one wasted API call and one `400 Bad Request`.

# Sandbox Verification

Used only the provided sandbox credentials, via TypeScript + `bun`, in the run scripts directory.

Proof script:
`/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-135154579Z-837cd40b/scripts/sandbox-verify-reverse-customer-invoice-payment.ts`

Verified flow on 2026-03-20:
- Created disposable customer `108245278`
- Created disposable product `84385870`
- Created order `401957843`
- Invoiced it as invoice `2147527118` / invoice number `16`
- Paid it with payment type `32813748`
- Located payment voucher from `GET /invoice?...&fields=...,postings(*,voucher(*),...)`
- Extracted payment voucher `608824977`
- Reversed it with `PUT /ledger/voucher/608824977/:reverse?date=2026-03-20`
- Got reverse voucher `608824978`
- Final `GET /invoice?...id=2147527118&fields=*,postings(*,voucher(*))` showed `amountCurrencyOutstanding=1000` again

Correct minimal production path for this task shape is:
1. `GET /invoice` with `postings(...)`
2. `PUT /ledger/voucher/{paymentVoucherId}/:reverse`
3. `GET /invoice` verify reopened outstanding

# Playbook Changes

Created new trusted standard:
- `trusted-standards/reverse-customer-invoice-payment.md`

Created new playbook:
- `task-playbooks/reverse-customer-invoice-payment.md`

Updated existing docs:
- `AGENTS.md`
- `trusted-standards/common-endpoints.md`

Specific doc changes:
- Added a dedicated exact-match reversal standard
- Added a detailed reversal playbook with the 3-call fast path
- Added AGENTS table entries for the new standard/playbook
- Added explicit guidance that outgoing invoice reads use `postings(...)`, and `payments(...)` is invalid on `GET /invoice`

# Commit

Commit hash:
`8cd4211062fe92f0adf203de757c46a9114d8911`

Commit message:
`tripletex playbook: add customer invoice payment reversal flow`

# Reusable Heuristics

- For outgoing customer-invoice payment reversal, reverse the payment voucher, not the invoice and not the payment endpoint.
- On `GET /invoice`, trust `postings(...)` for payment-voucher discovery; do not assume `payments(...)` is valid just because another schema mentions it.
- If the task is an exact correction/reversal shape that lacks a dedicated standard, add one after the run; this is where avoidable `4xx` errors come from.
- For reversal tasks, the write response may prove the reversal happened, but the scored business state is usually on the invoice; verify there.
- When a task is “make invoice outstanding again,” the decisive proof is the post-reversal invoice balance, not the reverse-voucher object alone.