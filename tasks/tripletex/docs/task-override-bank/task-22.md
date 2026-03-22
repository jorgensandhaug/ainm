# TASK OVERRIDE — Task 22: Register Receipt Expense Voucher

**You are running Task 22. The task is already identified. Do not classify.**

**This file is SELF-CONTAINED. Do NOT read AGENTS.md, openapi.json, trusted-standards/, or task-playbooks/. Everything you need is here. Read this file, then IMMEDIATELY write and execute the script with `bun`.**

---

## What this task is

Register one manual voucher from an attached receipt (PDF), book it to the correct expense account with correct VAT treatment, on a named department, and upload the receipt as attachment.

The prompt will:
- Name one receipt line to book (e.g., "Togbillett", "Kontorstoler", "Kaffemøte", "Forretningslunsj")
- Name a department (e.g., "Administrasjon")
- Ask for correct expense account and VAT treatment
- Provide a receipt PDF attachment
- May be in `nb`, `en`, `es`, `pt`, `nn`, `de`, or `fr`

**If the incoming prompt is NOT about booking a single receipt line as an expense voucher with department and attachment, say so and stop.**

---

## Operating rules

- Work fully autonomously. Do not ask questions. Do not talk to the user.
- Hard `300s` budget. Plan before calling APIs.
- Only interact with the Tripletex API by writing TypeScript and running it with `bun`.
- Use the prompt-provided scripts directory for all scripts.
- Authentication: Basic Auth, username `0`, password = provided session token.
- Safe URL joining: `` `${baseUrl.replace(/\/+$/, "")}/endpoint` `` — never `new URL('/path', baseUrl)`.
- If first call returns `403` with "Invalid or expired token" or "Invalid or expired proxy token", stop immediately — blocked credentials.
- **GETs are FREE** for scoring. Use them liberally for verification and logging.
- **After every write (POST/PUT), do a GET to read back and log the full resulting state.**
- `console.log(JSON.stringify(response, null, 2))` for every response.
- List responses: `{ values: [...] }`. Single-object: `{ value: {...} }`.

---

## Receipt parsing — extract the RIGHT line

Each receipt PDF contains **multiple line items** (2-3 items), but the prompt asks you to book only **ONE specific line**.

1. Read the receipt PDF from the prompt's attached files
2. Identify the ONE line matching the keyword in the prompt (e.g., "Tastatur" → line "Tastatur 6900")
3. **Ignore all other lines** — they are noise
4. Extract the receipt date from `Dato: DD.MM.YYYY` → convert to ISO `YYYY-MM-DD`
5. Use the line amount directly as `amountGross`

Receipt format:
```
Olivia AS
Org nr 999999999, MVA-registrert
Dato: DD.MM.YYYY              ← receipt date

Tastatur              6900     ← target line (if prompt says "Tastatur")
Mus                    120     ← IGNORE
Headset                310     ← IGNORE

Totalt               7330     ← do NOT use this
herav MVA 25%:       1832.50  ← VAT already included
Betalt med: Bedriftskort       ← payment method, NOT expense category
```

---

## CRITICAL: Receipt amounts are GROSS (VAT-inclusive)

**Use the receipt line amount DIRECTLY as `amountGross`. Do NOT multiply by 1.25 or 1.12.**

The receipts show "herav MVA 25%: X" meaning VAT is ALREADY INCLUDED. Despite the coincidence that `total × 0.25 == stated_MVA`, this does NOT mean prices are NET.

| Receipt line | amountGross to use | What NOT to do |
|---|---|---|
| Tastatur 6900 | **6900** | ~~6900 × 1.25 = 8625~~ (FAILED Check 3) |
| Togbillett 8750 | **8750** | ~~8750 × 1.12 = 9800~~ |
| Kontorstoler 10800 | **10800** | ~~10800 × 1.25 = 13500~~ |
| Kaffemøte 6600 | **6600** | ~~6600 × 1.25 = 8250~~ |
| Forretningslunsj 13650 | **13650** | ~~13650 × 1.25 = 17062.50~~ |

**Production evidence:** Run e89025d1 (Branch B, Tastatur 6900) used amountGross=8625 (6900×1.25) → Check 3 FAILED. Run 3373fbc9 (Branch C, Togbillett 8750) used 10937.50 (8750×1.25) → Check 3 FAILED.

---

## Branch selection — Decision tree

Match the receipt line keyword from the prompt to ONE of 4 branches:

| Receipt keyword | Branch | Account | VAT rate | vatType id | Notes |
|---|---|---|---|---|---|
| **Forretningslunsj**, **Kundemøte lunsj**, business lunch | **A** | `7360` | 0% (vatLocked) | don't send | Non-deductible representation |
| **Kontorstoler**, **Whiteboard**, **Tastatur**, **Skrivebordlampe**, office furniture/IT | **B** | `6540` | 25% | from account (typ. 1) | Deductible purchase |
| **Togbillett**, **Flybillett**, **Overnatting**, train/flight/hotel | **C** | `7140` | **12%** (lav sats) | from account (typ. 12) | Transport/accommodation |
| **Kaffemøte**, coffee meeting, course, seminar | **D** | `6860` | 25% | from account (typ. 1) | Meeting expense |

### Why Kaffemøte is NOT representation
- Representation (7360) = external customer entertainment (Forretningslunsj, Kundemøte lunsj)
- Meeting expense (6860) = internal meetings, coffee, courses, seminars (Kaffemøte)
- **All 4 production runs using 7360 for Kaffemøte scored 0/10**

### Bedriftskort is payment method, NOT expense signal
- "Betalt med: Bedriftskort" = paid with company card — tells you NOTHING about expense category
- Do NOT let "bedriftskort" trigger representation routing

---

## Complete API flow — 3 scored writes + free GETs

### Step 1: Create or resolve department

**Try create first:**
```
POST /department
Body: { "name": "<dept>", "departmentNumber": -1 }
```
- On `409 Conflict` → department exists → use GET:
```
GET /department?name=<dept>&isInactive=false&fields=*
```
- **TRAP**: GET is substring search. "Drift" returns "Drift sandbox copy" too. Filter results locally for exact `name == "<dept>"`.
- Extract `departmentId`.
- **Log**: `department: id=<id>, name=<name>`

### Step 2: Resolve account IDs and vatType (FREE GET)
```
GET /ledger/account?number=<expense-acct>,1920&fields=id,number,name,vatType(*),vatLocked
```
- `<expense-acct>` = the account number from the branch table (7360, 6540, 7140, or 6860)
- Extract: `expenseAccountId`, `bankAccountId` (1920)
- For Branch B/C/D: extract `vatType.id` from the expense account response
- For Branch A: account is `vatLocked=true`, don't send vatType
- **Log**: `expenseAccount: id=<id>, number=<num>, vatType.id=<vtid>, vatLocked=<bool>` and `bankAccount: id=<id>, number=1920`
- Note: `account.number` is returned as integer, not string — compare numerically

### Step 3: Create and book the voucher

```
POST /ledger/voucher?sendToLedger=true
```

**Pre-send checklist:**
- [ ] URL has `?sendToLedger=true` — **MANDATORY** (without it voucher stays DRAFT → 0/10)
- [ ] Expense posting has `row: 1`
- [ ] Bank posting has `row: 2`
- [ ] `account` uses `{ id: <id> }` (NOT number, NOT name)
- [ ] `department` uses `{ id: <id> }` (NOT name — silently stores null)
- [ ] For B/C/D: `vatType: { id: <from account response> }` is present on expense posting
- [ ] For A: NO vatType on expense posting (account is vatLocked)
- [ ] `amountGross` = receipt line amount DIRECTLY — NO multiplication
- [ ] Bank posting `amountGross` = negated receipt line amount
- [ ] `date` = receipt date (ISO YYYY-MM-DD)
- [ ] `description` = receipt line text

### Step 3b: Verify voucher (FREE GET)
```
GET /ledger/voucher/{voucherId}?fields=id,number,date,description,postings(row,amount,amountCurrency,amountGross,amountGrossCurrency,account(id,number,name),department(id,name),vatType(id,number,name,percentage),systemGenerated)
```
**Log every posting.** Verify:
- [ ] Expense `account.number` matches branch (7360/6540/7140/6860)
- [ ] `amountGross` = receipt line amount (NOT multiplied)
- [ ] `vatType.id` correct for branch
- [ ] `department.name` matches prompt
- [ ] For B/C/D: auto-VAT posting exists on 2710 (25%) or 2712 (12%)

### Step 4: Upload receipt attachment
```
POST /ledger/voucher/{voucherId}/attachment
Content-Type: multipart/form-data
Body: file=<receipt-file>
```

### Step 4b: Verify attachment (FREE GET)
```
GET /ledger/voucher/{voucherId}?fields=id,attachment(id,fileName)
```
- Verify `attachment.id > 0`
- **Log**: `attachment: id=<id>, fileName=<name>`

---

## Payload templates — copy the right one

### Branch A — Non-deductible representation (7360, 0% vatLocked)
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
- All 4 amount fields on expense posting = same value (line amount)
- No `vatType` on expense posting (account is vatLocked)
- No auto-VAT posting will be generated

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
- Tripletex auto-computes: `amount` = amountGross / 1.25 (net), auto-creates 3rd posting on `2710`

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
- Tripletex auto-computes: `amount` = amountGross / 1.12 (net), auto-creates 3rd posting on `2712` (lav sats)

### Branch D — Meeting/course (6860, 25% VAT)
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
- Tripletex auto-computes: `amount` = amountGross / 1.25 (net), auto-creates 3rd posting on `2710`

**In ALL payloads:** `<line-amount>` = the receipt line price exactly as shown (e.g., Tastatur 6900 → 6900). No multiplication.

---

## Account quick reference

| Account | Name | vatLocked | Default vatType id | Use for |
|---|---|---|---|---|
| 7360 | Representasjon, ikke fradragsberettiget | true | 0 (0%) | Forretningslunsj, Kundemøte lunsj |
| 6540 | Inventar | false | 1 (25%) | Kontorstoler, Whiteboard, Tastatur, Skrivebordlampe |
| 7140 | Reisekostnad, ikke oppgavepliktig | false | 12 (12%) | Togbillett, Flybillett, Overnatting |
| 6860 | Møte, kurs, oppdatering o.l. | false | 1 (25%) | Kaffemøte, courses, seminars |

**Do NOT use:**
- `7100` for train tickets (car allowance, vatLocked=true, 422 with incoming VAT)
- `7350` for representation (unverified; use 7360)
- `7360` for Kaffemøte (meeting expense = 6860, NOT representation)

---

## Fatal mistakes — all caused 0/10 or partial scores in production

| # | Mistake | Result | Fix |
|---|---------|--------|-----|
| 1 | Missing `?sendToLedger=true` | Voucher stays DRAFT → 0/10 | Always `POST /ledger/voucher?sendToLedger=true` |
| 2 | Multiplied receipt amounts (e.g., 6900×1.25) | Check 3 fails (7/10) | Use receipt line amount directly as amountGross |
| 3 | vatType 1 (25%) on Togbillett/Overnatting | Wrong VAT → Check 3 fails | Use account's default vatType (id=12 for 7140) |
| 4 | Account 7360 for Kaffemøte | Wrong account → 0/10 | Kaffemøte = 6860 (meeting), NOT 7360 (representation) |
| 5 | Missing `row` field on postings | 422 error | Always: expense `row: 1`, bank `row: 2` |
| 6 | `department: { name: "X" }` on postings | Silently null → Check 4 fails | Resolve to `department: { id: <id> }` |
| 7 | `account: { number: N }` on postings | 422 error | Resolve to `account: { id: <id> }` |
| 8 | Using `importDocument` for receipts | Description/postings immutable | Use manual `POST /ledger/voucher` |
| 9 | Omitting vatType on Branch B/C/D | Defaults to code 0 (no VAT) → Check 3 fails | Always send explicit `vatType: { id: <from account> }` |

---

## Scoring — what the scorer checks

| Check | What scorer looks for | How to verify |
|---|---|---|
| 1 — Voucher exists & booked | `id` > 0, `number` > 0 | Step 3b: `id`, `number` |
| 2 — Correct expense account | posting account number | Step 3b: `postings[0].account.number` |
| 3 — Amount & VAT | `amountGross` = receipt line, `vatType.id`, auto-VAT posting | Step 3b: all posting fields |
| 4 — Correct department | posting department | Step 3b: `postings[0].department.name` |
| 5 — Attachment | `attachment.id` > 0 | Step 4b: `attachment.id` |

**Efficiency bonus** applies only at perfect correctness (5/5 checks). Fewer `4xx` errors = higher bonus.

---

## Sandbox verification (2026-03-22) — all 4 branches pass

| Branch | Account | amountGross | vatType | amount (auto NET) | VAT (auto) | VAT acct |
|---|---|---|---|---|---|---|
| A (Forretningslunsj 13650) | 7360 | 13650 | 0 (0%) | 13650 | — | — |
| B (Kontorstoler 10800) | 6540 | 10800 | 1 (25%) | 8640 | 2160 | 2710 |
| C (Togbillett 8750) | 7140 | 8750 | 12 (12%) | 7812.50 | 937.50 | 2712 |
| D (Kaffemøte 6600) | 6860 | 6600 | 1 (25%) | 5280 | 1320 | 2710 |

---

## Recovery branches

- `GET /department?name=X` is substring search → always exact-filter locally
- If department POST gets 409 → GET and filter for exact name match
- If `account.number` comparison fails, compare numerically (API returns integer, not string)
- If voucher POST fails with 422, read the `validationMessages[]` for the specific field error

---

## Production run history

| Run | Branch | amountGross | Score | Root cause |
|---|---|---|---|---|
| e89025d1 | B (Tastatur 6900) | 8625 (×1.25) | 7/10 | Wrong amount |
| 3373fbc9 | C (Togbillett 8750) | 10937.50 (×1.25) | 7/10 | Wrong vatType + amount |
| 4c7f5f3e | D (Kaffemøte 6600) | — | 0/10 | Wrong account (7360) |
| 01420e60 | A (Kundemøte lunsj) | — | 0/10 | Missing sendToLedger |
| 67d4ddca | C (Overnatting) | — | 0/10 | Missing sendToLedger |
| 1519c2a7 | C (Togbillett) | — | 0/10 | Missing sendToLedger |
| 70014f3c | A (Forretningslunsj 13200) | 13200 | pending | Clean: 0 errors, all verified |
| 822ad6b6 | B (Kontorstoler 3000) | — | blocked | Expired proxy token (403) |
