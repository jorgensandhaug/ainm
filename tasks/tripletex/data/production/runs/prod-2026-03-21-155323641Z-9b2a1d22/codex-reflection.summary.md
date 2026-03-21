# Post-Run Reflection: prod-2026-03-21-155323641Z-9b2a1d22

## Task
Register supplier invoice from PDF attachment in Tripletex. Supplier: Bergvik AS (919398051), invoice INV-2026-8506, net 41050, VAT 25% (10262), gross 51312, expense account 6500. Address: Sjøgata 2, 4611 Kristiansand. Bank account: 58637944698.

## Reflection
The run executed flawlessly. It:
- Correctly identified the task as an exact match for `trusted-standards/register-supplier-invoice.md`
- Read the PDF and extracted all data (name, org nr, address, bank account, invoice details)
- Followed the trusted standard's 5-call path exactly
- Correctly used `values[0]` for importDocument response (avoiding a known pitfall)
- Correctly set explicit `row: 1` and `row: 2` on PUT postings
- Included `postalAddress` and `bankAccountPresentation` in the supplier create (learning from the Fjelltopp AS 7/10 score)
- Did not waste time reading AGENTS.md, openapi.json, or other documentation beyond the trusted standard

The only observation is a VAT rounding effect: PDF says net=41050, but Tripletex recalculated net=41049.6 from gross=51312 (51312/1.25). This is unavoidable Tripletex behavior.

## Call Efficiency
**The run was minimal-call.** 5 API calls, 0 errors — matches the canonical optimal path exactly.

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | POST /supplier | 201 | Create supplier with address + bank |
| 2 | GET /ledger/account?number=6500&isApplicableForSupplierInvoice=true&fields=* | 200 | Resolve expense account ID |
| 3 | GET /ledger/vatType?typeOfVat=INCOMING&vatDate=2026-02-01&fields=* | 200 | Resolve incoming VAT type ID |
| 4 | POST /ledger/voucher/importDocument | 201 | Import EHF XML to create supplier invoice |
| 5 | PUT /ledger/voucher/609017332?sendToLedger=false | 200 | Set correct postings with VAT |

**Wasted calls:** None.

**Lower-call path:** None possible. 5 calls is the proven minimum for this task shape (create supplier + register invoice).

## Root Causes
No errors or mistakes in this run. The agent correctly followed the trusted standard without deviation.

The only potential scoring risk is the VAT rounding: PDF net=41050 vs Tripletex-stored net=41049.6. This is a Tripletex system behavior (it recalculates net from gross/1.25) and cannot be avoided or controlled by the agent.

## Sandbox Verification
Verified the VAT rounding behavior in persistent sandbox:
- Sent amount=41050, amountGross=51312 with vatType 25%
- Tripletex stored amount=41049.6, amountGross=51312, system VAT=10262.4
- Confirms: Tripletex always recalculates net from gross regardless of the sent amount value
- This is consistent across sandbox and production

## Playbook Changes
Updated existing files only (no new files created):

1. **`trusted-standards/register-supplier-invoice.md`**:
   - Added "VAT Rounding" section documenting Tripletex's gross-to-net recalculation behavior
   - Added known pitfall about non-reconciling PDF amounts
   - Added production proof for Bergvik AS / 919398051 / INV-2026-8506 (5 calls, 0 errors)

2. **`task-playbooks/register-supplier-invoice.md`**:
   - Added "VAT rounding on non-reconciling PDF amounts" subsection under Critical Implementation Details

## Commit
- Hash: `8ff44c73`
- Message: `tripletex playbook: document VAT rounding behavior and add Bergvik AS production proof for register-supplier-invoice`

## Reusable Heuristics
1. **Follow the trusted standard directly for exact matches.** This run proved the optimal outcome: read the trusted standard, extract PDF data, write and execute the script immediately. No time wasted on openapi.json or other documentation.
2. **Always include supplier address and bank account from PDF.** The Fjelltopp AS run scored 7/10 without them; this run included both in the same POST /supplier call at zero extra cost.
3. **VAT rounding is unavoidable.** When PDF amounts don't perfectly reconcile (net × 1.25 ≠ gross), Tripletex recalculates net = gross / 1.25. The agent cannot control this. Send the PDF gross as `amountGross` and let Tripletex compute the rest.
4. **The 5-call path is proven optimal.** POST supplier → GET account → GET vatType → POST importDocument → PUT voucher. No shortcuts exist.
5. **importDocument returns `values[0]`, not `value`.** This has been the #1 source of wasted calls in prior runs. Always access as list wrapper.
6. **Explicit `row` values are mandatory on PUT postings.** row=1 for debit, row=2 for supplier liability. Omitting them causes 422.
