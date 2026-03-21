# Score-Aware Reflection: prod-2026-03-21-220742468Z-60403779

## 1. Task Attribution

- **Task shape**: Register supplier invoice (French prompt with PDF attachment)
- **Supplier**: Forêt SARL / 823356366
- **Invoice**: INV-2026-6107, gross 80437, account 6340, 25% VAT
- **PDF data**: address Solveien 51, 9008 Tromsø; bank 68474635604
- **Attribution status**: `ambiguous` — 4 leaderboard entries changed during the run window (T10, T12, T20, T22), each with `attempt_delta=1`
- **Most likely task**: Cannot be definitively attributed. The 3 submissions closest to the run's `task_complete_timestamp` (22:10:58Z) were still `processing` at snapshot time (22:11:28Z). The completed submissions in the window (T10 at 22:09:41, T12 at 22:08:47, T22 at 22:09:11) all completed before our run finished, suggesting they belong to concurrent runs. T20 (last_attempt 22:11:00) is closest to our completion time but its completed submission (`6633c1b2`, 8/10 raw, 1/6 checks failed, normalized=2.4) was queued at 22:07:31 — before our run started.
- **Tier**: If T10 or T12 → T2 (max 4). If T20 or T22 → T3 (max 6).

## 2. Correctness Verdict

**Cannot definitively determine** — submission was still processing at snapshot time.

**Expected outcome based on run mechanics**: Correctness should be **perfect (1.0)**.
- Supplier created with all PDF fields: name, orgNumber, postalAddress (Solveien 51, 9008, Tromsø), bankAccountPresentation (68474635604)
- Voucher imported via EHF/UBL XML with correct invoice data
- Postings set correctly: expense account 6340 with vatType.id=1, supplier liability posting with invoiceNumber and termOfPayment
- Voucher booked (number=1, sendToLedger=true)
- Description "Programvarelisens" preserved with exact casing from PDF

All prior production runs with this exact same flow pattern and correct final state scored 5/5 checks or better on correctness. The run's final Tripletex state matches every known scored field.

## 3. Efficiency Verdict

**Suboptimal**. 7 API calls with 2 errors vs. optimal 5 calls with 0 errors.

| Call | Endpoint | Status | Verdict |
|------|----------|--------|---------|
| 1 | POST /supplier | 201 | Required |
| 2 | GET /ledger/account?number=6340 | 200 | Required |
| 3 | POST /ledger/voucher/importDocument | 400 | **WASTED** — Content-Type header set manually on FormData body |
| 4 | POST /ledger/voucher/importDocument | 422 | **WASTED** — buyer EndpointID `000000000` failed PEPPOL mod11 |
| 5 | POST /ledger/voucher/importDocument | 201 | Required (should have been call 3) |
| 6 | PUT /ledger/voucher/{id}?sendToLedger=false | 200 | Required |
| 7 | PUT /ledger/voucher/{id}?sendToLedger=true | 200 | Required |

**Wasted calls**: 2 (calls 3 and 4)
**Wasted errors**: 2 (400 + 422)

**Optimal 5-call path** (proven in 8+ consecutive production runs):
1. POST /supplier (with address + bank)
2. GET /ledger/account?number=6340&isApplicableForSupplierInvoice=true&fields=*
3. POST /ledger/voucher/importDocument (FormData without manual Content-Type, buyer EndpointID=123456785)
4. PUT /ledger/voucher/{id}?sendToLedger=false (postings with row:1/row:2, vatType:{id:1})
5. PUT /ledger/voucher/{id}?sendToLedger=true ({version} only)

**Score impact**: If correctness=1.0, the efficiency penalty from 7 calls + 2 errors vs 5 calls + 0 errors likely reduces normalized_score from max (e.g., 4 for T2) to ~3 or lower.

## 4. Likely Root Cause

Two independent coding mistakes, neither related to Tripletex API knowledge:

### Bug 1: FormData Content-Type (call 3 → 400)
The initial script's `api()` function had a `contentType` parameter path that set `Content-Type` manually even for FormData. When FormData is the body, `fetch` must auto-set `Content-Type: multipart/form-data; boundary=...` — manually setting any Content-Type causes the server to reject the request as `415 Unsupported Media Type`.

**Why this happened**: The `api()` helper was written with a generic `contentType` override parameter but the FormData path wasn't correctly handled. The function accepted `FormData` but the conditional logic still set a Content-Type header.

### Bug 2: Buyer EndpointID `000000000` (call 4 → 422)
The XML template used `000000000` as the buyer's EndpointID. While `000000000` technically passes mod11 arithmetic (0 mod 11 = 0, check digit = 11 → 0), PEPPOL-COMMON-R041 validation rejects it (likely because it's not a real org number format).

**Why this happened**: The trusted standard at the time documented that "the XML org number in `EndpointID` and `CompanyID` must pass PEPPOL mod11 validation" but this was only understood as applying to the supplier's org number. The buyer EndpointID wasn't explicitly called out. Previous successful runs likely used a valid buyer EndpointID by coincidence (the playbook template uses `999999999` which passes), but this agent chose `000000000` independently.

## 5. What Went Right

1. **Correct task identification**: Immediately recognized as a register-supplier-invoice trusted standard match
2. **PDF data extraction**: All scored fields extracted correctly — supplier name (with Unicode ê), orgNumber, address, bank account, invoice details, description
3. **Trusted standard followed**: Read the trusted standard before writing the script
4. **Supplier creation with all PDF fields**: postalAddress and bankAccountPresentation included in same POST (0 extra calls)
5. **Hard-coded vatType.id=1**: Skipped unnecessary GET /ledger/vatType
6. **Correct importDocument response handling**: Used `values[0]` not `value`
7. **Correct PUT postings**: row:1 and row:2, all currency amounts, correct signs
8. **Two-step booking**: sendToLedger=false then sendToLedger=true with version-only
9. **Voucher booked**: number=1 confirmed
10. **Description casing**: "Programvarelisens" preserved exactly from PDF
11. **Quick recovery**: Both bugs were identified and fixed within the 300s budget

## 6. What To Change Next Time

### Immediate fixes (already applied to trusted standard and playbook):

1. **Buyer EndpointID**: Always use `123456785` (or `999999999`) as the buyer EndpointID constant in the XML. Never use `000000000`. The trusted standard now documents this explicitly and the playbook includes the pitfall.

2. **FormData Content-Type**: The `api()` helper must detect `body instanceof FormData` and NOT set any Content-Type header in that case. This is now documented as a known pitfall in both the trusted standard and playbook.

### Script template improvement:
The agent should have a well-tested `api()` function template that handles FormData correctly from the start. The function should branch on `body instanceof FormData` before setting headers:
```typescript
if (body instanceof FormData) {
  opts.body = body;
  // Do NOT set Content-Type — let fetch set boundary
} else if (body) {
  opts.headers["Content-Type"] = "application/json";
  opts.body = JSON.stringify(body);
}
```

### Call count target:
For register-supplier-invoice with 25% VAT on fresh account: **5 calls, 0 errors** is the proven optimal. Any deviation signals a bug in the script, not a limitation of the API path.
