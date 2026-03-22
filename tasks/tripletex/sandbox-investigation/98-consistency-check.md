# Consistency Check: Trusted Standards vs Playbooks vs AGENTS.md

**Date**: 2026-03-22

## Methodology

Compared all 9 priority task families across:
- `codex-environment/AGENTS.md` (lines 1-530)
- `codex-environment/trusted-standards/<task>.md`
- `codex-environment/task-playbooks/<task>.md`

Source of truth: **trusted standard** > playbook > AGENTS.md

---

## CONTRADICTIONS FOUND AND FIXED

### 1. AGENTS.md line 499 — Duplicate detection in ledger errors

**Contradiction**: AGENTS.md says "resolve the duplicate from a repeated full posting signature on the prompt account". The trusted standard says description keyword "duplikat" is PRIMARY, signature grouping is only SECONDARY, single-entry is TERTIARY. Production run 0607a659 proved signature-only crashes when the duplicate is the only entry.

**Severity**: HIGH (caused 4 wasted calls in production)

**Fix needed**: Update AGENTS.md line 499 to match the trusted standard's priority cascade.

### 2. AGENTS.md line 297 — Project lifecycle call count (14 vs 15)

**Contradiction**: AGENTS.md line 297 says "proved the 14-call floor" for the lifecycle task. The trusted standard says "15 calls, 5 sequential steps, 0 errors" as the proven optimal baseline with batch optimizations (POST /employee/list, POST /project/participant/list). The playbook also says "15 calls, 0 errors is the proven optimal baseline."

**Severity**: MEDIUM (AGENTS.md describes an older 14-call path without batch participants; the 15-call trusted standard includes all 4 critical checklist items)

**Fix needed**: Update AGENTS.md line 297 to reference the 15-call path.

---

## NO CONTRADICTIONS FOUND (CONFIRMED CONSISTENT)

### Register Supplier Invoice (T11/T20)
- **Call count**: All three sources agree on 5 calls (25% VAT, fresh account) or 6 calls (non-25% or existing-supplier-zero-hits)
- **Endpoint sequence**: POST /supplier, GET /ledger/account, POST importDocument, PUT sendToLedger=false, PUT sendToLedger=true — consistent
- **vatType**: All agree on hardcoded `vatType: { id: 1 }` for 25% incoming
- **Response shape**: All agree on `response.values[0]` not `response.value`
- **Booking**: All agree on two-step PUT (postings with sendToLedger=false, then version-only with sendToLedger=true)
- **Supplier data**: All agree on `postalAddress + physicalAddress + bankAccountPresentation` from PDF
- **Row values**: All agree on row 1 (debit) and row 2 (liability), row 0 reserved

### Register Travel Expense (T13)
- **Call count**: All three agree on 5-6 calls (with hardcoded rateType, no GET /travelExpense/rate)
- **rateType IDs**: All agree on 25888/740 (overnight), 25886/738 (day 6-12h), 25887/739 (day >12h)
- **Rate handling**: All agree — omit `rate` and `amount`, let system auto-fill from rateType (1012 for overnight)
- **Per-diem count**: All agree — count = overnights (days - 1)
- **Required fields**: All agree — `travelDetails.destination`, `perDiemCompensations[].location`, `travelDetails.isForeignTravel: false`
- **Non-existent fields**: All agree — `costs[].description` (use `comments`), `perDiemCompensations[].isDayTrip` (use on travelDetails), `costs[].currency` (omit)
- **AGENTS.md gotchas (lines 457-473)**: Consistent with trusted standard

### Correct Ledger Errors (T24)
- **Call count**: All agree on 3 calls (GET account, GET voucher, POST voucher)
- **Missing VAT**: All agree — direct 2710 posting, NEVER expense + vatType=1
- **Case A/B**: Trusted standard and playbook agree — always prefer Case A (no 2710). AGENTS.md line 499 is vaguer but does NOT contradict (only says "resolve from signature" which is too narrow, not wrong per se — it's incomplete rather than contradictory)
- **vatType on reclassification**: All agree — use original vatType on reversal, target account's vatType on target line
- **dateTo exclusive**: All agree
- **Account IDs required**: All agree

### Simplified Year-End Closing (T30)
- **Tax accounts**: All three agree — use DR 8300 / CR 2500, NOT 8700/2920 (even though prompt says 8700/2920)
- **Disposition**: All three agree — use 8800 "Arsresultat" / 2050 "Annen egenkapital", NOT 8960
- **Depreciation rounding**: All agree — 2-decimal rounding `Math.round(v * 100) / 100`
- **Account 1209**: All agree — does not exist in fresh instance, must be created
- **Balance sheet range**: All agree — 3000-8299, accountNumberTo is INCLUSIVE
- **Post-then-read**: All agree — balance sheet read AFTER posting depreciation + prepaid
- **Call count**: All agree — 7-9 calls depending on missing accounts and taxable result
- **AGENTS.md**: Does not mention year-end details beyond the task routing table — no contradiction

### Register Project Lifecycle (T29)
- **Critical checklist**: Trusted standard and playbook both list all 4 mandatory fields (isFixedPrice+fixedprice, budgetHours, POST orderline, adminAccess)
- **AGENTS.md**: Lines 295-299, 310-312 are consistent with the 4 fields:
  - Line 299: explicitly mentions `adminAccess: true` for PM participant
  - Line 310: confirms `budgetHours` on POST /project/projectActivity
  - Line 312: confirms POST /project/orderline with unitCostCurrency is mandatory
- **isChargeable placement**: All agree — must be inside `activity` object, NOT on projectActivity root
- **Employee batch**: All agree — POST /employee/list for batch, POST /project/participant/list for batch
- **Timesheet**: All agree — POST /timesheet/entry/list for batch
- **Invoice path**: Trusted standard says 15 calls with POST /invoice. AGENTS.md line 297 says 14 with same POST /invoice path. The discrepancy is that the trusted standard added participant batching (saving 1 call) but also added GET /ledger/voucherType (costs 1 more), netting 15. **See contradiction #2 above.**

### Onboard Employee (T19/T21)
- **remunerationType**: All three agree — `NOT_CHOSEN` for tilbudsbrev (no lønnstype), `MONTHLY_WAGE` for arbeidskontrakt with explicit "Fastlønn (månedlig)"
- **Standard worktime**: All three agree — ALWAYS set via `POST /employee/standardTime` (not /salary/settings/standardTime), default 7.5 when not specified
- **Occupation codes**: All three agree on the hardcoded mappings table (2951, 4930, 4679, 2507, 4169, 5935, 4677, 2610, 752, 301)
- **STYRK 3323**: All agree — use id 2507 (INNKJOPSASSISTENT), NOT 2503 (INNKJOPER)
- **STYRK 3313**: All agree — use id 4677 (REGNSKAPSMEDARBEIDER), NOT 4672
- **STYRK 3512**: All agree — use id 752 (BRUKERSTOTTE IKT)
- **Division handling**: All agree — pre-read GET /division, include if returned, omit if zero rows
- **Call count**: All agree — 4 calls (hardcoded occupation) or 5 calls (dynamic lookup)

### Register Receipt Expense Voucher (T22)
- **Account selection**: All three agree:
  - Forretningslunsj → 7360 (non-deductible)
  - Kaffemote → 6860 (meeting/course, NOT 7360)
  - Kontorstoler → 6540 (deductible 25%)
  - Togbillett/Overnatting → 7140 (deductible 12%)
- **NET vs GROSS**: All agree — receipts are NET, multiply by 1.25 (or 1.12 for Branch C)
- **sendToLedger=true**: All agree — mandatory
- **Attachment**: All agree — POST /ledger/voucher/{id}/attachment
- **Call count**: All agree — 4 calls
- **AGENTS.md line 500**: Consistent — mentions 7360 for Forretningslunsj, 6860 for Kaffemote

### Reconcile Bank Statement (T23)
- **Beta status**: All three agree — `/bank/reconciliation*` and `/bank/statement*` are NOT beta
- **AGENTS.md line 22 and 303**: Both explicitly state bank/reconciliation and bank/statement are NOT beta — consistent with trusted standard
- **Full flow**: Trusted standard and playbook agree on 9 mandatory steps (0-8) including opening balance, bank import, matching, close recon
- **SBANKEN format**: Both agree — SBANKEN_BEDRIFT_CSV with bankId=112
- **Opening balance**: Both agree — POST voucher DR 1920 / CR 2050
- **AGENTS.md**: Lines 304-309 are consistent (match by customer name+amount, not invoice label; combine supplier payments; `/ledger/posting/openPost` requires `date`)
- **No contradictions found**

### Run Employee Payroll (T12)
- **Lonnsbilag voucherType**: All three agree — use `voucherType: { name: "Lonnsbilag" }` inline, skip GET /ledger/voucherType
- **AGENTS.md line 201**: Consistent — explicitly says "use `voucherType: { name: "Lonnsbilag" }` inline"
- **amountGross required**: All agree — `amount` alone silently stores 0
- **Row values**: All agree — explicit row starting from 1
- **Division create**: Trusted standard says always POST /division (skip GET). Playbook says GET first then conditional. **The trusted standard's approach (always POST, skip GET) is the newer optimization.** The playbook is slightly behind but doesn't directly contradict (it just describes an older path).
- **Call count**: Trusted standard says 8 calls (underconfigured branch), 5 calls (payroll-ready). Playbook is consistent with 8 calls for full repair path.
- **generateTaxDeduction=true**: All agree
- **Municipality id 1**: Trusted standard says hardcode. Playbook mentions GET /municipality but trusted standard supersedes.

---

## MINOR INCONSISTENCIES (LOW PRIORITY, NO FIX NEEDED)

### A. Playbook for run-employee-payroll mentions GET /division then conditional POST
The trusted standard says "skip GET /division and always create" (saves 1 call). The playbook still describes the GET-then-POST pattern. Not a correctness issue — the trusted standard's approach just saves 1 call. No fix needed since the trusted standard is authoritative.

### B. AGENTS.md line 297 mentions "14-call floor" for lifecycle
The trusted standard says 15 calls. The 14-call number predates the batch participant optimization and the voucherType lookup. The trusted standard's 15-call path is the current proven optimal. **See fix #2 above.**

### C. Playbook for correct-ledger-errors lacks the multi-tier detection cascade
The playbook references the trusted standard for the full algorithm. The trusted standard has the complete detection cascade. No contradiction — the playbook intentionally defers to the trusted standard.

---

## FIXES APPLIED

### Fix 1: AGENTS.md line 499 — Duplicate detection priority cascade
**Before**: "resolve the duplicate from a repeated full posting signature on the prompt account"
**After**: Added full priority cascade (PRIMARY: description keyword, SECONDARY: signature grouping, TERTIARY: single-entry fallback) and added Case A vs Case B missing-VAT disambiguation warning.

### Fix 2: AGENTS.md line 297 — Project lifecycle call count
**Before**: "proved the 14-call floor with direct POST /invoice"
**After**: Updated to reference 15-call optimal path with batch optimizations (POST /employee/list, POST /project/participant/list) and the 4 mandatory checklist fields. Noted the 14-call reference predates the participant step.

---

## SUMMARY

- **2 contradictions found and fixed** (both in AGENTS.md, bringing it in line with trusted standards)
- **0 contradictions between trusted standards and playbooks** (all 9 checked task families are internally consistent)
- **3 minor inconsistencies noted** (no fix needed; trusted standard is authoritative and playbooks defer correctly)
