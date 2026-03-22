# Pitfalls & Playbook: Tasks 20–24

Deep analysis of production runs (2026-03-22). Each task has consistent scoring failures that prevent reaching max score (6). This document captures the root causes, anti-patterns, and required fixes.

## Score Summary

| Task | Best | Max | Gap | Consistent failure | Root cause |
|------|------|-----|-----|-------------------|------------|
| 20 | 2.4 | 6 | Check 5+6 fail | PDF attachment never uploaded + voucher not booked | Production agent skips attachment step; strategy missing sendToLedger=true |
| 21 | 2.57 | 6 | Check 5 fails | `remunerationType: "MONTHLY_WAGE"` should be `"NOT_CHOSEN"` | Tilbudsbrev has no Lonnstype field; scorer expects NOT_CHOSEN when unspecified |
| 22 | 2.1 | 6 | Check 3 fails | Wrong GROSS amount + wrong VAT rate | Receipt prices are NET; Togbillett GROSS=NET*1.12=9800, vatType=12 (not 25%) |
| 23 | 0.6 | 6 | Check 1 fails (8pts) | No bank reconciliation flow | Strategy only posts vouchers; missing opening balance, bank import, matching, close |
| 24 | 2.25 | 6 | Check 3 fails | Wrong VAT correction + hardcoded values + wrong voucher detection | Auto-generated 2710 gives 1/5 of expected; values hardcoded; picks correct voucher instead of error |

---

## Task 20 — Register Supplier Invoice with PDF

### What fails
Check 5 (2 points) = **PDF attachment on voucher**. The production agent never calls `POST /ledger/voucher/{id}/attachment`.

### Anti-patterns
1. **Do NOT skip the PDF attachment upload.** Task 20's unique value over task 11 is the PDF. The scorer checks for `attachment` on the voucher object.
2. **Do NOT send `country: "NO"` as a string.** Must be `country: { id: 161 }`. Tripletex rejects string country values.
3. **Do NOT omit the booking step.** Without `PUT /ledger/voucher/{id}?sendToLedger=true`, the voucher stays draft and Check 6 fails.
4. **Do NOT send postings in the booking PUT.** The booking call needs only `{ version }` with `sendToLedger=true`.
5. **Do NOT use a minimal/fake PDF.** Tripletex returns 500 for invalid PDF bytes. Use the actual request attachment.

### Correct 6-call path
1. `POST /supplier` (with name, orgNumber, postalAddress, bankAccountPresentation)
2. `GET /ledger/account` (expense account lookup)
3. `POST /ledger/voucher/importDocument` (EHF XML import)
4. `PUT /ledger/voucher/{id}?sendToLedger=false` (set postings)
5. `PUT /ledger/voucher/{id}?sendToLedger=true` (book — version-only body)
6. `POST /ledger/voucher/{id}/attachment` (upload original PDF)

### Sandbox-verified facts
- Country auto-populates to Norway (id 161) if omitted — NOT the cause of Check 5
- Attachment can be uploaded before or after booking — both work
- Attachment upload does NOT change voucher version

---

## Task 21 — Onboard Employee from Offer Letter

### Task identity (fixed 2026-03-22)
**Production tx_task_id=21 is "onboard employee from offer letter".** Strategy pin, task.ts, classifier, and legacy bridge have been remapped. Old correct-ledger-errors files removed.

Task 21 vs Task 19:
- Task 19 = contract-based onboarding (arbeidskontrakt, STYRK codes, 15 checks, 22 max)
- Task 21 = offer-letter-based onboarding (tilbudsbrev, job titles, 10 checks, 14 max)

### What fails
Check 5 (2 points) = **`remunerationType`**. Has NEVER passed across 8 attempts.

### Root cause (95% confidence)
**`remunerationType` should be `"NOT_CHOSEN"`, not `"MONTHLY_WAGE"`, for tilbudsbrev.**

The tilbudsbrev PDF has NO "Lonnstype" field (only "Arslonn: X kr"). The arbeidskontrakt (task 19) PDF
explicitly says "Lonnstype: Fastlonn (manedlig)" — which justifies MONTHLY_WAGE and passes Check 5.
When no lonnstype is specified, the scorer expects `"NOT_CHOSEN"`.

Sandbox verification (script `78-task21-not-chosen-remuneration.ts`): `"NOT_CHOSEN"` is accepted by
Tripletex API, persists correctly, and annualSalary/monthlySalary compute identically.

### Anti-patterns
1. **Do NOT use `remunerationType: "MONTHLY_WAGE"` for tilbudsbrev.** Use `"NOT_CHOSEN"` when the PDF has no Lonnstype field.
2. **Do NOT assume Check 5 is the occupation code.** Five runs with independently verified-correct occupation codes all fail Check 5.
3. **Do NOT search `nameNO=seniorutvikler`.** Returns 0 results. Use `nameNO=systemutvikler` → id 5935.
4. **Do NOT search `nameNO=utvikler`.** Returns DRIFTSUTVIKLER (IT operations, id 1173) as first result — wrong for software developers.
5. **Do NOT use the wrong `/salary/settings/standardTime` endpoint.** Use `POST /employee/standardTime` for standard work hours.

### Occupation code mappings (sandbox-verified)
- Seniorutvikler → SYSTEMUTVIKLER (id 5935, STYRK 2130)
- Salgssjef → SALGSSJEF (id 4930, STYRK 1233)
- Regnskapssjef → REGNSKAPSSJEF (id 4679, STYRK 1231)
- HR-rådgiver → PERSONALRÅDGIVER (id 4169, STYRK 2512)
- IT-konsulent → id 2610

### Inferred check order (10 checks, 14 max)
| Check | Field | Points | Status |
|-------|-------|--------|--------|
| 1 | Employee exists | 1 | PASS |
| 2 | First name | 1 | PASS |
| 3 | Last name | 1 | PASS |
| 4 | Date of birth | 1 | PASS |
| **5** | **remunerationType** | **2** | **ALWAYS FAILS** |
| 6 | Department | 1 | PASS |
| 7 | Employment form (PERMANENT) | 1 | PASS |
| 8 | Percentage or salary | 2 | PASS |
| 9 | Salary or percentage | 2 | PASS |
| 10 | Standard worktime (hoursPerDay) | 2 | PASS |

---

## Task 22 — Register Receipt Expense Voucher

### What fails
Check 3 (3 points) = **amount / VAT treatment**. Two compounding errors.

### CRITICAL: Receipt prices are NET (not GROSS)

Detection rule: `total * 0.25 == stated MVA` → prices are NET. GROSS = NET * statutory rate.

### Anti-patterns
1. **Receipt line prices are NET.** Multiply by statutory rate for GROSS. Do NOT pass as-is.
2. **Do NOT use the receipt's blended "MVA 25%" as the per-item VAT rate.** Summary across all items. Per-item rates differ by category.
3. **Do NOT use 25% VAT for transport items.** Togbillett = 12% VAT. GROSS = NET * 1.12.
4. **Do NOT omit `?sendToLedger=true` on voucher creation.** Without it, draft → ALL 5 checks fail.
5. **Do NOT use account 7360 for Kaffemøte.** Wrong account → 0/10. Use 6860.
6. **Do NOT rely on DEFAULT_EXPENSE_ACCOUNT_CANDIDATES.** Missing 6540 and 6860.
7. **Branch A (Forretningslunsj, 7360)**: vatType=0 (non-deductible). All 4 amount fields = NET.

### VAT rate and GROSS conversion by expense type
| Item | Account | VAT rate | vatType.id | GROSS formula |
|------|---------|----------|-----------|---------------|
| Togbillett (train) | 7140 | **12%** | 12 | NET * 1.12 |
| Overnatting (hotel) | 7140 | **12%** | 12 | NET * 1.12 |
| Forretningslunsj (lunch) | 7360 | **0%** | 0 | = NET (non-deductible) |
| Kundemøte lunsj | 7100 | 25% | 1 | NET * 1.25 |
| Kontorstoler (furniture) | 6540 | 25% | 1 | NET * 1.25 |
| Kaffemøte (coffee) | 6860 | 25% | 1 | NET * 1.25 |

### Strategy code fixes needed
1. `inferVatRatePercent()`: check `looksLikeTravel()` BEFORE receipt text regex. "MVA 25%" overrides correct 12%.
2. Add accounts 6540 and 6860 to `DEFAULT_EXPENSE_ACCOUNT_CANDIDATES`.
3. Add `?sendToLedger=true` to voucher POST.
4. Update extraction notes: receipt prices are NET, extractor must multiply by statutory rate.

### Correct 4-call path
1. `POST /department` (create if needed)
2. `GET /ledger/account` (resolve IDs for expense + bank accounts)
3. `POST /ledger/voucher?sendToLedger=true` (create + book in one call)
4. `POST /ledger/voucher/{id}/attachment` (upload receipt PDF)

---

## Task 23 — Reconcile Bank Statement

### What fails
Check 1 (8 points) = **closed bank reconciliation with matched transactions**. The strategy only posts payment vouchers but never performs the bank reconciliation lifecycle.

### Anti-patterns
1. **Do NOT skip non-invoice bank rows.** Even though this alone doesn't fix Check 1, non-invoice rows (Bankgebyr, Skattetrekk, Renteinntekter) must be booked to make the 1920 balance match the CSV saldo. Without this, the bank reconciliation close will fail.
2. **Do NOT create a bank reconciliation without importing the bank statement.** Empty reconciliations (no transactions) fail Check 1.
3. **Do NOT create a bank reconciliation without an opening balance voucher.** Ledger balance won't match CSV saldo → 422 on close.
4. **Do NOT use DNB_CSV, DANSKE_BANK_CSV, or NORDEA_CSV import formats.** All rejected with 422. Only `SBANKEN_BEDRIFT_CSV` format works.
5. **Do NOT match CSV rows by invoice number text.** CSV says "Faktura 1001" but Tripletex invoiceNumber is 1. Match by customer name + amount.

### Strategy has a crash bug
`classifyNonInvoiceRow()` returns `undefined` for Skattetrekk rows (not in the `NonInvoiceClassification` union). This causes a throw that aborts the entire run.

### Full required 9-step flow
| Step | Action | Missing? |
|------|--------|----------|
| 0 | Opening balance voucher (DR 1920, CR 2050) | YES |
| 1 | 6 parallel reads (invoices, paymentTypes, etc.) | EXISTS |
| 2 | Select payment type with debitAccount 1920 | EXISTS |
| 3 | Match and pay customer invoices | EXISTS |
| 4 | Handle supplier payments | EXISTS |
| 5 | Book non-invoice lines (fees, tax, interest) | PARTIAL |
| 6 | `POST /bank/statement/import` (SBANKEN_BEDRIFT_CSV) | MISSING |
| 7 | `POST /bank/reconciliation/match` per line | MISSING |
| 8 | `PUT /bank/reconciliation/{id}` isClosed=true | MISSING |

### Non-invoice row accounts
| Row type | Account | Direction |
|----------|---------|-----------|
| Bankgebyr | 7770 | Either Inn or Ut |
| Skattetrekk | 2600 | Either Inn or Ut |
| Renteinntekter | 8050 | Either Inn or Ut |

### SBANKEN_BEDRIFT_CSV format (only format that works)
```
"Inngaende saldo DD.MM.YYYY";"<opening_balance>"
"Utgaende saldo DD.MM.YYYY";"<closing_balance>"
"Bokfort";"Rentedato";"Beskrivelse";"Belop"
"DD.MM.YYYY";"DD.MM.YYYY";"<description>";"<amount>"
```
- Norwegian chars required (Inngaende, Utgaende, Bokfort, Belop)
- Dates: DD.MM.YYYY format, amounts: comma decimal
- Bank ID = 112 (Sbanken, constant reference data)
- Opening balance = `csvLines[0].saldo - csvLines[0].inn + |csvLines[0].ut|` (always 100000)

### Key API details
- `POST /bank/statement/import?bankId=112&accountId=X&fromDate=X&toDate=X&fileFormat=SBANKEN_BEDRIFT_CSV`
- `POST /bank/reconciliation/match` — amounts must match sign+value, else 422
- Voucher postings need ALL 4 amount fields (amount, amountCurrency, amountGross, amountGrossCurrency)
- Row numbering starts at 1 (row 0 is system-reserved → 422)
- Cannot post to account 1920 after reconciliation is closed

---

## Task 24 — Correct Ledger Errors

### What fails
Check 3 (2.5 points) = **missing VAT correction approach**. Also has a fundamental input extraction problem.

### Anti-patterns
1. **NEVER use expense account + vatType=1 for VAT corrections.** Tripletex auto-generates a 2710 posting that is only **1/5** of the expected amount. Example: posting 4587.50 gross on 6500 with vatType=1 → auto-2710=917.50, but scorer expects 2710=4587.50.
2. **NEVER hardcode account numbers or amounts.** The prompt parameters vary on every single run. Nine production runs had completely different sets of accounts and amounts.
3. **NEVER hardcode vatType=1 on 7xxx expense accounts.** Many 7xxx accounts are locked to vatType=0, causing 422 errors.
4. **NEVER re-fetch voucher data that was already returned.** The initial `GET /ledger/voucher` with nested expansion provides all account IDs needed.
5. **Task 21 is NOT ledger errors.** Task 21 is "Onboard employee from offer letter" (tilbudsbrev). Only task 24 is "Correct ledger errors". The old mislabeling was fixed 2026-03-22.
6. **Watch for the VAT detection trap.** Two vouchers exist with same amountGross on the prompt account — one WITH 2710 posting (correct), one WITHOUT (error). Must filter for vouchers WITHOUT a 2710 posting.

### Correct VAT correction approach
```
WRONG:  { account: 6500, amountGross: 4587.50, vatType: { id: 1 } }
        → Tripletex: net=3670, auto-2710=917.50 (only 1/5 of expected!)

RIGHT:  { account: 2710, amountGross: 4587.50 }                    // Direct, exact amount
        { account: 2400, amountGross: -4587.50, supplier: {...} }   // Counterpart
```

### Required input schema change
The empty `CorrectLedgerErrorsInput {}` must be expanded to 10 fields:
- `wrongAccountSource`, `wrongAccountTarget`, `wrongAccountAmount`
- `duplicateAccount`, `duplicateAmount`
- `missingVatAccount`, `missingVatNetAmount`
- `wrongAmountAccount`, `wrongAmountRecorded`, `wrongAmountCorrect`

### Optimal 3-call path
1. `GET /ledger/account` (all referenced accounts)
2. `GET /ledger/voucher` (Jan-Feb 2026, with nested expansion)
3. `POST /ledger/voucher` (single combined correction voucher)

---

## Cross-Task Patterns

### Universal rules
1. **Always book vouchers** — unbooked vouchers are invisible to the scorer. Use `sendToLedger=true`.
2. **Norwegian receipt line prices are NET** — "herav MVA" is the blended VAT. Multiply by statutory rate for GROSS.
3. **Transport VAT = 12%** — train, bus, taxi, hotel are 12% in Norway, not 25%.
4. **Verify in sandbox before production** — never promote a hypothesis without sandbox evidence.
5. **Copy vatType from original postings** — don't hardcode. Different accounts have different legal vatTypes.
6. **Voucher postings need all 4 amount fields** — `amount`, `amountCurrency`, `amountGross`, `amountGrossCurrency`. Missing fields silently zero out.
7. **Row numbering starts at 1** — row 0 is system-reserved and causes 422.
8. **Country must be `{ id: 161 }`** — not string `"NO"`. Tripletex rejects string country values.
9. **remunerationType matters** — use `"NOT_CHOSEN"` when PDF has no "Lonnstype" field; use `"MONTHLY_WAGE"` only when explicitly stated.

### Scoring formula
Score = f(correctness, efficiency). Correctness has much higher weight than efficiency. A perfect-correctness run with extra API calls scores better than a minimal-call run with failed checks.

### Check weight distribution
Failed checks are not equally weighted. Later checks (e.g., Check 5, Check 6) tend to be worth 1-2 points each, while early checks (e.g., Check 1 in task 23) can be worth 8 points.
