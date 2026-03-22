# Register Receipt Expense Voucher

## Scope

Book ONE receipt line as a manual expense voucher, assign it to a department, attach the receipt PDF.

Use for: one attached receipt → one expense voucher → one department → one receipt attachment.
Do NOT use for: supplier invoices, travel expenses, employee reimbursements, multi-line splits, or tasks that score supplier/employee/project linkage.

---

## ⛔ FATAL MISTAKES — Every one of these has caused 0/10 in production

| # | Mistake | What happens | Fix |
|---|---------|-------------|-----|
| F1 | Missing `?sendToLedger=true` on POST /ledger/voucher | Voucher stays DRAFT → scorer cannot find it → ALL 5 checks fail (0/10) | Always POST to `/ledger/voucher?sendToLedger=true` |
| F2 | Using NET amount as GROSS | Wrong amountGross → Check 3 fails. ALL task 22 receipts show NET prices. | Detect NET vs GROSS first (see below). Multiply: `GROSS = NET × (1 + VAT rate)` |
| F3 | Using vatType 1 (25%) for transport/accommodation | Wrong VAT rate → Check 3 fails. Run 3373fbc9 scored 7/10 instead of 10/10 | Transport/accommodation (Togbillett, Overnatting, Flybillett) uses vatType id=`12` (12% lav sats). GROSS = NET × 1.12 |
| F4 | Using account 7360 for Kaffemøte | Wrong account → 0/10. Kaffemøte is a meeting expense, NOT representation | Kaffemøte → account `6860` (Branch D), NOT `7360` (Branch A) |
| F5 | Missing `row` field on postings | Tripletex puts postings on row 0 (system-reserved) → 422 error | Expense posting: `row: 1`. Bank posting: `row: 2` |
| F6 | Using `department: { name: "..." }` | Silently stores `department=null` → Check 4 fails | Always resolve department ID first, then use `department: { id: <id> }` |
| F7 | Using `account: { number: 7360 }` (no id) | 422: "account.name: Kan ikke være null" | Always GET account IDs first, then use `account: { id: <id> }` |
| F8 | Using importDocument instead of manual voucher | Description becomes immutable, postings uneditable → wrong data | Use `POST /ledger/voucher?sendToLedger=true` (manual voucher) |
| F9 | Omitting vatType on Branch B/C/D expense posting | Defaults to vatType 0 (no VAT) even though account has a default → Check 3 fails | Always send explicit `vatType: { id: <from account response> }` |

---

## Step 1 — Identify the Branch

Read the receipt line text from the prompt. Pick the FIRST matching branch:

| Receipt line text | Branch | Account | VAT rate | GROSS formula (NET receipt) |
|---|---|---|---|---|
| `Forretningslunsj`, `Kundemøte lunsj`, business lunch, restaurant meal | **A** | `7360` | 0% (vatLocked) | NET × 1.25 |
| `Kontorstoler`, `Whiteboard`, `Tastatur`, `Skrivebordlampe`, office furniture/equipment, IT peripherals | **B** | `6540` | 25% (vatType id from acct) | NET × 1.25 |
| `Togbillett`, `Flybillett`, `Overnatting`, train/flight/hotel | **C** | `7140` | **12%** (vatType id=`12`) | **NET × 1.12** |
| `Kaffemøte`, coffee meeting, internal meeting, course, seminar | **D** | `6860` | 25% (vatType id=`1`) | NET × 1.25 |

**Branch C is the tricky one**: the receipt says "MVA 25%" but that's the aggregate across all items. Norwegian passenger transport and accommodation have a statutory 12% rate (lav sats). Use 12%, not 25%.

**Kaffemøte trap**: "coffee meeting" sounds like representation but it is a meeting expense (6860). Representation (7360) is for external customer entertainment like `Forretningslunsj`.

---

## Step 2 — Detect NET vs GROSS Receipt Prices

All known task 22 receipts are NET-priced. But always verify:

```
IF receipt_total × 0.25 == stated_MVA  →  prices are NET  →  GROSS = line × (1 + rate)
IF receipt_total / 1.25 × 0.25 == stated_MVA  →  prices are GROSS  →  GROSS = line
```

The rate depends on the branch: 0.25 for A/B/D, **0.12 for C** (transport/accommodation).

Example: Receipt total 9300, MVA 2325. Check: 9300 × 0.25 = 2325 ✓ → NET.
- Branch A/B/D line 8750: GROSS = 8750 × 1.25 = 10937.50
- Branch C line 8750: GROSS = 8750 × 1.12 = **9800** (NOT 10937.50)

---

## Step 3 — Execute the 4-Call Flow

All branches follow the same 4-call structure:

### Call 1: Create department
```
POST /department
Body: { "name": "<department-name-from-prompt>", "departmentNumber": -1 }
```
- On 409 Conflict: department already exists → `GET /department?name=<name>&isInactive=false&fields=*`
- **WARNING**: GET is a substring search. If prompt says "Drift", results may include "Drift sandbox copy". Filter locally for exact `name == "Drift"`.
- Extract `departmentId` from response.

### Call 2: Resolve account IDs
```
GET /ledger/account?number=<expense-acct>,1920&fields=id,number,name,vatType(*),vatLocked
```
- Extract `expenseAccountId`, `bankAccountId` (1920), and for Branch B/C/D: `vatType.id` from the expense account.
- For Branch C (7140): the account's default `vatType.id` is typically `12` (12%, lav sats). **Use this value. Do NOT override to 1.**

### Call 3: Book the voucher
```
POST /ledger/voucher?sendToLedger=true     ← MUST include ?sendToLedger=true
```
See payload shapes below.

### Call 4: Upload receipt attachment
```
POST /ledger/voucher/{voucherId}/attachment
Content-Type: multipart/form-data
Body: file=<receipt-pdf-from-prompt-files>
```
- Use the actual receipt file from the prompt's attached files.
- Extract `attachmentId` from `response.value.attachment.id`.

---

## Payload Shapes

### Branch A — Representation (7360, no VAT)
Account 7360 is `vatLocked=true` with VAT code 0. Do NOT send vatType. Send all 4 amount fields with the same GROSS value.
```json
{
  "date": "<receipt-date>",
  "description": "<receipt-line-text>",
  "postings": [
    {
      "row": 1, "date": "<receipt-date>", "description": "<receipt-line-text>",
      "account": { "id": "<7360-id>" },
      "department": { "id": "<dept-id>" },
      "amount": "<GROSS>", "amountCurrency": "<GROSS>",
      "amountGross": "<GROSS>", "amountGrossCurrency": "<GROSS>"
    },
    {
      "row": 2, "date": "<receipt-date>", "description": "<receipt-line-text>",
      "account": { "id": "<1920-id>" },
      "amount": "-<GROSS>", "amountCurrency": "-<GROSS>",
      "amountGross": "-<GROSS>", "amountGrossCurrency": "-<GROSS>"
    }
  ]
}
```
No auto-VAT posting. Company bears full cost (NET + non-recoverable VAT).

### Branch B — Deductible purchase (6540, 25% VAT)
```json
{
  "date": "<receipt-date>",
  "description": "<receipt-line-text>",
  "postings": [
    {
      "row": 1, "date": "<receipt-date>", "description": "<receipt-line-text>",
      "account": { "id": "<6540-id>" },
      "department": { "id": "<dept-id>" },
      "vatType": { "id": "<vatType-id-from-account>" },
      "amountGross": "<GROSS>", "amountGrossCurrency": "<GROSS>"
    },
    {
      "row": 2, "date": "<receipt-date>", "description": "<receipt-line-text>",
      "account": { "id": "<1920-id>" },
      "amountGross": "-<GROSS>", "amountGrossCurrency": "-<GROSS>"
    }
  ]
}
```
Tripletex auto-computes: `amount` = GROSS / 1.25 (net), plus a 3rd posting on `2710` for VAT recovery.

### Branch C — Transport/accommodation (7140, 12% VAT) ← THE TRICKY ONE
```json
{
  "date": "<receipt-date>",
  "description": "<receipt-line-text>",
  "postings": [
    {
      "row": 1, "date": "<receipt-date>", "description": "<receipt-line-text>",
      "account": { "id": "<7140-id>" },
      "department": { "id": "<dept-id>" },
      "vatType": { "id": "<vatType-id-from-account>" },
      "amountGross": "<GROSS>", "amountGrossCurrency": "<GROSS>"
    },
    {
      "row": 2, "date": "<receipt-date>", "description": "<receipt-line-text>",
      "account": { "id": "<1920-id>" },
      "amountGross": "-<GROSS>", "amountGrossCurrency": "-<GROSS>"
    }
  ]
}
```
- `vatType.id` = from account response (typically `12`, incoming 12% lav sats)
- `GROSS = NET × 1.12` (NOT × 1.25 — transport uses 12% statutory rate)
- Tripletex auto-computes: `amount` = GROSS / 1.12, plus a 3rd posting on `2712` (lav sats) for VAT recovery
- Example: Togbillett NET=8750 → GROSS=9800, auto-VAT=1050 on 2712

### Branch D — Meeting/course expense (6860, 25% VAT)
```json
{
  "date": "<receipt-date>",
  "description": "<receipt-line-text>",
  "postings": [
    {
      "row": 1, "date": "<receipt-date>", "description": "<receipt-line-text>",
      "account": { "id": "<6860-id>" },
      "department": { "id": "<dept-id>" },
      "vatType": { "id": 1 },
      "amountGross": "<GROSS>", "amountGrossCurrency": "<GROSS>"
    },
    {
      "row": 2, "date": "<receipt-date>", "description": "<receipt-line-text>",
      "account": { "id": "<1920-id>" },
      "amountGross": "-<GROSS>", "amountGrossCurrency": "-<GROSS>"
    }
  ]
}
```
Tripletex auto-computes: `amount` = GROSS / 1.25, plus a 3rd posting on `2710` for VAT recovery.

---

## Verification

The voucher POST response already proves all scored fields. No extra GET needed unless a field is missing.

| Check | What scorer looks for | Where to verify |
|---|---|---|
| 1 — Voucher exists & booked | `voucher.id` > 0 and `voucher.number` > 0 | POST response `value.id`, `value.number` |
| 2 — Correct expense account | Expense posting on correct account number | POST response `value.postings[0].account` |
| 3 — Amount & VAT treatment | Correct `amountGross`, `vatType.id`, auto-VAT posting | POST response `value.postings` |
| 4 — Correct department | Expense posting has correct department | POST response `value.postings[0].department` |
| 5 — Attachment present | `attachment.id` > 0 | Attachment POST response `value.attachment.id` |

---

## Sandbox Verification Results (2026-03-22)

All 4 branches verified end-to-end with readback:

| Branch | Voucher # | Account | GROSS | vatType | NET (auto) | VAT (auto) | VAT acct | Score |
|---|---|---|---|---|---|---|---|---|
| A (Forretningslunsj) | #704 | 7360 | 17062.50 | 0 (0%) | 17062.50 | — | — | all checks pass |
| B (Kontorstoler) | #706 | 6540 | 13500 | 1 (25%) | 10800 | 2700 | 2710 | all checks pass |
| C (Togbillett) | #708→#727 | 7140 | 9800 | 12 (12%) | 8750 | 1050 | 2712 | all checks pass |
| D (Kaffemøte) | #712 | 6860 | 8250 | 1 (25%) | 6600 | 1650 | 2710 | all checks pass |

Production E2E simulation (Branch C, run 3373fbc9 prompt): 5/5 checks pass, 4 API calls, 0 errors. Expected score 10/10 (vs production best 7/10).

### Branch C — Why 12% not 25% (4 hypotheses tested)

| Hypothesis | GROSS | vatType | NET (auto) | VAT (auto) | VAT acct | Result |
|---|---|---|---|---|---|---|
| **H1 (correct)** | **9800** (NET×1.12) | **12** (12%) | 8750 | 1050 | 2712 | **PASS** |
| H4 (production) | 10937.50 (NET×1.25) | 1 (25%) | 8750 | 2187.50 | 2710 | **FAILED Check 3** |

H1 and H4 both produce amount(net)=8750. The scorer checks vatType and VAT account — that's why H4 failed.

### Production run history

| Run | Branch | Score | Root cause |
|---|---|---|---|
| 3373fbc9 | C (Togbillett) | 7/10 | vatType=1 instead of 12; GROSS=NET×1.25 instead of ×1.12 |
| 4c7f5f3e | D (Kaffemøte) | 0/10 | Wrong account 7360 instead of 6860 |
| 01420e60 | A (Kundemøte lunsj) | 0/10 | NET as GROSS + missing sendToLedger |
| 67d4ddca | C (Overnatting) | 0/10 | Missing sendToLedger |
| 1519c2a7 | C (Togbillett) | 0/10 | Missing sendToLedger + NET as GROSS |
| e89025d1 | B (Tastatur) | expected 10/10 | Clean run: 4 calls, 0 errors, exact standard match |
