# Correct Ledger Errors (General Ledger Review + Correction Vouchers)

## Task Shape
The prompt describes discovered errors in the general ledger for a specific date range and asks you to create correction vouchers. Errors typically include:
- Wrong account posting
- Duplicate voucher
- Missing VAT line
- Incorrect amount

The prompt gives exact account numbers, amounts, and the nature of each error.

## Proven Minimum Path: 6 API Calls

### Call 1: Discover all vouchers in the date range
```
GET /ledger/voucher?dateFrom=YYYY-MM-01&dateTo=YYYY-MM-01&fields=*,postings(*,account(*),vatType(*))&count=1000
```
**CRITICAL**: `fields=*` alone returns account as a sparse link object (just `id` and `url`, no `number` or `name`). You MUST use `fields=*,postings(*,account(*),vatType(*))` to expand nested account data on voucher postings. Without this expansion, all account numbers will be `undefined` and you cannot identify any errors.

From this response:
- Build an account cache `Map<number, {id, number, name}>` from all postings
- Identify each error voucher by matching account numbers and amounts
- For duplicates: find two vouchers with the same account+amount pattern on the error account; the later one (by ID) or the one with "duplikat" in description is the duplicate
- For missing VAT: find the voucher on the expense account with no 2710 posting
- For each error voucher, record the contra account (the posting with negative amountGross)

### Call 2: Fetch accounts not in cache
Collect account numbers mentioned in the prompt that were NOT found in the voucher postings (typically the "correct" account and the VAT account).
```
GET /ledger/account?number=7000,2710&fields=*
```
The prompt gives the correct account numbers. Accounts already seen in voucher postings don't need re-fetching.

### Call 3: Reverse the duplicate voucher
```
PUT /ledger/voucher/{duplicateVoucherId}/:reverse?date=YYYY-MM-DD
```
Use the run date (today's date) as the reversal date. The `date` query parameter is required.

### Call 4: Correction for wrong account
Create a balanced voucher that credits the wrong account and debits the correct account:
```
POST /ledger/voucher?sendToLedger=true
{
  date: "<run-date>",
  description: "Korreksjon: <description> feil konto <wrong>→<correct>",
  postings: [
    { account: { id: <correctAccountId> }, amountGross: <amount>, amountGrossCurrency: <amount>, row: 1 },
    { account: { id: <wrongAccountId> }, amountGross: -<amount>, amountGrossCurrency: -<amount>, row: 2 }
  ]
}
```

### Call 5: Correction for missing VAT
Calculate VAT = net_amount * 0.25 (standard Norwegian rate). Create a balanced voucher:
```
POST /ledger/voucher?sendToLedger=true
{
  date: "<run-date>",
  description: "Korreksjon: Manglende MVA",
  postings: [
    { account: { id: <2710_account_id> }, amountGross: <vatAmount>, amountGrossCurrency: <vatAmount>, row: 1 },
    { account: { id: <contraAccountId> }, amountGross: -<vatAmount>, amountGrossCurrency: -<vatAmount>, row: 2 }
  ]
}
```
The contra account comes from the original error voucher's balancing line (the posting with negative amountGross that is not the expense account).

### Call 6: Correction for incorrect amount
Calculate difference = posted_amount - correct_amount. Create a balanced voucher:
```
POST /ledger/voucher?sendToLedger=true
{
  date: "<run-date>",
  description: "Korreksjon: <description> feil beløp <posted>→<correct>",
  postings: [
    { account: { id: <expenseAccountId> }, amountGross: -<difference>, amountGrossCurrency: -<difference>, row: 1 },
    { account: { id: <contraAccountId> }, amountGross: <difference>, amountGrossCurrency: <difference>, row: 2 }
  ]
}
```

## Critical Pitfalls
1. **`fields=*` does NOT expand nested objects**: On `/ledger/posting` and `/ledger/voucher`, `fields=*` returns nested objects (account, vatType, voucher) as sparse link stubs. Always use `fields=*,account(*)` on postings or `fields=*,postings(*,account(*),vatType(*))` on vouchers. Production task 24 scored 0 because of this.
2. **Account IDs required**: `POST /ledger/voucher` with `account: { number: 7000 }` fails with `422 postings.account.name: Kan ikke være null.` — always resolve account IDs first.
3. **Row values required**: All postings MUST have explicit `row: 1`, `row: 2`, etc. Row 0 is system-reserved.
4. **`dateTo` is exclusive**: `dateTo=2026-03-01` means up to and excluding March 1st (i.e., includes all of February).
5. **Date on reverse is required**: `PUT /ledger/voucher/{id}/:reverse` requires `?date=YYYY-MM-DD`.
6. **Account 2400 requires supplier**: Postings on account 2400 (Leverandørgjeld) require `supplier: { id: ... }`. If the original error voucher used 2400 as contra, the correction voucher on 2400 also needs the supplier reference from the original posting.

## Sandbox Proof
- 2026-03-21 persistent sandbox confirmed the full 6-call flow with zero 4xx errors
- Setup: 4 error vouchers created, then 6-call correction flow executed successfully
- `PUT /ledger/voucher/{id}/:reverse?date=2026-03-21` returned 200 with the new reversal voucher
- All 3 correction `POST /ledger/voucher` calls returned 201
