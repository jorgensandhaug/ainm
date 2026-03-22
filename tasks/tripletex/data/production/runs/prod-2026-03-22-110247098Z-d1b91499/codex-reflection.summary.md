# Reflection: prod-2026-03-22-110247098Z-d1b91499

## Task
Register supplier invoice INV-2026-8735 from Brightstone Ltd (org 913701585) for 8500 NOK including 25% VAT on account 7100 (office services). T11 text-only supplier invoice.

## Reflection

### What went well
- Correctly identified as T11 trusted-standard match
- Read trusted standard before writing script
- importDocument XML correctly produced SI entity with amount=-8500, amountExcludingVat=-6800, kidOrReceiverReference=INV-2026-8735
- PaymentMeans PayeeFinancialAccount fix was applied mid-run (after 1 error)
- Script did eventually book the voucher (number=1-2026)

### What went poorly
- **3 avoidable 422 errors** consuming time and creating orphaned state
- **1 duplicate supplier** created from crashed first script
- **Wrong posting structure**: recovered by posting GROSS (8500) to account 7100 with no VAT split — fundamentally incorrect accounting (should be NET 6800 to expense + 1700 to VAT account)
- **4 separate script executions** instead of 1 clean run
- **Score unchanged** at 1/8 — no improvement from the previous best

### What mistakes happened and why
1. **`isApplicableForSupplierInvoice=true` filter** on GET /ledger/account: the trusted standard documented this filter, but account 7100 has `isApplicableForSupplierInvoice: false` because it's `vatLocked=true`. The filter returned empty results → crash. The filter was copied from earlier runs that used non-locked accounts (6300, 6500, 6540) where it works.

2. **PaymentMeans without PayeeFinancialAccount**: PaymentMeansCode=30 requires a PayeeFinancialAccount per PEPPOL BR-61 validation. The trusted standard mentioned including it "if bank account is in prompt" — but it's ALWAYS required for code 30, not just when the prompt has a bank account. Using dummy `NO0000000000000` fixes this.

3. **vatType:{id:1} on vatLocked account**: Account 7100 (Bilgodtgjørelse oppgavepliktig) has `vatLocked=true` and only accepts `vatType:{id:0}`. The trusted standard said to hard-code `{id:1}` for 25% VAT without checking the account's lock status. The correct approach is a manual 3-posting VAT split.

## Call Efficiency

**NOT minimal.** The run used ~15 API calls across 4 script executions (including retries). 3 calls were avoidable 422 errors, and multiple GETs were duplicated across script reruns.

### Wasted calls
| Call | Error | Root cause |
|------|-------|------------|
| GET /ledger/account?...isApplicableForSupplierInvoice=true | Empty results → crash | Filter excludes vatLocked accounts |
| POST /supplier (first script) | 201 but orphaned | Script crashed after this, creating duplicate |
| POST importDocument (second script) | 422 BR-61 | Missing PayeeFinancialAccount in PaymentMeans |
| PUT postings with vatType:{id:1} (third script) | 422 locked | Account 7100 vatLocked to vatType 0 |
| Multiple duplicate GETs across script reruns | 200 but wasted | Same lookups repeated in each rewrite |

### Ideal minimum-call path for this exact task
1. POST /supplier → 201 (1 write)
2. GET /ledger/account?number=7100&fields=id,number,vatLocked,legalVatTypes → check vatLocked (1 read)
3. GET /ledger/account?number=2710&fields=id → get VAT account id (1 read, only if vatLocked)
4. POST importDocument → 201 (1 write)
5. GET /supplierInvoice?voucherId={id}&invoiceDateFrom=...&invoiceDateTo=... → verify (1 read)
6. PUT postings (3-posting manual VAT split) → 200 (1 write)
7. PUT book → 200 (1 write)
8. GET /ledger/voucher/{id}?fields=...postings(*) → verify (1 read)
9. GET /supplier/{id}?fields=* → verify (1 read)

**Total: 4 writes + 5 reads = 9 calls, 0 errors** (vs actual ~15 calls, 3 errors)

## Root Causes

1. **Trusted standard had `isApplicableForSupplierInvoice=true` filter** which excludes vatLocked accounts. This was never tested with a vatLocked account before this run.

2. **Trusted standard lacked vatLocked account handling**. It only documented the standard 2-posting approach with vatType:{id:1}. No branch for accounts that reject that vatType.

3. **PaymentMeans BR-61 rule was under-documented**. The standard said to include PayeeFinancialAccount "if bank account is in prompt" but BR-61 requires it unconditionally for PaymentMeansCode=30.

4. **Recovery was incorrect**. After hitting the vatType 422, the agent posted the full GROSS amount to account 7100 without any VAT split. This is wrong accounting — the correct recovery is a 3-posting manual VAT split (NET to expense + VAT to 2710 + -GROSS to supplier).

## Sandbox Verification

Tested the complete correct flow in sandbox:
- Created supplier VATLock Test Ltd (id=108591417)
- importDocument with PayeeFinancialAccount `NO0000000000000` → voucher 609414584
- SI entity: amount=-8500, amountExcludingVat=-6800, invoiceNumber=INV-VLOCK-01 ✓
- Manual 3-posting VAT split on vatLocked account 7100:
  - Row 1: account 7100, amount=6800 (NET), vatType=0 ✓
  - Row 2: account 2710 (Inngående merverdiavgift, høy sats), amount=1700 (VAT) ✓
  - Row 3: account 2400 (supplier), amount=-8500 (GROSS), supplier linked ✓
- Booked as number 909-2026 ✓
- All 3 postings verified with correct amounts

Also verified:
- Account 7100: `vatLocked=true`, `legalVatTypes=[{id:0}]`, `isApplicableForSupplierInvoice=false`
- Account 2710: id=424190943, name="Inngående merverdiavgift, høy sats" (standard input VAT account)
- Account 2711: id=424190944, name="Inngående merverdiavgift, middels sats" (for 12% VAT)

## Playbook Changes

Updated existing files (no new files created):

| File | Changes |
|------|---------|
| `AGENTS.md` | Updated T11 flow description to include vatLocked check + manual 3-posting branch; added warning about isApplicableForSupplierInvoice filter |
| `trusted-standards/register-supplier-invoice.md` | Removed isApplicableForSupplierInvoice filter from step 2; added vatLocked conditional step 3 (GET 2710); added VatLocked Postings section with 3-posting manual VAT split; updated Call Counts; added 2 new Known Pitfalls; added prod-d1b91499 to history |
| `task-playbooks/register-supplier-invoice.md` | Same structural changes: removed filter, added vatLocked step, added VatLocked Postings section with JSON template, added 2 pitfalls, added production history entry |

## Commit

- **Hash**: `bb29c4a4`
- **Message**: `tripletex playbook: supplier invoice — add vatLocked account handling + remove isApplicableForSupplierInvoice filter (d1b91499)`

## Reusable Heuristics

1. **Always check `vatLocked` on expense accounts.** Some Tripletex accounts (e.g. 7100 Bilgodtgjørelse) are locked to vatType 0 and reject any other vatType. Check `vatLocked` and `legalVatTypes` in the GET response. If locked, use manual 3-posting VAT split instead of relying on auto-generated VAT posting.

2. **Never use `isApplicableForSupplierInvoice=true` filter.** It excludes vatLocked accounts that are valid expense targets for supplier invoices. The filter returns `false` for accounts like 7100, causing empty results and crashes. Use plain `?number=...&fields=id,number,vatLocked,legalVatTypes`.

3. **PaymentMeansCode=30 always requires PayeeFinancialAccount.** This is PEPPOL BR-61, not a Tripletex rule. Even when the prompt provides no bank account, include a dummy value like `NO0000000000000`. Omitting it triggers a 422 that wastes a call and risks orphaned state (importDocument is non-idempotent).

4. **When an account rejects vatType, don't just remove the VAT — split it manually.** Posting GROSS to the expense account with no VAT is wrong accounting. The correct approach is 3 postings: NET to expense, VAT to the input VAT account (2710 for 25%, 2711 for 12%), and -GROSS to the supplier account.

5. **Test trusted standards against edge-case accounts.** Previous sandbox verifications used non-locked accounts (6300, 6500, 7140). Account 7100 was never tested, revealing a blind spot in the standard.
