# Reflection: prod-2026-03-22-050054205Z-4c255d98

## 1. Task

Register a supplier invoice from PDF in Tripletex (T20 task shape). Portuguese prompt: "Voce recebeu uma fatura de fornecedor (ver PDF anexo)."

PDF data:
- Supplier: Rio Azul Lda, org 834732092, Parkveien 1, 0182 Oslo
- Invoice: INV-2026-6669, date 2026-04-29, due 2026-05-29
- Description: IT-konsulenttjenester
- Net: 22050, VAT 25%: 5512, Gross: 27562
- Account: 6300, Bank: 11287374218

## 2. Reflection

**What went well:** Nothing. The agent made 0 API calls and scored 0/10.

**What went poorly:** The agent read the PDF and the trusted standard but then output "No response requested" and stopped. It never wrote or executed a TypeScript script. This is a total execution failure.

**Root cause of failure:** The agent appears to have treated the initial task prompt as context/system information rather than an instruction requiring execution. When the conversation resumed with "Continue from where you left off," the agent had no prior work to continue and gave up.

**What the correct approach should have been:**
1. Read the PDF → extract supplier name, org, address, bank, invoice number, dates, amounts, account
2. Read the trusted standard `register-supplier-invoice-from-pdf.md`
3. Immediately write a TypeScript script implementing the 5-call flow
4. Execute it with `bun run`

The 5-call flow:
1. `POST /supplier` (with postalAddress + physicalAddress + country + bankAccountPresentation)
2. `GET /ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*`
3. `POST /ledger/voucher/importDocument` (EHF/UBL XML)
4. `PUT /ledger/voucher/{id}?sendToLedger=false` (set postings)
5. `PUT /ledger/voucher/{id}?sendToLedger=true` (book with voucherType Leverandørfaktura)

## 3. Call Efficiency

**Was the run minimal-call?** N/A — the run made 0 API calls. The expected minimal path is 5 calls for 25% VAT.

**Wasted calls:** None (no calls were made at all — which is worse).

**Can the 5-call path be reduced?** No. Sandbox-verified:
- `account: { number: 6300 }` in postings → 422 "account.name Kan ikke være null" — only `account: { id }` works, so `GET /ledger/account` is mandatory
- importDocument + two-step PUT (postings then book) is the minimum required sequence
- `POST /supplier` is required for new supplier creation

**Exact lower-call path for next agent (5 calls):**
1. `POST /supplier` → get supplier.id + supplier.ledgerAccount.id (account 2400)
2. `GET /ledger/account?number={acct}&isApplicableForSupplierInvoice=true&fields=*` → get expense account id
3. `POST /ledger/voucher/importDocument` (FormData with EHF XML) → get values[0].id + values[0].version
4. `PUT /ledger/voucher/{id}?sendToLedger=false` (postings with row 1 expense + row 2 supplier) → get value.version
5. `PUT /ledger/voucher/{id}?sendToLedger=true` (voucherType: Leverandørfaktura) → booked

## 4. Root Causes

1. **Agent execution failure (PRIMARY):** The agent read the trusted standard but never progressed to writing a script. It output "No response requested" — a complete misunderstanding of the task.
2. **Portuguese prompt not in match patterns:** The AGENTS.md and playbook scope sections did not include Portuguese variants ("PDF anexo", "fatura de fornecedor"). While the trusted standard said "or equivalent in any language," explicit Portuguese variants improve pattern matching reliability.

## 5. Sandbox Verification

Full E2E verified in sandbox (2026-03-22):
- Supplier created with postalAddress + physicalAddress + country:{id:161} + bankAccountPresentation
- importDocument created voucher 609324806 + supplierInvoice entity
- Postings set: expense 6300 net=22049.6 (Tripletex recomputes from gross/1.25) gross=27562 vatType=1; supplier -27562
- Voucher booked as number 775
- supplierInvoice verified: invoiceNumber correct, amount=-27562, amountExcludingVat=-22050, outstandingAmount=27562, orderLine description="IT-konsulenttjenester" vatType=1
- 5 API calls, 0 errors
- Also tested: `account: { number: 6300 }` → 422, confirming GET /ledger/account is mandatory

## 6. Playbook Changes

Updated existing files (no new files created):

| File | Change |
|---|---|
| `./trusted-standards/register-supplier-invoice-from-pdf.md` | Added Portuguese prompt variants to Exact Match section; added two new pitfalls: account:{number} 422 trap + read-then-execute-immediately warning |
| `./task-playbooks/register-supplier-invoice-from-pdf.md` | Added Portuguese "ver PDF anexo" to scope; added prod-4c255d98 run entry (0 calls, 0/10) |
| `./AGENTS.md` | Added Portuguese "PDF anexo" to trusted standard table + disambiguation section; added T20 flow line; added account:{number} and execution-failure warnings; clarified importDocument scope (supplier invoices only) |

## 7. Commit

- **Hash:** `c7a9d3d2`
- **Message:** `tripletex playbook: register-supplier-invoice-from-pdf — add Portuguese prompt variants and prod-4c255d98 run entry (Portuguese prompt, Rio Azul Lda / 834732092 / INV-2026-6669 / 22050+5512=27562 / 6300, 0 calls 0 errors scored 0/10); agent read trusted standard but failed to write/execute script...`

## 8. Reusable Heuristics

1. **Read the trusted standard, then IMMEDIATELY write and execute the script.** Do not read AGENTS.md, playbooks, openapi.json, or any other file afterward. Multiple production runs (including this one) scored 0 because the agent spent the entire budget reading and never executing.

2. **`account: { number: N }` does NOT work in Tripletex postings** — only `account: { id }` is accepted (422 with "account.name Kan ikke være null"). The `GET /ledger/account` call cannot be eliminated from the flow.

3. **importDocument response is `{ values: [...] }` not `{ value: {...} }`** — use `.values[0].id` and `.values[0].version`. This is the single most common crash-then-retry cause in supplier invoice runs.

4. **importDocument is NOT idempotent** — retrying creates duplicate supplierInvoice entities that cannot be deleted. The script MUST handle the response correctly on the first attempt.

5. **Supplier MUST have both `postalAddress` AND `physicalAddress` with `country: { id: 161 }`** — omitting physicalAddress fails Check 5 in every production run tested.

6. **Two PUTs are mandatory for booking** — combining postings + sendToLedger=true in one PUT → 422 "Bilag uten posteringer kan ikke bli sendt til hovedbok."

7. **Portuguese prompt patterns:** "recebeu uma fatura de fornecedor" + "ver PDF anexo" = T20 supplier invoice from PDF. Now in all match pattern lists.

8. **VAT rounding:** When PDF net × 1.25 ≠ PDF gross (e.g., 22050×1.25=27562.5 vs gross 27562), Tripletex recomputes net from gross/1.25. The supplierInvoice.amountExcludingVat uses the XML value; the voucher posting uses Tripletex's computed value. Both are acceptable.
