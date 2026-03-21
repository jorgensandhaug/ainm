# Register Receipt Expense Voucher

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- register one new manual voucher from one attached receipt
- the prompt identifies one exact receipt line to book, one exact department name, and asks for the correct expense account and VAT treatment
- the receipt already shows the purchase was paid by company card / business card
- the task is about one expense voucher with the receipt preserved as attachment, not about a supplier invoice, travel expense, or employee reimbursement
- three proven expense-type branches exist:
  - **Branch A (non-deductible representation)**: receipt line is a business-lunch / restaurant meal such as `Forretningslunsj` or `Kundemøte lunsj` → account `7360`, VAT code `0`
  - **Branch B (deductible purchase, 25% VAT)**: receipt line is office furniture, equipment, or supplies such as `Kontorstoler` → account `6540` (Inventar), incoming 25% VAT (vatType id from account response)
  - **Branch C (deductible travel/accommodation, 25% VAT)**: receipt line is hotel / accommodation / train ticket such as `Overnatting` or `Togbillett` → account `7140` (Reisekostnad, ikke oppgavepliktig), incoming 25% VAT (vatType id=`1`)
- select the branch based on the receipt line text, not the receipt vendor or total
- **CRITICAL: receipt prices are NET (before VAT)**. Verify: `total × 0.25 == stated MVA` means NET; `total / 1.25 × 0.25 == stated MVA` means GROSS. All task 22 receipts use NET prices. Gross = line × 1.25.

## Do Not Use This Standard If
- the task scores a real supplier invoice or supplier object linkage
- the task needs travel-expense, salary, employee-expense, project, or customer linkage
- the task needs several receipt lines booked separately or split across several accounts
- the prompt explicitly gives another expense account or another VAT treatment

## Account Selection Rule
- `Forretningslunsj` / `Kundemøte lunsj` / restaurant meals / business lunch / customer meeting lunch → `7360` (non-deductible representation)
- `Kontorstoler` / office chairs / furniture / equipment → `6540` (Inventar)
- `Overnatting` / hotel / accommodation → `7140` (Reisekostnad, ikke oppgavepliktig)
- `Togbillett` / train ticket / transport → `7140` (Reisekostnad, ikke oppgavepliktig)
- do not use `7100` for train tickets; 7100 is "Bilgodtgjørelse oppgavepliktig" (car allowance), vatLocked=true, fails with 422 if you try incoming 25% VAT
- do not use `7350` for any representation receipt line; 2026-03-21 production scored `0/10` on that branch
- if the receipt line text does not clearly map to a known account, check Norwegian standard chart of accounts (6500-series for office costs, 7100-series for travel/accommodation, 7300-series for representation)

## Receipt Amount Interpretation — CRITICAL
- **These receipts show NET prices (before VAT), not GROSS**
- The "herav MVA 25%: X" line is VAT calculated as `total × 0.25`, NOT `total / 1.25 × 0.25`
- **Detection rule**: compute both `total × 0.25` and `total / 1.25 × 0.25`. If the first matches the stated MVA, prices are NET. If the second matches, prices are GROSS.
- **For NET-priced receipts**: `GROSS = line_amount × 1.25`
- **For GROSS-priced receipts** (standard): `GROSS = line_amount`
- All known task 22 receipts show NET prices:
  - NSB: 11840 × 0.25 = 2960 ✓ (NET)
  - Thon Hotels: 5330 × 0.25 = 1332.50 ✓ (NET)
  - Peppes Pizza: 14380 × 0.25 = 3595 ✓ (NET)
- The agent MUST multiply by 1.25 to get the correct gross amount
- Previous production runs all scored 0/5 because the NET amount was booked as gross

## Standard Flow

### Branch A — Non-deductible representation (`7360`)
1. If the prompt does not say the department already exists and the run is fresh-account-like, `POST /department`
2. Otherwise `GET /department?name=...&isInactive=false&fields=*` and exact-filter locally by `department.name`
3. `GET /ledger/account?number=7360,1920&fields=*`
4. Detect NET vs GROSS: check if `receipt_total × 0.25 == stated_MVA`. If yes, `GROSS = line_amount × 1.25`. If no, `GROSS = line_amount`.
5. `POST /ledger/voucher?sendToLedger=true` — **MUST include `?sendToLedger=true`** to book the voucher
6. `POST /ledger/voucher/{voucherId}/attachment`
7. verify from the two write responses
8. stop
- **Total: 4 API calls** (fresh account with POST department)

### Branch B — Deductible purchase (`6540` with incoming 25% VAT)
1. If the prompt does not say the department already exists and the run is fresh-account-like, `POST /department`
2. Otherwise `GET /department?name=...&isInactive=false&fields=*` and exact-filter locally by `department.name`
3. `GET /ledger/account?number=6540,1920&fields=id,number,name,vatType(*)` — extract `vatType.id` from account `6540` response
4. Detect NET vs GROSS: check if `receipt_total × 0.25 == stated_MVA`. If yes, `GROSS = line_amount × 1.25`. If no, `GROSS = line_amount`.
5. `POST /ledger/voucher?sendToLedger=true` — with explicit `vatType: { id: <from step 3> }` on the expense posting. **MUST include `?sendToLedger=true`**
6. `POST /ledger/voucher/{voucherId}/attachment`
7. verify from the two write responses
8. stop
- **Total: 4 API calls** (fresh account with POST department)
- **No separate `GET /ledger/vatType` needed** — the account's default vatType.id is extracted from step 3

### Branch C — Deductible travel/accommodation (`7140` with incoming 25% VAT)
1. If the prompt does not say the department already exists and the run is fresh-account-like, `POST /department`
2. Otherwise `GET /department?name=...&isInactive=false&fields=*` and exact-filter locally by `department.name`
3. `GET /ledger/account?number=7140,1920&fields=id,number,name,vatType(*)` — note: account `7140` default vatType is 12% (statutory), but receipts state 25% — use vatType id=`1` (incoming 25%) instead
4. Detect NET vs GROSS: check if `receipt_total × 0.25 == stated_MVA`. If yes, `GROSS = line_amount × 1.25`. If no, `GROSS = line_amount`.
5. `POST /ledger/voucher?sendToLedger=true` — with explicit `vatType: { id: 1 }` (incoming 25%). **MUST include `?sendToLedger=true`**. Do NOT use the account's default vatType (12%); use the receipt's stated rate (25%).
6. `POST /ledger/voucher/{voucherId}/attachment`
7. verify from the two write responses
8. stop
- **Total: 4 API calls** (fresh account with POST department)
- **CRITICAL**: use `vatType: { id: 1 }` (incoming 25%), NOT the account's default `vatType.id=12` (incoming 12%). The receipt states 25% MVA. Using 12% produces wrong amounts and all scorer checks fail.
- Do NOT make a separate `GET /ledger/vatType` call — hardcode `vatType: { id: 1 }` for 25% incoming

## Payload Rules

### Branch A — Non-deductible representation
- expense account: `7360 Representasjon, ikke fradragsberettiget`
- account `7360` is `vatLocked=true` with only VAT code `0`, so do not resolve `/ledger/vatType` and do not send an explicit `vatType`
- **CRITICAL**: if receipt prices are NET, compute `GROSS = line_amount × 1.25` and use GROSS in all four fields:
  - `amount` = `amountCurrency` = `amountGross` = `amountGrossCurrency` = GROSS (the full cost including non-recoverable VAT)
- if receipt prices are GROSS, use the line amount directly
- balancing line on `1920` with negated GROSS amount in all four fields
- no auto-generated VAT posting (code `0`)
- the company bears the full cost (NET + VAT) since VAT is not deductible

### Branch B — Deductible purchase
- expense account: `6540 Inventar` (or other deductible expense account based on receipt line text)
- account `6540` is `vatLocked=false` with default `vatType.id=1` (incoming 25%)
- **CRITICAL**: must send explicit `vatType: { id: <from account response> }` on the expense posting; omitting vatType defaults to code `0` (no VAT), which is WRONG for deductible purchases
- set `amountGross` = `amountGrossCurrency` = receipt line price (the receipt line price is the gross amount including VAT)
- Tripletex auto-calculates:
  - `amount` = receipt line price / 1.25 (net)
  - auto-generated 3rd posting on account `2710` for the VAT recovery amount
- balancing line on `1920` with `amount` = `amountCurrency` = `amountGross` = `amountGrossCurrency` = negated receipt line price

### Branch C — Deductible travel/accommodation
- expense account: `7140 Reisekostnad, ikke oppgavepliktig`
- account `7140` default vatType is 12% (statutory rate), but **use vatType id=`1` (incoming 25%)** because the receipt states 25% MVA
- **CRITICAL**: must send explicit `vatType: { id: 1 }` on the expense posting — do NOT use the account's default (12%) and do NOT omit vatType (defaults to code 0)
- **CRITICAL**: if receipt prices are NET, compute `GROSS = line_amount × 1.25` first
- set `amountGross` = `amountGrossCurrency` = GROSS (= line_amount × 1.25 for NET-priced receipts)
- Tripletex auto-calculates:
  - `amount` = GROSS / 1.25 = original NET line amount
  - auto-generated 3rd posting on account `2710` for the VAT recovery amount (= GROSS × 0.2)
- balancing line on `1920` with `amount` = `amountCurrency` = `amountGross` = `amountGrossCurrency` = negated GROSS
- applies to: `Overnatting`, `Togbillett`, and any other travel/accommodation receipt lines

### Common rules (all branches)
- **detect NET vs GROSS first**: check if `receipt_total × 0.25 == stated_MVA`. If yes, prices are NET and `GROSS = line_amount × 1.25`. If `receipt_total / 1.25 × 0.25 == stated_MVA`, prices are GROSS and `GROSS = line_amount`. All known task 22 receipts are NET.
- use the selected line's GROSS amount (after NET→GROSS conversion if needed), not the whole receipt total
- use the receipt date as voucher date
- preserve the receipt line text exactly in voucher `description` and expense-posting `description`
- attach the department only on the expense posting, using exact `department.id`
- use existing bank account `1920` as the balancing line for this card-paid exact shape
- **ALWAYS use `?sendToLedger=true`** on `POST /ledger/voucher` — without it the voucher stays in draft and the scorer cannot find it (all 5 checks fail)
- preserve the receipt itself with `POST /ledger/voucher/{voucherId}/attachment`; do not treat the attachment as optional
- do not use `POST /ledger/voucher/importDocument` as the default attachment path for this shape

## Reuse From Write Response
- from `POST /department` when used:
  - `value.id`
  - `value.name`
- from `GET /ledger/account?...`:
  - account ids for the expense account and `1920`
  - for Branch B/C: `vatType.id` from the expense account response (use `fields=id,number,name,vatType(*)` to expand)
- from `POST /ledger/voucher`:
  - `value.id`
  - `value.version`
  - `value.number`
  - expense-posting `department.id`
  - expense-posting `account.id`
  - expense-posting `vatType.id`
  - for Branch B/C: auto-generated VAT posting on `2710`/`2711` with `amount` = VAT recovery
- from `POST /ledger/voucher/{voucherId}/attachment`:
  - `value.id`
  - `value.attachment.id`

## Verification
- `POST /ledger/voucher` should already prove:
  - voucher date
  - voucher description
  - expense account id
  - department id on the expense posting
  - amount / amountGross values
  - vatType.id on expense posting
  - for Branch B/C: auto-generated VAT posting with correct VAT amount
- `POST /ledger/voucher/{voucherId}/attachment` should then prove the same voucher now has `attachment.id`
- no follow-up `GET /ledger/voucher/{id}` is needed unless one of those fields is unexpectedly missing

## Known Recovery Branches
- `GET /department?name=Drift...` is a containing search, not exact-match search; local filtering must require exact `department.name == "Drift"`
- if that containing search returns rows such as `Drift sandbox ...` but not exact `Drift`, and the prompt does not say the department already exists, create exact `Drift` once with `POST /department`
- do not try `department: { "name": "Drift" }` on the voucher posting as a lower-call shortcut; persistent sandbox on 2026-03-21 returned `201` but silently stored `department=null`
- do not use `POST /ledger/voucher/importDocument` followed by `PUT /ledger/voucher/{id}` for this receipt-backed voucher shape; persistent sandbox on 2026-03-21 returned `422` that `description` and `postings` are not editable for that imported voucher type
- do not use `account: { "number": 7360 }` or `account: { "number": 6540 }` or `account: { "number": 1920 }` in `POST /ledger/voucher`; number-only account refs fail with `422 postings.account.name: Kan ikke være null.`
- for Branch B/C: do not omit `vatType` on the expense posting; Tripletex defaults to vatType `0` (no VAT) when not specified, even if the account has a non-zero default
- for Branch B: use `vatType.id` from the account response (typically `1` for incoming 25%)
- for Branch C: use `vatType: { id: 1 }` (incoming 25%) — do NOT use the account's default vatType.id=`12` (incoming 12%). The receipt states 25% MVA and using 12% produces wrong amounts.
- **CRITICAL**: always use `?sendToLedger=true` on `POST /ledger/voucher`. Without it, the voucher stays in draft state and the scorer cannot see it. This was a root cause for 0/5 scores on all task 22 attempts.
- **CRITICAL**: always detect NET vs GROSS receipt prices. If `total × 0.25 == stated MVA`, prices are NET and `GROSS = line × 1.25`. All task 22 receipts are NET-priced. Booking the NET amount as GROSS was a root cause for 0/5 scores.

## OpenAPI / Sandbox Status
- `/department`, `/ledger/account`, `/ledger/voucher`, `/ledger/voucher/{voucherId}/attachment`, and `/ledger/voucher/importDocument` verified in `./openapi.json`

### Branch A sandbox proof (2026-03-21)
- `GET /ledger/account?number=1920,7350,7360&fields=*` returned `7350` and `7360` as zero-VAT representation accounts and showed `7360` as the non-deductible representation branch
- `POST /ledger/voucher` with `department: { "name": "Drift" }` succeeded as voucher `608898503` but persisted `department=null`, so name-only department refs are not a safe lower-call shortcut
- `GET /department?name=Drift&isInactive=false&fields=*` first returned only containing-match row `Drift sandbox 20260320-223143`, proving exact local filtering is required
- one exact `POST /department` then created `Drift` with id `927069`
- the successful exact-shape proof was:
  1. exact `Drift` department available as id `927069`
  2. `GET /ledger/account?number=1920,7360&fields=*`
  3. `POST /ledger/voucher` with expense posting on `7360`, balancing line on `1920`, amount `13650`, date `2026-01-30`, and department `927069`
  4. `POST /ledger/voucher/608898560/attachment`
- that final proof returned voucher `608898560` with:
  - expense posting `account.id=424191174` (`7360`)
  - expense posting `department.id=927069`
  - expense posting `vatType.id=0`
  - gross amount `13650`
  - attachment id `1024214336`

### Branch B sandbox proof (2026-03-21)
- `GET /ledger/account?number=6540,1920&fields=id,number,name,vatType(*)` returned:
  - account `6540` "Inventar": id=`424191132`, vatLocked=`false`, vatType.id=`1` ("Fradrag inngående avgift, høy sats", 25%, deductionPercentage=100)
  - account `1920` "Bankinnskudd": id=`424190862`, vatLocked=`true`, vatType.id=`0`
- `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=2026-02-22&fields=*` confirmed id=`1` is incoming 25% — but this call is unnecessary if extracted from account response
- `POST /ledger/voucher` with amountGross=`13500`, vatType={id:`1`}, account 6540, department 927069 returned voucher `609014744` with:
  - expense posting: account=`6540`, amount=`10800`, amountGross=`13500`, vatType.id=`1`, department=`927069`
  - bank posting: account=`1920`, amount=`-13500`, amountGross=`-13500`
  - auto-generated VAT posting: account=`2710` (Inngående merverdiavgift, høy sats), amount=`2700`, amountGross=`2700`
- `POST /ledger/voucher/609014744/attachment` attached the PDF and returned attachment.id=`1024249955`
- omitting explicit `vatType` on the posting defaulted to vatType.id=`0` (no VAT), which is wrong — voucher `609014755` had amount=`13500`, amountGross=`13500` with no VAT splitting
- `account: { number: 6540 }` failed with `422 postings.account.name: Kan ikke være null.`, confirming number-only refs are still unsafe

### Branch C sandbox proof — CORRECTED (2026-03-21)
- **Previous sandbox proof used wrong VAT rate (12%) and wrong amounts (treated NET as GROSS). Both scored 0/5 in production.**
- Corrected sandbox test with NET→GROSS conversion and 25% VAT:
  - `POST /ledger/voucher?sendToLedger=true` with amountGross=`6062.50` (= 4850 NET × 1.25), vatType={id:`1`} (25%), account 7140, department 951187
  - returned voucher #320 (booked):
    - expense posting: account=`7140`, amount=`4850` (net), amountGross=`6062.50`, vatType.id=`1`
    - bank posting: account=`1920`, amount=`-6062.50`
    - auto-generated VAT posting: amount=`1212.50` (= 6062.50 × 0.2)
  - Tripletex correctly auto-computed: net = 6062.50 / 1.25 = 4850 = original NET line amount ✓
- Togbillett variant also verified:
  - `POST /ledger/voucher?sendToLedger=true` with amountGross=`14187.50` (= 11350 NET × 1.25), vatType={id:`1`} (25%), account 7140
  - returned voucher #319 (booked):
    - expense posting: amount=`11350` (net), amountGross=`14187.50`, vatType.id=`1`
    - auto-generated VAT posting: amount=`2837.50` (= 14187.50 × 0.2)
- Branch A corrected sandbox test:
  - `POST /ledger/voucher?sendToLedger=true` with amount=`17562.50` (= 14050 NET × 1.25), account 7360
  - returned voucher #318 (booked):
    - expense posting: amount=`17562.50`, amountGross=`17562.50`, vatType.id=`0`
    - bank posting: amount=`-17562.50`

### Branch C production proofs (2026-03-21, FAILED — all scored 0/5)
- **run 67d4ddca** (Overnatting 4850): used 12% VAT and treated 4850 as GROSS → 0/5 (wrong VAT rate AND wrong amount)
- **run 01420e60** (Kundemøte lunsj 14050): used 14050 as amount but correct gross is 17562.50 → 0/5 (NET treated as GROSS)
- **run 1519c2a7** (Togbillett 11350): used 12% VAT, treated 11350 as gross, no sendToLedger → 0/5 (all three issues)
- These proofs demonstrate the WRONG approach. The corrected sandbox proofs above show the RIGHT approach.

## Winning Payload Shapes

### Branch A — Non-deductible representation
**URL**: `POST /ledger/voucher?sendToLedger=true`
```json
{
  "date": "<receipt-date>",
  "description": "<receipt-line-text>",
  "postings": [
    {
      "row": 1,
      "date": "<receipt-date>",
      "description": "<receipt-line-text>",
      "account": { "id": "<7360-id>" },
      "department": { "id": "<dept-id>" },
      "amount": "<GROSS>",
      "amountCurrency": "<GROSS>",
      "amountGross": "<GROSS>",
      "amountGrossCurrency": "<GROSS>"
    },
    {
      "row": 2,
      "date": "<receipt-date>",
      "description": "<receipt-line-text>",
      "account": { "id": "<1920-id>" },
      "amount": "-<GROSS>",
      "amountCurrency": "-<GROSS>",
      "amountGross": "-<GROSS>",
      "amountGrossCurrency": "-<GROSS>"
    }
  ]
}
```
Where `GROSS = line_amount × 1.25` for NET-priced receipts, or `GROSS = line_amount` for GROSS-priced receipts.
```

### Branch B — Deductible purchase
**URL**: `POST /ledger/voucher?sendToLedger=true`
```json
{
  "date": "<receipt-date>",
  "description": "<receipt-line-text>",
  "postings": [
    {
      "row": 1,
      "date": "<receipt-date>",
      "description": "<receipt-line-text>",
      "account": { "id": "<6540-id>" },
      "department": { "id": "<dept-id>" },
      "vatType": { "id": "<vatType-id-from-account>" },
      "amountGross": "<GROSS>",
      "amountGrossCurrency": "<GROSS>"
    },
    {
      "row": 2,
      "date": "<receipt-date>",
      "description": "<receipt-line-text>",
      "account": { "id": "<1920-id>" },
      "amount": "-<GROSS>",
      "amountCurrency": "-<GROSS>",
      "amountGross": "-<GROSS>",
      "amountGrossCurrency": "-<GROSS>"
    }
  ]
}
```
- Where `GROSS = line_amount × 1.25` for NET-priced receipts, or `GROSS = line_amount` for GROSS-priced receipts
- Tripletex will auto-compute `amount` on the expense posting (net = GROSS / 1.25) and auto-generate a 3rd posting on `2710`

### Branch C — Deductible travel/accommodation
**URL**: `POST /ledger/voucher?sendToLedger=true`
```json
{
  "date": "<receipt-date>",
  "description": "<receipt-line-text>",
  "postings": [
    {
      "row": 1,
      "date": "<receipt-date>",
      "description": "<receipt-line-text>",
      "account": { "id": "<7140-id>" },
      "department": { "id": "<dept-id>" },
      "vatType": { "id": 1 },
      "amountGross": "<GROSS>",
      "amountGrossCurrency": "<GROSS>"
    },
    {
      "row": 2,
      "date": "<receipt-date>",
      "description": "<receipt-line-text>",
      "account": { "id": "<1920-id>" },
      "amount": "-<GROSS>",
      "amountCurrency": "-<GROSS>",
      "amountGross": "-<GROSS>",
      "amountGrossCurrency": "-<GROSS>"
    }
  ]
}
```
- Where `GROSS = line_amount × 1.25` for NET-priced receipts, or `GROSS = line_amount` for GROSS-priced receipts
- `vatType: { id: 1 }` = incoming 25% (NOT the account's default 12%)
- Tripletex will auto-compute `amount` on the expense posting (net = GROSS / 1.25 = original NET line amount) and auto-generate a 3rd posting on `2710`
- Applies to: `Overnatting`, `Togbillett`, and other travel/accommodation lines
