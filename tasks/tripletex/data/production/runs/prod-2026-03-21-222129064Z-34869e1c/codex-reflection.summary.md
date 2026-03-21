# Codex Reflection Summary

## 1. Task

Create a full credit note reversing the invoice for "Nettverkstjeneste" (41600 kr excl. VAT) for customer Lysgård AS (org.nr 962467210).

## 2. Reflection

**What went well:**
- Immediately recognized this as an exact match for the `create-customer-invoice-credit-note` trusted standard
- Read the trusted standard before writing the script (as required)
- Executed the exact two-call path without hesitation or extra reads
- Both calls succeeded with zero errors
- The locate step correctly matched the invoice by organization number, description, and amount
- The credit note write response confirmed success with `isCreditNote=true` and `creditedInvoice=2147644728`

**What went poorly:**
- Nothing. This was a textbook execution of the trusted standard.

**Mistakes:**
- None. The run was flawless.

## 3. Call Efficiency

**Was the run minimal-call?** Yes.

**API calls made:** 2 (the proven minimum for this task shape without an exact invoice ID in the prompt)
1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` — locate the original invoice
2. `PUT /invoice/2147644728/:createCreditNote?date=2026-03-21&sendToCustomer=false` — create the credit note

**Wasted calls:** 0

**Lower-call path:** None exists for this prompt shape. The prompt does not give the invoice ID, so the locate read is required. The only way to reach 1 call would be if the prompt already provided the exact invoice ID.

## 4. Root Causes

No issues to root-cause. The run was optimal.

## 5. Sandbox Verification

Re-verified in persistent sandbox on 2026-03-21 with a disposable fixture matching `organizationNumber=962467210`, `description="Nettverkstjeneste"`, `amountExcludingVatCurrency=41600`:
- Created fixture customer, order (with sandbox-valid vatType 6/0%), and invoice
- The exact two-call production path located the fixture invoice and created the credit note
- Credit note returned `isCreditNote=true`, `creditedInvoice=<original id>`, `amountExcludingVatCurrency=-41600`
- Confirmed: no follow-up read needed

## 6. Playbook Changes

Updated existing files (no new files created):
- `./trusted-standards/create-customer-invoice-credit-note.md` — added `organizationNumber=962467210`, `description="Nettverkstjeneste"`, `amountExcludingVatCurrency=41600` as a confirmed production prompt shape, plus sandbox verification entry
- `./task-playbooks/create-customer-invoice-credit-note.md` — added 11th production run confirmation for the same prompt shape, plus sandbox re-verification note

No AGENTS.md changes needed (the credit note task type is already correctly mapped).

## 7. Commit

Changes were committed as part of a concurrent batch commit:
- **Commit:** `a1dcbfcc`
- **Message:** `tripletex playbook: register-customer-invoice-payment — add 12th production confirmation (28176e03, English prompt, Clearwater Ltd / 924324104 / Cloud Storage / 44750 ex-VAT / 55937.5 outstanding, 3 calls 0 errors); payment type 28358423`

The Nettverkstjeneste entries in both the trusted standard and playbook were included in this commit by the concurrent reflection pipeline.

## 8. Reusable Heuristics

1. **Credit note is the most stable task shape in the system.** This is the 11th+ consecutive production success with the same two-call path. No deviations have ever been needed for any prompt variation (Norwegian, German, French, English descriptions; amounts from 8050 to 45300).

2. **The two-call floor is absolute for this prompt shape.** Without an exact invoice ID in the prompt, 2 calls is the minimum: one locate read + one credit note write. Do not try to improve below 2.

3. **Always filter out `isCreditNote=true` and `isCredited=true` in the locate step.** This prevents matching already-credited invoices or credit notes themselves.

4. **Check both `orderLines[].description` and `orders[].orderLines[].description`.** The same description appears in both arrays — this is normal duplication, not ambiguity. Deduplicate at the invoice level.

5. **Always set `sendToCustomer=false` explicitly.** The default is sending-enabled and can trigger unintended dispatch.

6. **Trust the write response.** When `isCreditNote=true` and `creditedInvoice=<original id>` are present, the job is done. No follow-up GET needed.
