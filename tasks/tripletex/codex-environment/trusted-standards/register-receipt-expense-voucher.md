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
- four proven expense-type branches exist:
  - **Branch A (non-deductible representation)**: receipt line is a formal business-lunch / customer meeting lunch such as `Forretningslunsj` or `Kundemøte lunsj` → account `7360`, VAT code `0`
  - **Branch B (deductible purchase, 25% VAT)**: receipt line is office furniture, equipment, or supplies such as `Kontorstoler` or `Whiteboard` → account `6540` (Inventar), incoming 25% VAT (vatType id from account response)
  - **Branch C (deductible travel/accommodation, 12% VAT)**: receipt line is hotel / accommodation / train ticket such as `Overnatting` or `Togbillett` → account `7140` (Reisekostnad, ikke oppgavepliktig), incoming 12% VAT (vatType id=`12`, lav sats)
  - **Branch D (deductible meeting/course expense, 25% VAT)**: receipt line is an internal meeting / coffee meeting / course / seminar such as `Kaffemøte` → account `6860` (Møte, kurs, oppdatering o.l.), incoming 25% VAT (vatType id=`1`)
- **CRITICAL**: `Kaffemøte` is a **meeting expense** (6860), NOT representation (7360). All 4 production runs using 7360 for Kaffemøte scored 0/10. Internal coffee meetings are meeting expenses, not customer entertainment.
- select the branch based on the receipt line text, not the receipt vendor or total
- **CRITICAL: receipt prices are NET (before VAT)**. Verify: `total × 0.25 == stated MVA` means NET; `total / 1.25 × 0.25 == stated MVA` means GROSS. All task 22 receipts use NET prices. Gross = line × 1.25 (or × 1.12 for Branch C transport/accommodation).

## Do Not Use This Standard If
- the task scores a real supplier invoice or supplier object linkage
- the task needs travel-expense, salary, employee-expense, project, or customer linkage
- the task needs several receipt lines booked separately or split across several accounts
- the prompt explicitly gives another expense account or another VAT treatment

## Account Selection Rule
- `Forretningslunsj` / `Kundemøte lunsj` / restaurant meals / business lunch / customer meeting lunch → `7360` (non-deductible representation)
- `Kaffemøte` / coffee meeting / internal meeting / course / seminar → `6860` (Møte, kurs, oppdatering o.l.) — **NOT 7360**
- `Kontorstoler` / `Whiteboard` / office chairs / whiteboard / furniture / equipment → `6540` (Inventar)
- `Overnatting` / hotel / accommodation → `7140` (Reisekostnad, ikke oppgavepliktig)
- `Togbillett` / `Flybillett` / train ticket / flight ticket / transport → `7140` (Reisekostnad, ikke oppgavepliktig)
- `USB-hub` / small office equipment / IT accessories → `6540` (Inventar) or `6800` (Kontorrekvisita)
- do not use `7100` for train tickets; 7100 is "Bilgodtgjørelse oppgavepliktig" (car allowance), vatLocked=true, fails with 422 if you try incoming 25% VAT
- do not use `7350` for any representation receipt line; 2026-03-21 production scored `0/10` on that branch
- **do not use `7360` for `Kaffemøte`**; all 4 production runs using 7360 for Kaffemøte scored `0/10`; the correct account is `6860`
- if the receipt line text does not clearly map to a known account, check Norwegian standard chart of accounts (6500-series for office costs, 6800-series for office supplies/meetings, 7100-series for travel/accommodation, 7300-series for representation)

## Receipt Amount Interpretation — CRITICAL
- **These receipts show NET prices (before VAT), not GROSS**
- The "herav MVA 25%: X" line is VAT calculated as `total × 0.25`, NOT `total / 1.25 × 0.25`
- **Detection rule**: compute both `total × 0.25` and `total / 1.25 × 0.25`. If the first matches the stated MVA, prices are NET. If the second matches, prices are GROSS.
- **For NET-priced receipts**: `GROSS = line_amount × 1.25` (or `× 1.12` for Branch C transport/accommodation — see per-branch rates below)
- **For GROSS-priced receipts** (standard): `GROSS = line_amount`
- All known task 22 receipts show NET prices:
  - NSB: 11840 × 0.25 = 2960 ✓ (NET)
  - Thon Hotels: 5330 × 0.25 = 1332.50 ✓ (NET)
  - Peppes Pizza: 14380 × 0.25 = 3595 ✓ (NET)
  - Jernia (Whiteboard): 9400 × 0.25 = 2350 ✓ (NET)
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

### Branch C — Deductible travel/accommodation (`7140` with incoming 12% VAT)
1. If the prompt does not say the department already exists and the run is fresh-account-like, `POST /department`
2. Otherwise `GET /department?name=...&isInactive=false&fields=*` and exact-filter locally by `department.name`
3. `GET /ledger/account?number=7140,1920&fields=id,number,name,vatType(*)` — extract `vatType.id` from account `7140` response (typically id=`12`, 12% incoming — the statutory Norwegian VAT rate for passenger transport and accommodation)
4. Detect NET vs GROSS: check if `receipt_total × 0.25 == stated_MVA`. If yes, prices are NET. Compute `GROSS = line_amount × 1.12` (using the statutory 12% rate, NOT the receipt's aggregate 25%).
5. `POST /ledger/voucher?sendToLedger=true` — with explicit `vatType: { id: <from step 3> }` (incoming 12%). **MUST include `?sendToLedger=true`**
6. `POST /ledger/voucher/{voucherId}/attachment`
7. verify from the two write responses
8. stop
- **Total: 4 API calls** (fresh account with POST department)
- **CRITICAL**: use the account's default `vatType.id` from the GET response (typically id=`12`, incoming 12%). Norwegian passenger transport (Togbillett, Flybillett) and accommodation (Overnatting) have a statutory VAT rate of 12% (lav sats), NOT 25%. The receipt's "herav MVA 25%" refers to the aggregate across ALL items, but the statutory per-item rate for transport is 12%.
- **WHY**: Production run 3373fbc9 scored 7/10 with Check 3 failing when using vatType 1 (25%). All other runs scored 0/10 due to additional issues (NET-as-GROSS, missing sendToLedger). Changing to 12% is expected to fix Check 3.
- Do NOT make a separate `GET /ledger/vatType` call — use the account's default `vatType.id` from step 3
- GROSS calculation: `NET × 1.12` (not `NET × 1.25`). For Togbillett 8750 NET → GROSS 9800 (not 10937.50)

### Branch D — Deductible meeting/course expense (`6860` with incoming 25% VAT)
1. If the prompt does not say the department already exists and the run is fresh-account-like, `POST /department`
2. Otherwise `GET /department?name=...&isInactive=false&fields=*` and exact-filter locally by `department.name`
3. `GET /ledger/account?number=6860,1920&fields=id,number,name,vatType(*)` — account `6860` default vatType is id=`1` (incoming 25%)
4. Detect NET vs GROSS: check if `receipt_total × 0.25 == stated_MVA`. If yes, `GROSS = line_amount × 1.25`. If no, `GROSS = line_amount`.
5. `POST /ledger/voucher?sendToLedger=true` — with explicit `vatType: { id: 1 }` (incoming 25%). **MUST include `?sendToLedger=true`**
6. `POST /ledger/voucher/{voucherId}/attachment`
7. verify from the two write responses
8. stop
- **Total: 4 API calls** (fresh account with POST department)
- Applies to: `Kaffemøte`, internal meetings, courses, seminars
- **CRITICAL**: `Kaffemøte` is a meeting expense (6860), NOT representation (7360). All 4 production runs using 7360 for Kaffemøte scored 0/10.
- Sandbox-verified 2026-03-21: voucher with 6860, vatType=1, amountGross=8250 (6600 NET × 1.25) → amount=6600, auto-VAT=1650 on 2710

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
- account `7140` default vatType is id=`12` (incoming 12%, lav sats) — the statutory Norwegian rate for passenger transport and accommodation
- **CRITICAL**: must send explicit `vatType: { id: <from account response> }` (typically id=`12`, 12%) on the expense posting — do NOT hardcode vatType 1 (25%), do NOT omit vatType (defaults to code 0)
- **CRITICAL**: if receipt prices are NET, compute `GROSS = line_amount × 1.12` (using 12% rate, NOT 25%)
- set `amountGross` = `amountGrossCurrency` = GROSS (= line_amount × 1.12 for NET-priced receipts)
- Tripletex auto-calculates:
  - `amount` = GROSS / 1.12 = original NET line amount
  - auto-generated 3rd posting on account `2712` (Inngående merverdiavgift, lav sats) for the VAT recovery amount (= GROSS - NET = NET × 0.12)
- balancing line on `1920` with `amount` = `amountCurrency` = `amountGross` = `amountGrossCurrency` = negated GROSS
- applies to: `Overnatting`, `Togbillett`, `Flybillett`, and any other travel/accommodation receipt lines
- **WHY 12% not 25%**: Norwegian passenger transport and accommodation have a statutory VAT rate of 12% (lav sats). The receipt's "herav MVA 25%" is the aggregate across all items. Production run 3373fbc9 used 25% and failed Check 3 (7/10). Sandbox-verified: vatType 12 produces auto-VAT on account 2712 (lav sats), vatType 1 produces auto-VAT on account 2710 (høy sats).

### Branch D — Deductible meeting/course expense
- expense account: `6860 Møte, kurs, oppdatering o.l.`
- account `6860` default vatType is id=`1` (incoming 25%)
- **CRITICAL**: must send explicit `vatType: { id: 1 }` on the expense posting
- **CRITICAL**: if receipt prices are NET, compute `GROSS = line_amount × 1.25` first
- set `amountGross` = `amountGrossCurrency` = GROSS (= line_amount × 1.25 for NET-priced receipts)
- Tripletex auto-calculates:
  - `amount` = GROSS / 1.25 = original NET line amount
  - auto-generated 3rd posting on account `2710` for the VAT recovery amount (= GROSS × 0.2)
- balancing line on `1920` with `amount` = `amountCurrency` = `amountGross` = `amountGrossCurrency` = negated GROSS
- applies to: `Kaffemøte` and any other internal meeting/course receipt lines
- sandbox-verified 2026-03-21: Kaffemøte 6600 NET → GROSS 8250 → amount=6600, amountGross=8250, auto-VAT=1650

### Common rules (all branches)
- **CRITICAL: every posting MUST include an explicit `row` field** — expense posting `row: 1`, balancing posting `row: 2`. Without `row`, Tripletex defaults to row 0 which is reserved for system-generated postings and returns 422: "Posteringene på rad 0 (guiRow 0) er systemgenererte". Production run a72dbb14 wasted 1 call to this 422 before adding `row`.
- **detect NET vs GROSS first**: check if `receipt_total × 0.25 == stated_MVA`. If yes, prices are NET. Then compute GROSS using the **item's statutory VAT rate**: `GROSS = line_amount × (1 + rate)` where rate is 0.12 for Branch C (transport/accommodation) and 0.25 for Branches B/D. For Branch A, `GROSS = line_amount × 1.25` (non-deductible, full cost). If `receipt_total / 1.25 × 0.25 == stated_MVA`, prices are GROSS and `GROSS = line_amount`. All known task 22 receipts are NET.
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
  - for Branch B/C/D: `vatType.id` from the expense account response (use `fields=id,number,name,vatType(*)` to expand)
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
- for Branch C: use the account's default `vatType.id` from the GET response (typically id=`12`, incoming 12% lav sats). Do NOT hardcode vatType 1 (25%). Passenger transport and accommodation have a statutory 12% rate. GROSS = `NET × 1.12` (not `× 1.25`). Production run 3373fbc9 used vatType 1 (25%) and failed Check 3.
- **CRITICAL**: always use `?sendToLedger=true` on `POST /ledger/voucher`. Without it, the voucher stays in draft state and the scorer cannot find it. This was a root cause for 0/5 scores on all task 22 attempts.
- **CRITICAL**: always detect NET vs GROSS receipt prices. If `total × 0.25 == stated MVA`, prices are NET. Then compute GROSS using the **item's statutory rate**: `GROSS = NET × 1.12` for Branch C (transport/accommodation), `GROSS = NET × 1.25` for all other branches. All task 22 receipts are NET-priced. Booking the NET amount as GROSS was a root cause for 0/5 scores.

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

### Branch C sandbox proof — 12% VAT (2026-03-21, CORRECTED)
- **Previous proofs used 25% VAT. Production run 3373fbc9 scored 7/10 with Check 3 failing — the scorer expects 12% (lav sats) for passenger transport.**
- Corrected sandbox test with 12% VAT and NET→GROSS conversion:
  - `GET /ledger/account?number=7140,1920&fields=id,number,name,vatType(*)` returned:
    - account `7140`: id=`424191165`, vatType.id=`12` ("Fradrag inngående avgift, lav sats", 12%)
    - account `1920`: id=`424190862`, vatType.id=`0`
  - `POST /ledger/voucher?sendToLedger=true` with amountGross=`9800` (= 8750 NET × 1.12), vatType={id:`12`} (12%), account 7140, dept "Administrasjon"
  - returned voucher #428 (id=`609155900`, booked):
    - expense posting: account=`7140`, amount=`8750` (net), amountGross=`9800`, vatType.id=`12` (lav sats, 12%), dept=Administrasjon
    - bank posting: account=`1920`, amount=`-9800`
    - auto-generated VAT posting: account=`2712` (Inngående merverdiavgift, lav sats), amount=`1050` (= 9800 - 8750)
  - Tripletex correctly auto-computed: net = 9800 / 1.12 = 8750 = original NET line amount ✓
  - VAT recovery on account `2712` (lav sats), NOT `2710` (høy sats) ✓
- **Comparison with 25% (wrong) approach**: same NET=8750 but GROSS=10937.50, auto-VAT=2187.50 on 2710. The 25% approach produces incorrect GROSS and posts VAT on the wrong account.
- Previous 25% sandbox tests (vouchers #319, #320) are retained below for reference as the WRONG approach:
  - Voucher #320: amountGross=6062.50 (4850×1.25), vatType=1 (25%), auto-VAT on 2710 — WRONG rate
  - Voucher #319: amountGross=14187.50 (11350×1.25), vatType=1 (25%), auto-VAT on 2710 — WRONG rate

### Branch C production proofs (2026-03-21, FAILED — all scored ≤7/10)
- **run 67d4ddca** (Overnatting 4850): used 12% VAT but treated 4850 as GROSS (not NET×1.12) → 0/5 (correct VAT rate but wrong amount)
- **run 01420e60** (Kundemøte lunsj 14050): used 14050 as amount but correct gross is 17562.50 → 0/5 (NET treated as GROSS; this is Branch A not C)
- **run 1519c2a7** (Togbillett 11350): used 12% VAT, treated 11350 as gross, no sendToLedger → 0/5 (wrong amount + missing sendToLedger)
- **run 3373fbc9** (Togbillett 8750): used vatType 1 (25%), GROSS=10937.50 (×1.25) → **7/10, Check 3 FAILED** (correct NET→GROSS conversion but wrong VAT rate — should be 12%)
  - POST /department → 201 (dept "Administrasjon" id=957152)
  - GET /ledger/account?number=7140,1920&fields=id,number,name,vatType(*) → 200
  - POST /ledger/voucher?sendToLedger=true → 201 (voucher 609144179): amountGross=10937.50, vatType.id=1, auto-VAT on 2710
  - POST /ledger/voucher/609144179/attachment → 201
  - **ROOT CAUSE**: used vatType 1 (25%) instead of vatType 12 (12%). Scorer expects lav sats for transport.
- **CONCLUSION**: 12% VAT (vatType 12) with GROSS = NET × 1.12 is the correct approach. Sandbox-verified voucher #428 confirms.

### Branch B production proof (2026-03-21, eec3764a — Whiteboard 8600 NET, dept Administrasjon)
- 4 calls, 0 errors
  - POST /department → 201 (dept "Administrasjon" id=964630)
  - GET /ledger/account?number=6540,1920&fields=id,number,name,vatType(*) → 200 (6540 vatType.id=1)
  - POST /ledger/voucher?sendToLedger=true → 201 (voucher 609181807, booked): amountGross=10750 (8600×1.25), amount=8600 (auto-net), vatType.id=1, dept=Administrasjon, auto-VAT=2150 on 2710
  - POST /ledger/voucher/609181807/attachment → 201
- Confirms: Whiteboard → Branch B (6540 Inventar, 25% incoming VAT), NET×1.25 GROSS, 4 calls minimum

### Branch A production proof (2026-03-21, FAILED — 4c7f5f3e, scored 0/10)
- **run 4c7f5f3e** (Kaffemøte 6600, Portuguese prompt, Starbucks receipt, dept Utvikling): 4 calls, 0 errors BUT 0/10 score
  - Used account 7360 (non-deductible representation) for Kaffemøte
  - **ROOT CAUSE**: Kaffemøte is a meeting expense (6860), NOT representation (7360)
  - All 4 production runs using 7360 for Kaffemøte scored 0/10

### Branch D sandbox proof (2026-03-21, CORRECTED)
- `GET /ledger/account?number=6860&fields=id,number,name,vatType(*)` → 6860 "Møte, kurs, oppdatering o.l.", vatType.id=1 (25% incoming)
- `POST /ledger/voucher?sendToLedger=true` with amountGross=8250 (6600 NET × 1.25), vatType={id:1}, account 6860, department id
- Returned voucher #385 (booked):
  - expense posting: amount=6600 (auto-computed NET), amountGross=8250, vatType.id=1, department linked
  - bank posting: amount=-8250
  - auto-generated VAT posting: amount=1650 on account 2710
- Confirms: Kaffemøte → Branch D (6860, deductible meeting expense, 25% VAT)

### Sandbox proof: account number+name refs fail (2026-03-21)
- `account: { number: 7360, name: "Representasjon, ikke fradragsberettiget" }` (no id) → 422 "Internt felt (account): Feltet må fylles ut"
- `account: { number: 7360 }` (no id, no name) → 422 "postings.account.name: Kan ikke være null"
- Confirms: GET /ledger/account is mandatory; account.id is required on voucher postings

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
- Where `GROSS = line_amount × 1.12` for NET-priced receipts (12% statutory transport/accommodation rate), or `GROSS = line_amount` for GROSS-priced receipts
- `vatType: { id: <from account> }` = typically id=`12` (incoming 12%, lav sats) — use the value from the GET /ledger/account response
- Tripletex will auto-compute `amount` on the expense posting (net = GROSS / 1.12 = original NET line amount) and auto-generate a 3rd posting on `2712` (Inngående merverdiavgift, lav sats)
- Applies to: `Overnatting`, `Togbillett`, `Flybillett`, and other travel/accommodation lines

### Branch D — Deductible meeting/course expense
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
      "account": { "id": "<6860-id>" },
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
- `vatType: { id: 1 }` = incoming 25%
- Tripletex will auto-compute `amount` on the expense posting (net = GROSS / 1.25 = original NET line amount) and auto-generate a 3rd posting on `2710`
- Applies to: `Kaffemøte` and other internal meeting/course lines
- Sandbox-verified 2026-03-21: Kaffemøte 6600 NET → GROSS 8250, voucher #385 booked with amount=6600, amountGross=8250, auto-VAT posting 1650 on 2710
