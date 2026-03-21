# Register Receipt Expense Voucher

## Scope

Use for tasks like:
- register one manual expense voucher from one attached receipt
- book only one specific receipt line, not the whole receipt
- put the expense in one named department
- preserve the receipt as a voucher attachment
- use the correct expense account and VAT treatment based on the receipt line text

Four proven branches:
- **Branch A**: business-lunch / representation line (e.g., `Forretningslunsj`, `Kundemøte lunsj`) → account `7360`, no VAT deduction
- **Branch B**: office furniture / equipment / supplies line (e.g., `Kontorstoler`) → account `6540`, incoming 25% VAT deductible
- **Branch C**: travel / accommodation line (e.g., `Overnatting`, `Togbillett`) → account `7140`, incoming 12% VAT deductible (lav sats)
- **Branch D**: internal meeting / coffee meeting / course / seminar line (e.g., `Kaffemøte`) → account `6860`, incoming 25% VAT deductible

Do not use for:
- supplier-invoice tasks
- travel-expense or employee-reimbursement tasks
- prompts that need several receipt lines booked separately
- prompts that already provide an exact different expense account or VAT code
- prompts that score supplier, employee, project, or customer linkage

## Receipt Amount Interpretation — CRITICAL

**These receipts show NET prices (before VAT), not GROSS.**

Detection rule:
- Compute `total × 0.25`. If it matches the stated MVA → prices are **NET**. Use `GROSS = line_amount × 1.25` (or `× 1.12` for Branch C transport/accommodation).
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
| `Overnatting` / hotel / accommodation | `7140` (Reisekostnad, ikke oppgavepliktig) | Incoming 12% VAT (`vatType: { id: 12 }`, lav sats), fully deductible |
| `Togbillett` / train ticket / transport | `7140` (Reisekostnad, ikke oppgavepliktig) | Incoming 12% VAT (`vatType: { id: 12 }`, lav sats), fully deductible |
| `Kaffemøte` / coffee meeting / internal meeting / course / seminar | `6860` (Møte, kurs, oppdatering o.l.) | Incoming 25% VAT (`vatType: { id: 1 }`), fully deductible |
| Office supplies / `Kontorrekvisita` | `6500` (if applicable) | Incoming 25% VAT, fully deductible |

- Do NOT use `7350` for representation; 2026-03-21 production scored `0/10` on that branch
- Do NOT use `7100` for train tickets; 7100 is "Bilgodtgjørelse oppgavepliktig" (car allowance), vatLocked=true, fails 422 with incoming VAT
- For Branch C: use account 7140's default `vatType: { id: 12 }` (incoming 12%, lav sats) — do NOT use `vatType: { id: 1 }` (25%). Norwegian transport/accommodation has statutory 12% rate. GROSS = NET × 1.12.

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

### Branch C (Togbillett / train) — CORRECTED to 12% VAT
- NET line = 8750, GROSS = 8750 × 1.12 = **9800**
- `POST /ledger/voucher?sendToLedger=true` with amountGross=9800, `vatType: { id: 12 }` (incoming 12%, lav sats), account 7140, dept Administrasjon
- Voucher #428 (id=609155900, booked):
  - expense posting: amount=8750 (net), amountGross=9800, vatType.id=12 (lav sats, 12%), dept=Administrasjon
  - bank posting: -9800
  - auto-VAT posting: amount=1050 on account 2712 (Inngående merverdiavgift, lav sats)
- Tripletex auto-computed net = 9800 / 1.12 = 8750 = original NET line amount ✓
- **Previous 25% proofs (vouchers #319, #320) are WRONG** — used vatType 1 (25%), auto-VAT on 2710. Production run 3373fbc9 with 25% scored 7/10 (Check 3 failed).

### Branch A production proof (2026-03-21, FAILED — 4c7f5f3e, Kaffemøte scored 0/10)
- Kaffemøte (coffee meeting) 6600 NET → GROSS = 8250, dept "Utvikling", account 7360, Portuguese prompt
- 4 calls, 0 errors BUT 0/10 score
- **ROOT CAUSE**: Kaffemøte is a meeting expense (6860 Branch D), NOT representation (7360 Branch A)
- All 4 production runs using 7360 for Kaffemøte scored 0/10

### Branch C production proof (2026-03-21, 3373fbc9, Togbillett — scored 7/10, Check 3 FAILED)
- Togbillett 8750 NET → GROSS = 10937.50 (used ×1.25), dept "Administrasjon", account 7140, Norwegian prompt
- 4 calls, 0 errors: POST dept → GET accounts → POST voucher?sendToLedger=true → POST attachment
- Voucher 609144179 (booked): amount=8750 (net), amountGross=10937.50, vatType.id=1 (25%), dept 957152
- Auto-VAT posting: 2187.50 on account 2710 (høy sats)
- **ROOT CAUSE of Check 3 failure**: used vatType 1 (25%) instead of vatType 12 (12%). GROSS should be 9800 (×1.12), auto-VAT should be 1050 on 2712 (lav sats).
- Corrected approach sandbox-verified: voucher #428 with vatType 12, GROSS=9800, auto-VAT=1050 on 2712

### Branch A production proof (2026-03-21, a72dbb14, Kundemøte lunsj — Spanish prompt)
- Kundemøte lunsj 14050 NET → GROSS = 17562.50, dept "Drift", account 7360
- 5 calls, 1 avoidable 422: POST dept → GET accounts → POST voucher (422, missing `row`) → POST voucher (201, added `row: 1, row: 2`) → POST attachment
- Voucher 609177801 (booked): amount=17562.50, amountGross=17562.50, vatType.id=0, dept 963901
- **Wasted call**: first POST voucher omitted `row` fields → 422 "row 0 is system-generated"
- **Fix**: added `row: 1` and `row: 2` to postings → 201 on retry
- Optimal path: 4 calls (no 422)

### Common findings
- `GET /department?name=Drift&isInactive=false&fields=*` is a containing search; local exact filtering mandatory
- `department: { "name": "Drift" }` on voucher postings silently persists `department=null`
- `account: { number: 7360, name: "..." }` (no id) → 422; account.id is mandatory on voucher postings
- `POST /ledger/voucher/importDocument` creates uneditable voucher shell; not usable for this flow
- Account 7140's default vatType is 12% (statutory lav sats for transport/accommodation) — use this default, do NOT override to vatType id=1 (25%)

## Minimal Safe Flow

**4 API calls** for all branches on a fresh production account:

1. `POST /department` — create the target department
2. `GET /ledger/account?number=<expense-acct>,1920&fields=id,number,name,vatType(*)` — resolve account IDs (and for Branch B, extract vatType.id)
3. Detect NET vs GROSS: check `total × 0.25 == MVA` → NET. Compute `GROSS = line × 1.25` if NET (or `× 1.12` for Branch C transport/accommodation).
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
- `vatType: { id: <from account> }` = typically id=`12` (incoming 12%, lav sats) — use the value from GET /ledger/account response
- Where `GROSS = line_amount × 1.12` for NET-priced receipts (12% statutory rate for transport/accommodation)
- Tripletex auto-calculates `amount` on expense posting (net = GROSS / 1.12) and creates a 3rd posting on `2712` (lav sats)
- Applies to: `Overnatting`, `Togbillett`, and other travel/accommodation lines

### Branch D — Deductible meeting/course expense
**URL**: `POST /ledger/voucher?sendToLedger=true`
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
      "amount": "-<GROSS>", "amountCurrency": "-<GROSS>",
      "amountGross": "-<GROSS>", "amountGrossCurrency": "-<GROSS>"
    }
  ]
}
```
- `vatType: { id: 1 }` = incoming 25%
- Tripletex auto-calculates `amount` on expense posting (net = GROSS / 1.25) and creates a 3rd posting on `2710`
- Applies to: `Kaffemøte`, internal meetings, courses, seminars
- **CRITICAL**: `Kaffemøte` is Branch D (6860), NOT Branch A (7360). All 4 production runs using 7360 for Kaffemøte scored 0/10.

## Validation Traps

- **CRITICAL: every posting MUST include an explicit `row` field** — expense posting `row: 1`, balancing posting `row: 2`. Without `row`, Tripletex defaults to row 0 which is reserved for system-generated postings and returns 422: "Posteringene på rad 0 (guiRow 0) er systemgenererte". Production run a72dbb14 wasted 1 call to this 422.
- **CRITICAL: detect NET vs GROSS receipt prices FIRST** — `total × 0.25 == MVA` means NET, multiply by 1.25 for gross. All task 22 receipts are NET. Previous runs scored 0/5 because NET was treated as GROSS.
- **CRITICAL: always use `?sendToLedger=true`** on POST /ledger/voucher — without it the voucher stays in draft and scorer cannot find it (all checks fail)
- **CRITICAL: do NOT use `7360` for `Kaffemøte`** — Kaffemøte is a meeting expense (6860 Branch D), NOT representation. All 4 production runs using 7360 scored 0/10.
- do not use `7350` for representation receipts
- do not use `7100` for train tickets (vatLocked=true, car allowance account)
- do not use the whole receipt total; use only the selected receipt line amount (after NET→GROSS conversion)
- do not omit `vatType` on Branch B/C postings; it defaults to code `0` (no VAT), not the account default
- for Branch C: use account 7140's default vatType.id=`12` (12%, lav sats). Do NOT use vatType id=1 (25%). GROSS = NET × 1.12. Production run 3373fbc9 with 25% failed Check 3.
- do not rely on `department: { "name": "..." }`; always use exact `department.id`
- do not use `account.number` on voucher postings; always resolve to `account.id`
- do not use `POST /ledger/voucher/importDocument` for this flow
- do not skip the receipt attachment; it is scored

## Verification Shape

- `POST /ledger/voucher?sendToLedger=true` proves: date, description, expense account, department, amounts, vatType, booked status
- For Branch B/D also proves: auto-generated VAT posting on `2710` (25%)
- For Branch C also proves: auto-generated VAT posting on `2712` (12% lav sats)
- `POST /ledger/voucher/{voucherId}/attachment` proves: attachment.id
- No follow-up `GET /ledger/voucher/{id}` needed unless a write response is unexpectedly sparse
