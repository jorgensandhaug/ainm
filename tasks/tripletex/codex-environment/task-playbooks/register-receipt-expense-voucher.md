# Register Receipt Expense Voucher

## Scope

Use for tasks like:
- register one manual expense voucher from one attached receipt
- book only one specific receipt line, not the whole receipt
- put the expense in one named department
- preserve the receipt as a voucher attachment
- use the correct expense account and VAT treatment based on the receipt line text

Three proven branches:
- **Branch A**: business-lunch / representation line (e.g., `Forretningslunsj`, `Kundemøte lunsj`) → account `7360`, no VAT deduction
- **Branch B**: office furniture / equipment / supplies line (e.g., `Kontorstoler`) → account `6540`, incoming 25% VAT deductible
- **Branch C**: travel / accommodation line (e.g., `Overnatting`, `Togbillett`) → account `7140`, incoming 25% VAT deductible

Do not use for:
- supplier-invoice tasks
- travel-expense or employee-reimbursement tasks
- prompts that need several receipt lines booked separately
- prompts that already provide an exact different expense account or VAT code
- prompts that score supplier, employee, project, or customer linkage

## Receipt Amount Interpretation — CRITICAL

**These receipts show NET prices (before VAT), not GROSS.**

Detection rule:
- Compute `total × 0.25`. If it matches the stated MVA → prices are **NET**. Use `GROSS = line_amount × 1.25`.
- Compute `total / 1.25 × 0.25`. If it matches the stated MVA → prices are **GROSS**. Use `GROSS = line_amount`.

All known task 22 receipts are NET:
- NSB: 11840 × 0.25 = 2960 ✓ (stated MVA = 2960)
- Thon Hotels: 5330 × 0.25 = 1332.50 ✓ (stated MVA = 1332.50)
- Peppes Pizza: 14380 × 0.25 = 3595 ✓ (stated MVA = 3595)

**All previous production runs scored 0/5 because the NET amount was used as the gross amount (wrong by factor 1.25).**

## Account Selection

| Receipt line text | Account | VAT treatment |
|---|---|---|
| `Forretningslunsj` / `Kundemøte lunsj` / business lunch / customer meeting lunch / restaurant meal | `7360` (non-deductible representation) | VAT code `0`, no deduction. Amount = GROSS (full cost incl. non-recoverable VAT) |
| `Kontorstoler` / office chairs / furniture / equipment | `6540` (Inventar) | Incoming 25% VAT (vatType id from account), fully deductible |
| `Overnatting` / hotel / accommodation | `7140` (Reisekostnad, ikke oppgavepliktig) | Incoming 25% VAT (`vatType: { id: 1 }`), fully deductible |
| `Togbillett` / train ticket / transport | `7140` (Reisekostnad, ikke oppgavepliktig) | Incoming 25% VAT (`vatType: { id: 1 }`), fully deductible |
| Office supplies / `Kontorrekvisita` | `6500` (if applicable) | Incoming 25% VAT, fully deductible |

- Do NOT use `7350` for representation; 2026-03-21 production scored `0/10` on that branch
- Do NOT use `7100` for train tickets; 7100 is "Bilgodtgjørelse oppgavepliktig" (car allowance), vatLocked=true, fails 422 with incoming VAT
- For Branch C: do NOT use account 7140's default vatType.id=`12` (incoming 12%) — use `vatType: { id: 1 }` (incoming 25%) because the receipt states 25% MVA

## Verified Findings

Verified in persistent sandbox on 2026-03-21 (CORRECTED tests with NET→GROSS conversion):

### Branch A (Kundemøte lunsj / representation) — CORRECTED
- NET line = 14050, GROSS = 14050 × 1.25 = **17562.50**
- `POST /ledger/voucher?sendToLedger=true` with amount=17562.50 on 7360, dept 951187
- Voucher #318 (booked): amount=17562.50, amountGross=17562.50, vatType.id=0
- Bank posting: -17562.50

### Branch B (Kontorstoler / deductible purchase)
- `GET /ledger/account?number=6540,1920&fields=id,number,name,vatType(*)`:
  - account `6540` "Inventar": `vatLocked=false`, default `vatType.id=1` (incoming 25%)
- No separate `GET /ledger/vatType` call needed
- `POST /ledger/voucher?sendToLedger=true` with `vatType: { id: 1 }`, `amountGross=<GROSS>`:
  - Tripletex auto-computes `amount` = GROSS / 1.25 (net)
  - Auto-generated 3rd posting on account `2710` with VAT recovery amount

### Branch C (Overnatting / travel-accommodation) — CORRECTED
- NET line = 4850, GROSS = 4850 × 1.25 = **6062.50**
- `POST /ledger/voucher?sendToLedger=true` with amountGross=6062.50, `vatType: { id: 1 }` (incoming 25%), account 7140
- Voucher #320 (booked):
  - expense posting: amount=4850 (net), amountGross=6062.50, vatType.id=1
  - bank posting: -6062.50
  - auto-VAT posting: amount=1212.50 (= 6062.50 × 0.2)
- Tripletex auto-computed net = 6062.50 / 1.25 = 4850 = original NET line amount ✓

### Branch C (Togbillett / train) — CORRECTED
- NET line = 11350, GROSS = 11350 × 1.25 = **14187.50**
- `POST /ledger/voucher?sendToLedger=true` with amountGross=14187.50, `vatType: { id: 1 }` (25%), account 7140
- Voucher #319 (booked):
  - expense posting: amount=11350 (net), amountGross=14187.50, vatType.id=1
  - auto-VAT: amount=2837.50

### Common findings
- `GET /department?name=Drift&isInactive=false&fields=*` is a containing search; local exact filtering mandatory
- `department: { "name": "Drift" }` on voucher postings silently persists `department=null`
- `POST /ledger/voucher/importDocument` creates uneditable voucher shell; not usable for this flow
- Account 7140's default vatType is 12% (statutory), but receipt says 25% — must override to vatType id=1

## Minimal Safe Flow

**4 API calls** for all branches on a fresh production account:

1. `POST /department` — create the target department
2. `GET /ledger/account?number=<expense-acct>,1920&fields=id,number,name,vatType(*)` — resolve account IDs (and for Branch B, extract vatType.id)
3. Detect NET vs GROSS: check `total × 0.25 == MVA` → NET. Compute `GROSS = line × 1.25` if NET.
4. `POST /ledger/voucher?sendToLedger=true` — create AND BOOK the voucher. **MUST include `?sendToLedger=true`**
5. `POST /ledger/voucher/{voucherId}/attachment` — upload the receipt PDF

## Winning Payload Shape

### Branch A — Non-deductible representation
**URL**: `POST /ledger/voucher?sendToLedger=true`
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
Where GROSS = line_amount × 1.25 for NET-priced receipts.

### Branch B — Deductible purchase
**URL**: `POST /ledger/voucher?sendToLedger=true`
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
      "amount": "-<GROSS>", "amountCurrency": "-<GROSS>",
      "amountGross": "-<GROSS>", "amountGrossCurrency": "-<GROSS>"
    }
  ]
}
```
- Tripletex auto-calculates `amount` on expense posting (net = GROSS / 1.25) and creates a 3rd posting on `2710`

### Branch C — Deductible travel/accommodation
**URL**: `POST /ledger/voucher?sendToLedger=true`
```json
{
  "date": "<receipt-date>",
  "description": "<receipt-line-text>",
  "postings": [
    {
      "row": 1, "date": "<receipt-date>", "description": "<receipt-line-text>",
      "account": { "id": "<7140-id>" },
      "department": { "id": "<dept-id>" },
      "vatType": { "id": 1 },
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
- `vatType: { id: 1 }` = incoming 25% (NOT account's default 12%)
- Tripletex auto-calculates `amount` on expense posting (net = GROSS / 1.25) and creates a 3rd posting on `2710`
- Applies to: `Overnatting`, `Togbillett`, and other travel/accommodation lines

## Validation Traps

- **CRITICAL: detect NET vs GROSS receipt prices FIRST** — `total × 0.25 == MVA` means NET, multiply by 1.25 for gross. All task 22 receipts are NET. Previous runs scored 0/5 because NET was treated as GROSS.
- **CRITICAL: always use `?sendToLedger=true`** on POST /ledger/voucher — without it the voucher stays in draft and scorer cannot find it (all checks fail)
- do not use `7350` for representation receipts
- do not use `7100` for train tickets (vatLocked=true, car allowance account)
- do not use the whole receipt total; use only the selected receipt line amount (after NET→GROSS conversion)
- do not omit `vatType` on Branch B/C postings; it defaults to code `0` (no VAT), not the account default
- for Branch C: do NOT use account 7140's default vatType.id=`12` (12%); use `vatType: { id: 1 }` (25%) because the receipt states 25% MVA
- do not rely on `department: { "name": "..." }`; always use exact `department.id`
- do not use `account.number` on voucher postings; always resolve to `account.id`
- do not use `POST /ledger/voucher/importDocument` for this flow
- do not skip the receipt attachment; it is scored

## Verification Shape

- `POST /ledger/voucher?sendToLedger=true` proves: date, description, expense account, department, amounts, vatType, booked status
- For Branch B/C also proves: auto-generated VAT posting (`2710` for 25%)
- `POST /ledger/voucher/{voucherId}/attachment` proves: attachment.id
- No follow-up `GET /ledger/voucher/{id}` needed unless a write response is unexpectedly sparse
