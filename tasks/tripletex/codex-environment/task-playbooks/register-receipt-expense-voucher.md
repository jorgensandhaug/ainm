# Register Receipt Expense Voucher

## Scope

Use for tasks like:
- register one manual expense voucher from one attached receipt
- book only one specific receipt line, not the whole receipt
- put the expense in one named department
- preserve the receipt as a voucher attachment
- use the correct expense account and VAT treatment based on the receipt line text

Three proven branches:
- **Branch A**: business-lunch / representation line (e.g., `Forretningslunsj`) → account `7360`, no VAT deduction
- **Branch B**: office furniture / equipment / supplies line (e.g., `Kontorstoler`) → account `6540`, incoming 25% VAT deductible
- **Branch C**: hotel / accommodation line (e.g., `Overnatting`) → account `7140`, incoming 12% VAT deductible

Do not use for:
- supplier-invoice tasks
- travel-expense or employee-reimbursement tasks
- prompts that need several receipt lines booked separately
- prompts that already provide an exact different expense account or VAT code
- prompts that score supplier, employee, project, or customer linkage

## Account Selection

| Receipt line text | Account | VAT treatment |
|---|---|---|
| `Forretningslunsj` / business lunch / restaurant meal | `7360` (non-deductible representation) | VAT code `0`, no deduction |
| `Kontorstoler` / office chairs / furniture / equipment | `6540` (Inventar) | Incoming 25% VAT, fully deductible |
| `Overnatting` / hotel / accommodation | `7140` (Reisekostnad, ikke oppgavepliktig) | Incoming 12% VAT (lav sats), fully deductible |
| Office supplies / `Kontorrekvisita` | `6500` (if applicable) | Incoming 25% VAT, fully deductible |

- Do NOT use `7350` for representation; 2026-03-21 production scored `0/10` on that branch

## Verified Findings

Verified in persistent sandbox on 2026-03-21:

### Branch A (Forretningslunsj / representation)
- `GET /ledger/account?number=1920,7360&fields=*` returned `7360` as `vatLocked=true` with VAT code `0`
- `POST /ledger/voucher` with expense account `7360`, balancing `1920`, gross amount `13650`, department id, succeeded
- All four amount fields set to the same value (amount = amountGross = 13650) because no VAT split
- Voucher `608898560` with attachment `1024214336`

### Branch B (Kontorstoler / deductible purchase)
- `GET /ledger/account?number=6540,1920&fields=id,number,name,vatType(*)`:
  - account `6540` "Inventar": `vatLocked=false`, default `vatType.id=1` (incoming 25%)
  - The `vatType(*)` expansion on the account response gives full VAT type details
- No separate `GET /ledger/vatType` call needed — vatType.id extracted from account response
- `POST /ledger/voucher` with expense account `6540`, `vatType: { id: 1 }`, `amountGross=13500`:
  - Tripletex auto-computed `amount=10800` (net = 13500/1.25)
  - Tripletex auto-generated 3rd posting on account `2710` (Inngående merverdiavgift) with amount `2700`
  - Bank posting `1920` with amount `-13500`
- **CRITICAL**: omitting `vatType` on the posting defaulted to code `0` — no VAT splitting at all (WRONG)
- Account number refs (`account: { number: 6540 }`) failed `422` — must use account IDs

### Branch C (Overnatting / accommodation)
- `GET /ledger/account?number=7140,1920&fields=id,number,name,vatType(*)`:
  - account `7140` "Reisekostnad, ikke oppgavepliktig": `vatLocked=false`, default `vatType.id=12` (incoming 12%, lav sats)
  - vatType.id extracted from account response, no separate GET needed
- `POST /ledger/voucher` with expense account `7140`, `vatType: { id: 12 }`, `amountGross=4850`:
  - Tripletex auto-computed `amount=4330.36` (net = 4850/1.12)
  - Tripletex auto-generated 3rd posting on account `2711` (Inngående merverdiavgift, lav sats) with amount `519.64`
  - Bank posting `1920` with amount `-4850`
- Same payload shape as Branch B, just different account and vatType.id
- Production run 67d4ddca: 4 calls, 0 errors, optimal

### Common findings
- `GET /department?name=Drift&isInactive=false&fields=*` is a containing search; local exact filtering mandatory
- `department: { "name": "Drift" }` on voucher postings silently persists `department=null`
- `POST /ledger/voucher/importDocument` creates uneditable voucher shell; not usable for this flow

## Minimal Safe Flow

**4 API calls** for all branches on a fresh production account:

1. `POST /department` — create the target department
2. `GET /ledger/account?number=<expense-acct>,1920&fields=id,number,name,vatType(*)` — resolve account IDs (and for Branch B/C, extract vatType.id)
3. `POST /ledger/voucher` — create the voucher with correct postings
4. `POST /ledger/voucher/{voucherId}/attachment` — upload the receipt PDF

## Winning Payload Shape

### Branch A — Non-deductible representation
```json
{
  "date": "<receipt-date>",
  "description": "<receipt-line-text>",
  "postings": [
    {
      "row": 1, "date": "<receipt-date>", "description": "<receipt-line-text>",
      "account": { "id": "<7360-id>" },
      "department": { "id": "<dept-id>" },
      "amount": "<line-price>", "amountCurrency": "<line-price>",
      "amountGross": "<line-price>", "amountGrossCurrency": "<line-price>"
    },
    {
      "row": 2, "date": "<receipt-date>", "description": "<receipt-line-text>",
      "account": { "id": "<1920-id>" },
      "amount": "-<line-price>", "amountCurrency": "-<line-price>",
      "amountGross": "-<line-price>", "amountGrossCurrency": "-<line-price>"
    }
  ]
}
```

### Branch B — Deductible purchase
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
      "amountGross": "<line-price>", "amountGrossCurrency": "<line-price>"
    },
    {
      "row": 2, "date": "<receipt-date>", "description": "<receipt-line-text>",
      "account": { "id": "<1920-id>" },
      "amount": "-<line-price>", "amountCurrency": "-<line-price>",
      "amountGross": "-<line-price>", "amountGrossCurrency": "-<line-price>"
    }
  ]
}
```
- Tripletex auto-calculates `amount` on expense posting (net) and creates a 3rd posting on `2710`

### Branch C — Deductible accommodation
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
      "amountGross": "<line-price>", "amountGrossCurrency": "<line-price>"
    },
    {
      "row": 2, "date": "<receipt-date>", "description": "<receipt-line-text>",
      "account": { "id": "<1920-id>" },
      "amount": "-<line-price>", "amountCurrency": "-<line-price>",
      "amountGross": "-<line-price>", "amountGrossCurrency": "-<line-price>"
    }
  ]
}
```
- Tripletex auto-calculates `amount` on expense posting (net = line-price / 1.12) and creates a 3rd posting on `2711`

## Validation Traps

- do not use `7350` for representation receipts
- do not use the whole receipt total; use only the selected receipt line amount
- do not omit `vatType` on Branch B/C postings; it defaults to code `0` (no VAT), not the account default
- do not rely on `department: { "name": "..." }`; always use exact `department.id`
- do not use `account.number` on voucher postings; always resolve to `account.id`
- do not use `POST /ledger/voucher/importDocument` for this flow
- do not skip the receipt attachment; it is scored
- do not add a separate `GET /ledger/vatType` for Branch B/C; extract from the account response instead
- for Branch C (accommodation): account `7140` has vatType.id=`12` (12%, lav sats), not `1` (25%); do not hardcode

## Verification Shape

- `POST /ledger/voucher` proves: date, description, expense account, department, amounts, vatType
- For Branch B/C also proves: auto-generated VAT posting (`2710` for 25%, `2711` for 12%)
- `POST /ledger/voucher/{voucherId}/attachment` proves: attachment.id
- No follow-up `GET /ledger/voucher/{id}` needed unless a write response is unexpectedly sparse
