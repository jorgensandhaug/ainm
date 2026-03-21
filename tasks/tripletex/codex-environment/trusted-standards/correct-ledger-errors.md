# Correct Ledger Errors (Review + Corrective Entries)

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- the prompt describes specific errors discovered in the general ledger for a date range
- errors include some or all of: wrong account posting, duplicate voucher, missing VAT line, incorrect amount
- prompt gives exact account numbers, amounts, and the nature of each error
- correction is via new journal entries (écritures correctives / korreksjonsbilag)

## Do Not Use This Standard If
- the task is a month-end or year-end closing (use the closing-specific playbooks instead)
- the task requires creating new entities (customers, suppliers, projects) before corrections
- the errors are in supplier invoices or customer invoices that need credit notes (use the credit note standard instead)

## Standard Flow (3 calls — combined corrective voucher)
1. `GET /ledger/account?number=<all-error-accounts>,<correction-target-accounts>&fields=id,number`
2. `GET /ledger/voucher?dateFrom=<start>&dateTo=<end>&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000`
3. `POST /ledger/voucher?sendToLedger=true` — single combined voucher with all correction lines
4. verify from the write response
5. stop

## Critical: Nested Field Expansion
- `fields=*` on `/ledger/voucher` returns postings as sparse link stubs (`{id, url}`) — account numbers are NOT included
- `fields=*` on `/ledger/posting` also returns account as sparse stub (`{id, url}`)
- to get account numbers inline, use explicit nested expansion: `postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)`
- sandbox-verified 2026-03-21: `account(id,number)` returns `{ id: 424191132, number: 6540 }` inline
- also expand `supplier(id)` because corrections on account 2400 (Leverandørgjeld) require the supplier ID

## Step Details

### Step 1: Account Lookup
```
GET /ledger/account?number=<all-needed>&fields=id,number
```
Include ALL accounts mentioned in the prompt — both the erroneous accounts AND the correction target accounts (e.g., 6860 if the prompt says 6540 was used instead of 6860).

Pre-resolving all account IDs avoids a second GET later, since correction-target accounts (like 6860) typically don't appear in any existing posting.

### Step 2: Voucher Discovery with Nested Expansion
```
GET /ledger/voucher?dateFrom=YYYY-MM-01&dateTo=YYYY-MM-01&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000
```
From this response:
- identify wrong-account and incorrect-amount vouchers by matching the stated account number plus the prompt amount on that account
- identify the duplicate by grouping vouchers on the stated account into a normalized posting-signature map and selecting the repeated signature; the prompt amount confirms the group, but do not assume two direct `amountGross` matches will always be the only safe resolver
- also use description keywords: "duplikat" (duplicate), "feil" (error), "uten MVA" (without VAT)
- extract the counterpart (contra) account **ID** and any supplier ID from the original postings — the nested expansion provides `account.id` for all counterpart accounts, so no second account lookup is needed for counterparts
- the counterpart posting is the opposite-signed posting that is NOT the prompt account and NOT account 2710
- **extract the `vatType.id` from each original expense posting** — use this exact vatType on correction lines instead of assuming vatType 1; some 7xxx accounts (e.g., 7100) are locked to vatType 0 and will 422 if forced to vatType 1
- for the missing VAT case, check whether the original voucher has a `2710` posting to distinguish "exact branch" (no 2710 at all) from "other branch" (2710 exists but VAT is too low)

### Step 3: Combined Corrective Voucher
One `POST /ledger/voucher?sendToLedger=true` with all correction lines in a single voucher.

Use the last day of the error period (or today) as the voucher date.

#### Wrong Account (reclassification)
```
{ row: N, account: { id: <wrongAcctId> }, amountGross: -<gross>, amountGrossCurrency: -<gross>, vatType: { id: <origVatTypeId> }, description: "Korreksjon: ompostering fra <wrong>" },
{ row: N+1, account: { id: <correctAcctId> }, amountGross: <gross>, amountGrossCurrency: <gross>, vatType: { id: <origVatTypeId> }, description: "Korreksjon: ompostering til <correct>" },
```
- **copy the `vatType` from the original posting** — do NOT hardcode `vatType: { id: 1 }`
- some accounts (e.g., 7100 Bilgodtgjørelse oppgavepliktig) are locked to vatType 0; using vatType 1 on them triggers a 422
- if the original posting had vatType 0, use vatType 0 on both reclassification lines
- if the original posting had vatType 1, Tripletex auto-generates matching VAT lines on 2710 that cancel each other out
- net effect: expense moves from wrong account to correct account

#### Duplicate Reversal
```
{ row: N, account: { id: <expenseAcctId> }, amountGross: -<gross>, amountGrossCurrency: -<gross>, vatType: { id: <origVatTypeId> }, description: "Korreksjon: reversering duplikat" },
{ row: N+1, account: { id: <counterpartAcctId> }, amountGross: <gross>, amountGrossCurrency: <gross>, description: "Korreksjon: reversering duplikat" },
```
- **copy the `vatType` from the original expense posting** for the reversal line
- alternative: use `PUT /ledger/voucher/{id}/:reverse?date=YYYY-MM-DD` which auto-reverses all lines — but this uses a separate API call; the combined voucher approach saves calls
- if the counterpart posting had vatType=0 (no VAT on bank), omit vatType on the counterpart line

#### Missing VAT
##### Exact branch: prompt says the VAT line is missing on `2710`
If the original voucher truly has **no** `2710` posting and the prompt amount is the expense amount **excluding VAT**, the correction is a direct VAT-line add:
```
{ row: N, account: { id: <vatAcctId> }, amountGross: <net_amount * 0.25>, amountGrossCurrency: <net_amount * 0.25>, description: "Korreksjon: manglende MVA" },
{ row: N+1, account: { id: <counterpartAcctId> }, amountGross: -<net_amount * 0.25>, amountGrossCurrency: -<net_amount * 0.25>, supplier: { id: <supplierId> }, description: "Korreksjon: manglende MVA" },
```
- example for prompt `6500`, `18350`, missing `2710`: add `2710 +4587.5` and counterpart `-4587.5`
- if counterpart is account `2400`, include `supplier: { id: ... }`
- do **not** use the expense-account-plus-`vatType` shortcut on this exact shape

##### Other branch: VAT is present but too low because net was booked as gross
When 14200 HT (net / excl. VAT) was booked as gross (VAT-inclusive) instead of net, the original entry has:
- expense account: net=11360 (=14200/1.25), gross=14200, vatType=1
- VAT (2710): 2840 (=14200-11360) — too low, should be 3550 (=14200*0.25)
- counterpart: -14200 — too low, should be -17750 (=14200*1.25)

The correction adds the difference (3550):
```
{ row: N, account: { id: <expenseAcctId> }, amountGross: 3550, amountGrossCurrency: 3550, vatType: { id: 1 }, description: "Korreksjon: manglende MVA" },
{ row: N+1, account: { id: <counterpartAcctId> }, amountGross: -3550, amountGrossCurrency: -3550, supplier: { id: <supplierId> }, description: "Korreksjon: leverandørgjeld MVA" },
```
- Tripletex auto-computes: net=2840 on expense, VAT=710 on 2710, credit=-3550 on counterpart
- after correction: expense net = 11360+2840 = 14200 ✓, VAT = 2840+710 = 3550 ✓, counterpart = -14200-3550 = -17750 ✓
- the correction amount is ALWAYS `net_amount * 0.25` (= 14200*0.25 = 3550), regardless of the incorrect VAT already on the books
- if counterpart is account 2400 (Leverandørgjeld), the `supplier: { id: ... }` field is REQUIRED — extract it from the original voucher posting

#### Incorrect Amount
```
{ row: N, account: { id: <expenseAcctId> }, amountGross: -<difference>, amountGrossCurrency: -<difference>, vatType: { id: <origVatTypeId> }, description: "Korreksjon: feil beløp" },
{ row: N+1, account: { id: <counterpartAcctId> }, amountGross: <difference>, amountGrossCurrency: <difference>, description: "Korreksjon: feil beløp" },
```
- difference = posted_gross - correct_gross (e.g., 10750 - 5500 = 5250)
- **copy the `vatType` from the original posting** — do NOT hardcode vatType 1; accounts like 7100 are locked to vatType 0
- if original had vatType 1, Tripletex auto-adjusts both net and VAT proportionally
- if original had vatType 0, the gross IS the net and no VAT adjustment is needed

## Reuse From Write Response
- from `POST /ledger/voucher`:
  - `value.id`, `value.number`
  - returned postings with amounts, including auto-generated VAT lines on 2710

## Verification
- default verification is zero extra calls after the voucher write
- the write response proves: voucher id, posting accounts, net/gross amounts, and auto-generated VAT lines
- do not add a follow-up `GET /balanceSheet` or `GET /ledger/posting` — scoring is based on actual ledger postings which are already created

## Alternative: Separate Vouchers (6 calls)
If the scorer requires separate corrective vouchers per error, use:
1. `GET /ledger/account?number=...&fields=id,number` (1 call)
2. `GET /ledger/voucher` with nested expansion (1 call)
3. `PUT /ledger/voucher/{id}/:reverse?date=...` for duplicate (1 call)
4-6. `POST /ledger/voucher` for each remaining error (3 calls)

Total: 6 calls. Use this path only if the combined approach was proven wrong by scoring.

## Known Recovery Branches
- if `GET /ledger/account` does not return a needed account number, the account does not exist; create it with `POST /ledger/account { number: <num>, name: "<name>" }` before the voucher write
- if `POST /ledger/voucher` fails with `422 postings.supplier.id` on a 2400 posting, extract the supplier ID from the original voucher's 2400 posting using the nested expansion `supplier(id)`
- if `POST /ledger/voucher` fails with `422 postings.vatType.id` saying an account is locked to mva-kode 0, re-submit with `vatType: { id: 0 }` on that account's lines — but this wastes a call; always copy vatType from the original posting to avoid this
- if `PUT /ledger/voucher/{id}/:reverse` fails (e.g., voucher type not reversible), fall back to a manual corrective POST that reverses all lines

## OpenAPI / Sandbox Status
- persistent sandbox verified 2026-03-21:
  - nested field expansion `account(id,number)` on voucher postings returns inline account data
  - `supplier(id)` expansion returns supplier ID inline on postings
  - combined 8-line corrective voucher with all 4 error corrections succeeded in a single POST
  - exact correction path stayed `3` calls after discovery: `GET /ledger/account` -> `GET /ledger/voucher` with nested expansion -> `POST /ledger/voucher` combined correction
  - 6-call path (2 GETs + 1 PUT reverse + 3 POSTs) also verified
  - `PUT /ledger/voucher/{id}/:reverse?date=2026-02-28` returned 200 with reversal voucher
  - posting to 2400 without supplier.id → 422 (`Leverandør mangler.`)
  - vatType=1 on both sides of reclassification auto-generates matching VAT lines that cancel out
  - exact no-`2710` missing-VAT proof on `6500 18350 excl. VAT` succeeded with direct `2710 +4587.5` and counterpart `-4587.5`
  - the tempting alternative `6500 +4587.5` with `vatType: { id: 1 }` was proven wrong for that exact shape: Tripletex created only `2710 +917.5` and `6500 amount=3670`, which understates VAT and overstates expense
- production run 2026-03-21 (correct-ledger-errors):
  - account 7100 (Bilgodtgjørelse oppgavepliktig) is locked to vatType 0; using vatType 1 → 422 (`Kontoen 7100 er låst til mva-kode 0`)
  - accounts 7000 and 7300 accept both vatType 0 and 1 (default vatType 1, but vatType 0 also works)
  - counterpart account IDs (1920, 2400) were available from the voucher response's nested `account(id,number)` expansion — a second `GET /ledger/account` for counterparts was unnecessary
  - missing VAT case: the 6500/24750 voucher already had a 2710 posting (4950) → "other branch" applied, not "exact branch"
  - run used 6 calls instead of ideal 3 due to: 1 redundant debug GET, 1 unnecessary account lookup, 1 avoidable 422
