# Classifier Template — Ready-to-Collapse into AGENTS.md

> This document is the **directly actionable** companion to `task-cards.md` and
> `family-map.md`. It is structured to be collapsed into (or cited by) the live
> `codex-environment/AGENTS.md` classifier section without further prose editing.
>
> **Label-offset hazard:** The legacy `tasks/tripletex/data/prompt-task-labels.jsonl`
> corpus uses an OLD task ID namespace that does NOT match canonical Tripletex2 IDs.
> Confirmed mismatches (old → new): 01→06, 02→01, 03→04, 04→02, 14→10, 17→07, and
> more throughout 01–17. Do NOT use raw legacy `tx_task_id` values as training labels
> or runtime references. Always remap via semantic content analysis. This file uses
> canonical Tripletex2 IDs throughout.

---

## Section A — Task Universe (paste verbatim into AGENTS.md)

```
TASK UNIVERSE (canonical Tripletex2 IDs):
01  Create customer
02  Create supplier
03  Create department (batch, typically 3 names)
04  Create product (with product number + VAT rate)
05  Create project (link customer + assign PM by email)
06  Create employee (name, birthdate, email, start date)
07  Create accounting dimension and post voucher
08  Create and send invoice (single-line, embedded send)
09  Create customer invoice (multi-line, mixed VAT, no send)
10  Issue full credit note (complaint → reverse entire invoice)
11  Create order → invoice → register payment (combined)
12  Run payroll with bonus (base salary + one-time bonus)
13  Register travel expense (per diem + itemized costs)
14  Set project fixed price and invoice milestone (percentage)
15  Register project hours and create project invoice
16  Register supplier invoice (text-based, invoice number given)
17  Register customer invoice payment (full, NOK)
18  Reverse customer invoice payment (bank return)
19  Onboard employee from contract (PDF attachment)
20  Register supplier invoice from PDF attachment
21  Correct ledger errors — implicit scan (runtime discovers which errors)
22  Register receipt expense voucher (receipt attachment, department)
23  Reconcile bank statement (CSV attachment → match to open invoices)
24  Correct ledger errors — explicit listing (4 error specs in prompt)
25  Overdue reminder fee + partial payment (fixed: 50 NOK fee, 5000 NOK payment)
26  Month-end closing (accruals + monthly depreciation + salary provision)
27  Register foreign-currency payment with exchange gain (EUR + two rates)
28  Analyze expense increase → create internal projects (Jan vs Feb 2026)
29  Full project lifecycle (4 steps: budget + 2-employee hours + supplier + invoice)
30  Simplified year-end closing (3 assets + prepaid reversal + 22% tax, year 2025)
```

---

## Section B — Family Router (paste verbatim, use as classifier mental model)

```
STEP 1 — ATTACHMENT CHECK (hard gate, apply first):
  "see attached PDF" / "vedlagt PDF" / "PDF ci-joint" / "PDF adjunto":
    → PDF + employment contract/offer letter     → TASK 19
    → PDF + supplier invoice                    → TASK 20
  "vedlagt CSV" / "attached CSV" / "bank statement (attached)":  → TASK 23
  "from this receipt" / receipt implied + department mentioned:  → TASK 22

STEP 2 — HIGH-CONFIDENCE SINGLE SIGNALS:
  "returned by bank" / "returnert av banken" / "retourné par la banque"  → TASK 18
  "EUR" + two exchange rates (invoice rate + payment rate)               → TASK 27
  "bank statement" / "bankutskrift" + CSV matching                      → TASK 23
  "create AND send" / "opprett og send" / "crie e envie" (invoice)       → TASK 08
  "three product lines" + product numbers + mixed VAT (25%+15%+0%)       → TASK 09
  "order/Auftrag/commande" + "convert to invoice" + "register payment"   → TASK 11
  "complained/reklamiert/réclamé/reklamert" + "credit note/Gutschrift"   → TASK 10
  "fixed price/fastpris/Festpreis/prix forfaitaire/preço fixo"           → TASK 14
  "register N hours for [employee] on [activity]" (single employee)      → TASK 15
  4 numbered lifecycle steps: budget + hours + supplier cost + invoice    → TASK 29
  "salary/payroll/lønn/salário/Gehalt/nómina" + NOK amounts              → TASK 12
  "travel expense/Reisekostenabrechnung/reiserekning" + N days + per diem → TASK 13
  "overdue/forfalt/vencida" + "reminder fee/purregebyr"                  → TASK 25
  "INV-2026-XXXX" + account number in text, no attachment                → TASK 16
  "accounting dimension/fri regnskapsdimensjon" + post voucher to it     → TASK 07
  "largest increase" + "January to February" + "internal project"        → TASK 28
  "year-end/årsoppgjør" + year 2025 + 3 named assets + 22% tax          → TASK 30
  "month-end/månedsavslutning" + monthly depreciation + salary provision → TASK 26

STEP 3 — ENTITY CREATION (all data inline, no attachment, no financial ops):
  customer / kunden / client / cliente (org number + email)              → TASK 01
  supplier / leverandør / Lieferant / fournisseur / proveedor (org + email) → TASK 02
  department(s) / avdeling(er) / Abteilung(en) (list of names)          → TASK 03
  product / produkt + product number + price + VAT%                     → TASK 04
  project / prosjekt + customer org + PM email (NO financial ops)        → TASK 05
  new employee + birthdate + email + start date (NO attachment)          → TASK 06

STEP 4 — LEDGER ERROR CORRECTION:
  Errors in Jan-Feb 2026 ledger + explicit 4-error spec WITH account
  numbers and NOK amounts for EACH of the 4 errors                     → TASK 24
  Errors in Jan-Feb 2026 ledger, errors described generically or
  by type only (no per-error account numbers in prompt)                 → TASK 21

STEP 5 — SIMPLE PAYMENT (after ruling out 18, 25, 27):
  Outstanding invoice, register full payment, NOK, no FX               → TASK 17

STEP 6 — FALL THROUGH:
  Re-read prompt for secondary signals.
  If still ambiguous after STEPS 1-5: default to TASK 09 (structurally
  rich, fails gracefully, closest to "generic invoice" intent).
```

---

## Section C — Contrastive Cues for High-Confusion Clusters

### 08 vs 09 vs 11 — Invoice creation

```
SIGNAL                          → 08    → 09    → 11
"create AND send"               YES     NO      NO
Single service description       YES     NO      NO
Three product lines              NO      YES     NO
Product numbers in ()            NO      YES     YES
Mixed VAT (25% + 15% + 0%)      NO      YES     NO
"order/Auftrag/commande"         NO      NO      YES
"convert order to invoice"       NO      NO      YES
Payment registered               NO      NO      YES
```

### 10 vs 18 — Reversal tasks

```
SIGNAL                          → 10    → 18
Trigger: customer COMPLAINT      YES     NO
Trigger: bank RETURNED payment   NO      YES
Output: credit note              YES     NO
Output: payment reversal         NO      YES
Key phrases:
  "reklamiert/réclamé/reklamert"  10
  "returnert av banken/retourné par la banque/devuelto por el banco"  18
```

### 16 vs 20 vs 22 — Document expense booking

```
SIGNAL                          → 16    → 20    → 22
Attachment present               NO      YES     YES
Attachment type                  —       PDF     Receipt
Invoice number (INV-2026-XXXX)  YES     NO      NO
"supplier invoice"               YES     YES     NO
"receipt/kvittering"             NO      NO      YES
Department mentioned             NO      NO      YES
All data inline (amount, acct)  YES     NO      NO
```

### 06 vs 12 vs 13 vs 19 — Employee tasks

```
SIGNAL                          → 06    → 12    → 13    → 19
PDF attachment                   NO      NO      NO      YES
"born/birthdate/nascido"         YES     NO      NO      (in PDF)
"salary/payroll/lønn"            NO      YES     NO      NO
"travel/trip/reise" + N days     NO      NO      YES     NO
"contract/offer letter" (PDF)    NO      NO      NO      YES
Employment details (STYRK, %)    NO      NO      NO      YES
```

### 05 vs 14 vs 15 vs 29 — Project tasks

```
SIGNAL                          → 05    → 14    → 15    → 29
Creates project only             YES     NO      NO      NO
"fixed price/fastpris"           NO      YES     NO      NO
Percentage milestone invoice     NO      YES     NO      NO
"register N hours" (1 employee)  NO      NO      YES     NO
Hourly rate given                NO      NO      YES     NO
4 numbered lifecycle steps       NO      NO      NO      YES
2 employees' hours               NO      NO      NO      YES
Supplier cost                    NO      NO      NO      YES
```

### 17 vs 25 vs 27 — Payment variants

```
SIGNAL                          → 17    → 25    → 27
"overdue/forfalt/vencida"        NO      YES     NO
"reminder fee/purregebyr" 50 NOK NO      YES     NO
"partial payment" 5000 NOK       NO      YES     NO
"EUR" currency                   NO      NO      YES
Two exchange rates mentioned     NO      NO      YES
"agio/exchange gain/diferencia"  NO      NO      YES
Simple full payment (NOK)        YES     NO      NO
```

### 21 vs 24 vs 28 — Ledger read tasks

```
SIGNAL                          → 21    → 24    → 28
Errors to correct               YES     YES     NO
"largest increase"               NO      NO      YES
"internal project" creation      NO      NO      YES
4 error specs EXPLICIT in prompt NO      YES     NO
(each with specific account + NOK amount)
Error types named generically    YES     NO      NO
Jan-Feb 2026 ledger reference    YES     YES     YES  ← shared; not discriminating alone
Output: corrective voucher       YES     YES     NO
Output: new internal projects    NO      NO      YES
```

**Critical 21 vs 24 discriminator:** Prompt says "find the 4 errors: wrong account (account X used instead of Y, value N NOK), duplicate voucher (account Z, value M NOK), missing VAT line (account W, excl. N NOK), incorrect amount (account V, X NOK instead of Y NOK)" → TASK 24. Any looser description of errors → TASK 21.

**Known production failure (2026-03-21):** German task-24 prompt (explicit 4-error listing) was classified as task-21. Root cause: classifier did not detect the explicit per-error account/amount spec. Fix: add explicit per-error spec detection as a hard rule (see above).

### 23 vs 26 vs 30 — Closing tasks

```
SIGNAL                          → 23    → 26    → 30
CSV attachment                   YES     NO      NO
"bank statement/bankutskrift"    YES     NO      NO
"month-end/månedsavslutning"    NO      YES     NO
"year-end/årsoppgjør"            NO      NO      YES
Year 2025 explicit               NO      NO      YES
3 named assets to depreciate     NO      NO      YES
"22% tax/skattekostnad"          NO      NO      YES
"salary provision/lønnsavsetning" NO     YES     NO
Separate voucher per depreciation NO     NO      YES
```

---

## Section D — Retry Overlay (inject after runtime rejection)

When the runtime rejects the first classification as non-eligible, inject this BELOW the base prompt:

```
---
RETRY INSTRUCTION:

Task [REJECTED_ID] ([REJECTED_NAME]) is not eligible for this attempt.
[If multiple rejections: Tasks excluded so far: [ID1] ([Name1]), [ID2] ([Name2]), ...]

Re-read the prompt above. Choose the NEXT BEST semantic interpretation from
the remaining task universe (all tasks except those excluded above).

Rules:
1. You must return a specific task ID — do not return "unresolved".
2. Even a weak semantic match is better than no attempt.
3. Prefer tasks in the same family or confusion cluster as your previous choice.
4. If all 30 tasks have been excluded, return: {"taskId": null, "reason": "universe exhausted"}

Output format: {"taskId": "XX"}
```

**Retry family guidance** (add if the rejected task is known):

| Rejected task | First retry candidates | Reasoning |
|--------------|----------------------|-----------|
| 08 | 09, 11 | Same invoice-creation family |
| 09 | 08, 11 | Same invoice-creation family |
| 11 | 09, 08 | Same invoice-creation family |
| 10 | 18 | Both are reversals |
| 18 | 10 | Both are reversals |
| 17 | 25 | Both are payment registrations |
| 25 | 17 | Both are payment registrations |
| 05 | 14, 15, 29 | Project operations family |
| 14 | 15, 05, 29 | Project family |
| 15 | 14, 29 | Project family |
| 29 | 15, 14 | Project family |
| 06 | 19, 12 | Employee domain |
| 19 | 06 | Employee onboarding |
| 12 | 06 | Payroll vs employee create |
| 24 | 21 | Same error-correction task family |
| 21 | 24 | Same error-correction task family |
| 28 | 21, 24 | All read Jan-Feb ledger |
| 16 | 20 | Both supplier invoice |
| 20 | 16 | Both supplier invoice |
| 01 | 02 | Both entity creation |
| 02 | 01 | Both entity creation |
| 26 | 30 | Both closing tasks |
| 30 | 26 | Both closing tasks |

**Stopping condition:** Only return `{"taskId": null}` when the exclusion set contains all 30 task IDs. "Not confident" is NOT a valid reason to halt — the retry is designed to be exhaustive.

---

## Section E — Label-Offset Hazard (for corpus research use only; not in live AGENTS.md)

```
WARNING: LEGACY CORPUS LABEL NAMESPACE MISMATCH

The file tasks/tripletex/data/prompt-task-labels.jsonl uses the OLD tripletex v1
task ID namespace. These IDs DO NOT correspond to canonical Tripletex2 task IDs.

Confirmed old-ID → canonical-Tripletex2-ID remappings:
  old 01 → new 06  (Create employee)
  old 02 → new 01  (Create customer)
  old 03 → new 04  (Create product)
  old 04 → new 02  (Create supplier)
  old 05 → new 03  (Create department)
  old 06 → new 08  (Create and send invoice)
  old 07 → new 17  (Register customer invoice payment)
  old 08 → new 05  (Create project)
  old 09 → new 09  (Create customer invoice — same semantic, different numbering)
  old 10 → new 11  (Create order invoice and register payment)
  old 11 → new 16  (Register supplier invoice)
  old 12 → new 12  (Run payroll with bonus — same numbering)
  old 13 → new 13  (Register travel expense — same numbering)
  old 14 → new 10  (Issue full credit note)
  old 15 → new 14  (Set project fixed price and invoice milestone)
  old 16 → new 15  (Register project hours and create project invoice)
  old 17 → new 07  (Create accounting dimension and post voucher)
  old 18 → new 18  (Reverse customer invoice payment — same numbering)
  old 19 → new 19  (Onboard employee from contract — same numbering)
  old 20 → new 20  (Register supplier invoice with PDF — same numbering)
  old 21 → new 19* (Onboard from offer letter; may map to new 19 or be a separate task)
  old 22 → new 22  (Register receipt expense voucher — same numbering)
  old 23 → new 23  (Reconcile bank statement — same numbering)
  old 24 → new 24  (Correct ledger errors — same numbering)
  old 25 → new 25  (Overdue reminder fee — same numbering)
  old 26 → new 26  (Month-end closing — same numbering)
  old 27 → new 27  (Foreign currency payment — same numbering)
  old 28 → new 28  (Analyze expense increase — same numbering)
  old 29 → new 29  (Full project lifecycle — same numbering)
  old 30 → new 30  (Year-end closing — same numbering)

(*) Old-21 (onboard from offer letter) may be merged into new-19 or may have its
own new task ID not yet assigned. Evidence is thin.

ADDITIONAL MISLABELS within old corpus (wrong task even by old numbering):
  1 old-04 prompt → actual old-09 content (create multi-line invoice)
  1 old-09 prompt → actual old-16 content (register project hours)
  1 old-15 prompt → actual old-24 content (correct ledger errors)
  1 old-17 prompt → actual old-09 content (create customer invoice)

Total estimated noise rate: ~3-5% of 140 entries.

DO NOT USE raw old-corpus tx_task_id values as training labels.
Always remap to canonical Tripletex2 IDs via prompt content analysis.
```

---

## Section F — Implementation Checklist for Live Classifier

Use this checklist when wiring these artifacts into the live runtime:

- [ ] Classifier prompt includes Section A (task universe) and Section B (family router)
- [ ] Classifier prompt includes Section C contrastive cues for ALL 8 confusion clusters
- [ ] Base prompt does NOT include the retry overlay (Section D) — runtime injects it
- [ ] Runtime logs `{ attempt, classifierOutput, eligibilityCheck }` for every routing event
- [ ] Retry loop runs until eligible task found OR all 30 task IDs exhausted
- [ ] Retry family guidance table (Section D) used to suggest next-best candidates
- [ ] No `unresolved` return permitted while eligible tasks remain
- [ ] First attempt's `classifierOutput` is preserved as canonical semantic truth in run artifact
- [ ] Any corpus-building pipeline remaps old task IDs via the mapping in Section E
- [ ] Perfect-score tasks (01,02,03,04,05,07,08,14,18,25,26,28) remain in classifier's worldview
- [ ] Exclusion set maintained separately at runtime, never baked into classifier prompt
