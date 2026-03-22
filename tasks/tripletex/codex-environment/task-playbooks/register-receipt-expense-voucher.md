# Register Receipt Expense Voucher

## Scope

Book ONE receipt line as a manual expense voucher, assign it to a department, attach the receipt PDF.

Use for: one attached receipt → one expense voucher → one department → one receipt attachment.
Do NOT use for: supplier invoices, travel expenses, employee reimbursements, multi-line splits, or tasks that score supplier/employee/project linkage.

---

## ⛔ FATAL MISTAKES — Every one of these has caused 0/10 or partial scores in production

| # | Mistake | What happens | Fix |
|---|---------|-------------|-----|
| F1 | Missing `?sendToLedger=true` on POST /ledger/voucher | Voucher stays DRAFT → scorer cannot find it → ALL 5 checks fail (0/10) | Always POST to `/ledger/voucher?sendToLedger=true` |
| F2 | **Multiplying receipt amounts** | Wrong amountGross → Check 3 fails. Run e89025d1 used 6900×1.25=8625 → FAILED | Receipt line amounts ARE GROSS (VAT-inclusive). Use them DIRECTLY as `amountGross`. Do NOT multiply by 1.25 or 1.12. |
| F3 | Using vatType 1 (25%) for transport/accommodation | Wrong VAT rate → Check 3 fails. Run 3373fbc9 scored 7/10 | Transport/accommodation (Togbillett, Overnatting, Flybillett) uses vatType id=`12` (12% lav sats) |
| F4 | Using account 7360 for Kaffemøte | Wrong account → 0/10. Kaffemøte is a meeting expense, NOT representation | Kaffemøte → account `6860` (Branch D), NOT `7360` (Branch A) |
| F5 | Missing `row` field on postings | Tripletex puts postings on row 0 (system-reserved) → 422 error | Expense posting: `row: 1`. Bank posting: `row: 2` |
| F6 | Using `department: { name: "..." }` | Silently stores `department=null` → Check 4 fails | Always resolve department ID first, then use `department: { id: <id> }` |
| F7 | Using `account: { number: 7360 }` (no id) | 422: "account.name: Kan ikke være null" | Always GET account IDs first, then use `account: { id: <id> }` |
| F8 | Using importDocument instead of manual voucher | Description becomes immutable, postings uneditable → wrong data | Use `POST /ledger/voucher?sendToLedger=true` (manual voucher) |
| F9 | Omitting vatType on Branch B/C/D expense posting | Defaults to vatType 0 (no VAT) even though account has a default → Check 3 fails | Always send explicit `vatType: { id: <from account response> }` |

---

## Step 1 — Identify the Branch

Read the receipt line text from the prompt. Pick the FIRST matching branch:

| Receipt line text | Branch | Account | VAT rate | vatType id |
|---|---|---|---|---|
| `Forretningslunsj`, `Kundemøte lunsj`, business lunch, restaurant meal | **A** | `7360` | 0% (vatLocked) | — (don't send) |
| `Kontorstoler`, `Whiteboard`, `Tastatur`, `Skrivebordlampe`, office furniture/equipment, IT peripherals | **B** | `6540` | 25% incoming | from account response |
| `Togbillett`, `Flybillett`, `Overnatting`, train/flight/hotel | **C** | `7140` | **12% incoming** (lav sats) | from account response (typically 12) |
| `Kaffemøte`, coffee meeting, internal meeting, course, seminar | **D** | `6860` | 25% incoming | from account response (typically 1) |

**Branch C is the tricky one**: the receipt says "MVA 25%" but that's the aggregate across all items. Norwegian passenger transport and accommodation have a statutory 12% rate (lav sats). Use 12%, not 25%.

**Kaffemøte trap**: "coffee meeting" sounds like representation but it is a meeting expense (6860). Representation (7360) is for external customer entertainment like `Forretningslunsj`.

---

## Step 2 — Receipt Amounts Are GROSS (VAT-inclusive) — CRITICAL

**Receipt line amounts ARE GROSS (VAT-inclusive). Use the line amount DIRECTLY as `amountGross`. Do NOT multiply by 1.25 or 1.12.**

The receipts show "herav MVA 25%: X" which means "of which VAT = X" — the VAT is ALREADY INCLUDED in the total and in each line price. Despite the mathematical coincidence that `total × 0.25 == stated_MVA`, this does NOT mean prices are NET.

| Receipt line | amountGross to use | What NOT to do |
|---|---|---|
| Tastatur 6900 | **6900** | ~~6900 × 1.25 = 8625~~ (WRONG, failed Check 3 in production) |
| Togbillett 8750 | **8750** | ~~8750 × 1.12 = 9800~~ |
| Kontorstoler 10800 | **10800** | ~~10800 × 1.25 = 13500~~ |
| Kaffemøte 6600 | **6600** | ~~6600 × 1.25 = 8250~~ |
| Forretningslunsj 13650 | **13650** | ~~13650 × 1.25 = 17062.50~~ |

**Production evidence:** Run e89025d1 (Branch B, Tastatur 6900) used amountGross=8625 (6900×1.25) with correct vatType=1. Check 3 FAILED. The only possible cause is the wrong amount — scorer expects amountGross=6900.

---

## Step 3 — Execute the API Flow

GETs are free (don't affect score). Use them liberally to verify and log.

### Call 1: Create department
```
POST /department
Body: { "name": "<department-name-from-prompt>", "departmentNumber": -1 }
```
- On 409 Conflict: department already exists → `GET /department?name=<name>&isInactive=false&fields=*`
- **WARNING**: GET is a substring search. If prompt says "Drift", results may include "Drift sandbox copy". Filter locally for exact `name == "Drift"`.
- Extract `departmentId` from response.
- **Log**: `department: id=<id>, name=<name>`

### Call 2: Resolve account IDs
```
GET /ledger/account?number=<expense-acct>,1920&fields=id,number,name,vatType(*),vatLocked
```
- Extract `expenseAccountId`, `bankAccountId` (1920), and for Branch B/C/D: `vatType.id` from the expense account.
- For Branch C (7140): the account's default `vatType.id` is typically `12` (12%, lav sats). **Use this value. Do NOT override to 1.**
- **Log**: `expenseAccount: id=<id>, number=<num>, vatType.id=<vtid>, vatLocked=<bool>` and `bankAccount: id=<id>, number=1920`

### Call 3: Book the voucher
```
POST /ledger/voucher?sendToLedger=true     ← MUST include ?sendToLedger=true
```
See payload shapes below.
- **Log**: `voucher: id=<id>, number=<num>`

### Call 4: Verify voucher (GET — free, doesn't count)
```
GET /ledger/voucher/{voucherId}?fields=id,number,date,description,postings(row,amount,amountCurrency,amountGross,amountGrossCurrency,account(id,number,name),department(id,name),vatType(id,number,name,percentage),systemGenerated)
```
**Log every posting** — this is critical for debugging:
```
posting row=1: account=<number>(<name>) amountGross=<val> amount=<val> vatType=<id>(<pct>%) dept=<name>
posting row=2: account=1920 amountGross=<val> amount=<val>
posting row=3: [AUTO-VAT] account=<number> amount=<val>  (if present)
```
**Verify against expectations:**
- [ ] Expense posting account number matches branch (7360/6540/7140/6860)
- [ ] `amountGross` = receipt line amount (NOT multiplied)
- [ ] `vatType.id` matches branch expectation (null for A, from-account for B/C/D)
- [ ] `department.name` matches prompt department
- [ ] For B/C/D: auto-VAT posting exists on correct account (2710 or 2712)

### Call 5: Upload receipt attachment
```
POST /ledger/voucher/{voucherId}/attachment
Content-Type: multipart/form-data
Body: file=<receipt-pdf-from-prompt-files>
```
- Use the actual receipt file from the prompt's attached files.
- **Log**: `attachment: id=<id>`

### Call 6: Verify attachment (GET — free, doesn't count)
```
GET /ledger/voucher/{voucherId}?fields=id,number,attachment(id,fileName)
```
- **Log**: `attachment confirmed: id=<id>, fileName=<name>`
- Verify `attachment.id > 0`

---

## Payload Shapes

In ALL payloads below: `<line-amount>` = the receipt line price exactly as shown (e.g. Tastatur 6900 → 6900). **No multiplication.**

### Branch A — Representation (7360, no VAT)
Account 7360 is `vatLocked=true` with VAT code 0. Do NOT send vatType. Send all 4 amount fields with the same value.
```json
{
  "date": "<receipt-date>",
  "description": "<receipt-line-text>",
  "postings": [
    {
      "row": 1, "date": "<receipt-date>", "description": "<receipt-line-text>",
      "account": { "id": "<7360-id>" },
      "department": { "id": "<dept-id>" },
      "amount": "<line-amount>", "amountCurrency": "<line-amount>",
      "amountGross": "<line-amount>", "amountGrossCurrency": "<line-amount>"
    },
    {
      "row": 2, "date": "<receipt-date>", "description": "<receipt-line-text>",
      "account": { "id": "<1920-id>" },
      "amount": "-<line-amount>", "amountCurrency": "-<line-amount>",
      "amountGross": "-<line-amount>", "amountGrossCurrency": "-<line-amount>"
    }
  ]
}
```
No auto-VAT posting.

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
      "amountGross": "<line-amount>", "amountGrossCurrency": "<line-amount>"
    },
    {
      "row": 2, "date": "<receipt-date>", "description": "<receipt-line-text>",
      "account": { "id": "<1920-id>" },
      "amountGross": "-<line-amount>", "amountGrossCurrency": "-<line-amount>"
    }
  ]
}
```
Tripletex auto-computes: `amount` = amountGross / 1.25 (net), plus a 3rd posting on `2710` for VAT recovery.

### Branch C — Transport/accommodation (7140, 12% VAT)
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
      "amountGross": "<line-amount>", "amountGrossCurrency": "<line-amount>"
    },
    {
      "row": 2, "date": "<receipt-date>", "description": "<receipt-line-text>",
      "account": { "id": "<1920-id>" },
      "amountGross": "-<line-amount>", "amountGrossCurrency": "-<line-amount>"
    }
  ]
}
```
- `vatType.id` = from account response (typically `12`, incoming 12% lav sats)
- Tripletex auto-computes: `amount` = amountGross / 1.12, plus a 3rd posting on `2712` (lav sats) for VAT recovery

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
      "vatType": { "id": "<vatType-id-from-account>" },
      "amountGross": "<line-amount>", "amountGrossCurrency": "<line-amount>"
    },
    {
      "row": 2, "date": "<receipt-date>", "description": "<receipt-line-text>",
      "account": { "id": "<1920-id>" },
      "amountGross": "-<line-amount>", "amountGrossCurrency": "-<line-amount>"
    }
  ]
}
```
Tripletex auto-computes: `amount` = amountGross / 1.25, plus a 3rd posting on `2710` for VAT recovery.

---

## Verification — Use the GET Readback (Calls 4 & 6)

The verification GETs are free (don't affect score). Always do them. Log all fields.

| Check | What scorer looks for | Verify from GET readback |
|---|---|---|
| 1 — Voucher exists & booked | `voucher.id` > 0 and `voucher.number` > 0 | Call 4: `id`, `number` |
| 2 — Correct expense account | Expense posting on correct account number | Call 4: `postings[0].account.number` |
| 3 — Amount & VAT treatment | Correct `amountGross`, `vatType.id`, auto-VAT posting | Call 4: `amountGross`, `vatType`, system-generated posting |
| 4 — Correct department | Expense posting has correct department | Call 4: `postings[0].department.name` |
| 5 — Attachment present | `attachment.id` > 0 | Call 6: `attachment.id` |

If any check fails in the GET readback, you have a bug. Fix it before the run ends.

---

## Sandbox Verification Results (2026-03-22) — GROSS interpretation

All 4 branches verified end-to-end with GROSS interpretation (line amount directly):

| Branch | Account | amountGross | vatType | amount (NET auto) | VAT (auto) | VAT acct |
|---|---|---|---|---|---|---|
| A (Forretningslunsj) | 7360 | 13650 | 0 (0%) | 13650 | — | — |
| B (Kontorstoler) | 6540 | 10800 | 1 (25%) | 8640 | 2160 | 2710 |
| C (Togbillett) | 7140 | 8750 | 12 (12%) | 7812.50 | 937.50 | 2712 |
| D (Kaffemøte) | 6860 | 6600 | 1 (25%) | 5280 | 1320 | 2710 |

### Production run history

| Run | Branch | amountGross used | Score | Root cause |
|---|---|---|---|---|
| e89025d1 | B (Tastatur 6900) | 8625 (6900×1.25) | 7/10 | **Wrong amount: multiplied by 1.25 instead of using 6900 directly** |
| 3373fbc9 | C (Togbillett 8750) | 10937.50 (8750×1.25) | 7/10 | Wrong vatType (1 not 12) + wrong amount (multiplied) |
| 4c7f5f3e | D (Kaffemøte) | ? | 0/10 | Wrong account (7360 instead of 6860) |
| 01420e60 | A (Kundemøte lunsj) | ? | 0/10 | Missing sendToLedger |
| 67d4ddca | C (Overnatting) | ? | 0/10 | Missing sendToLedger |
| 1519c2a7 | C (Togbillett) | ? | 0/10 | Missing sendToLedger |
| 70014f3c | A (Forretningslunsj 13200) | 13200 | **pending** | Clean run: 0 errors, 3 writes, all checks verified |
