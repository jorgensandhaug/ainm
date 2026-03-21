# Semantic Family Map — Tripletex 30-Task Universe

> **Wave 1 research artifact.** Companion to `task-cards.md`.
> Purpose: (1) define the first-pass routing families the classifier should use before
> exact task selection, and (2) specify how this map supports the live retry-aware
> classifier contract.
>
> **Canonical-universe note.** All 30 tasks appear in their correct families,
> including those with perfect leaderboard scores. See `task-cards.md §Routing Policy
> vs Semantic Universe` for the explicit two-layer policy.

---

## Part 1 — Routing Families

Eight families cover the 30-task universe. First-pass routing reduces the decision space from 30 to ≤8 candidates before exact disambiguation.

---

### Family A · Entity Creation (master data)

Tasks that create a single Tripletex entity from structured text. No financial operations, no attachments, no existing-record lookup required.

| Task | Entity |
|------|--------|
| 01 | Customer |
| 02 | Supplier |
| 03 | Department (batch: typically 3 names) |
| 04 | Product (with product number + VAT rate) |
| 05 | Project (linked to customer + PM by email) |
| 06 | Employee (name, birthdate, email, start date) |

**First-pass signal:** Prompt starts with "create/opprett/erstellen/crie/crear/registrer [entity]" with NO financial amounts, NO invoice, NO hours, NO attachment.

**Internal family discrimination:**
- Has "org number" + "email" only → 01 (customer) or 02 (supplier). Discriminator: "kunden/customer/client" vs "leverandør/supplier/Lieferant/fournisseur".
- Has a list of quoted names (2–5) → 03 (department).
- Has "product number" + price + VAT% → 04.
- Has project name + customer org number + PM email → 05.
- Has "born" / "birthdate" / "nascido" + start date → 06.

**Boundary with other families:**
- 06 (employee entity) vs 19 (employee from PDF): Attachment = NOT Family A → Family E.
- 05 (create project) vs 14/15/29 (project ops): any financial operation = NOT Family A → Family F.

---

### Family B · Invoice Issuance (outgoing customer invoices)

Tasks that create or reverse outgoing invoices. No pre-existing payment to process.

| Task | Operation |
|------|-----------|
| 08 | Create single-line invoice + send in same call |
| 09 | Create multi-line invoice (3 lines, mixed VAT, no send) |
| 10 | Issue full credit note (reverse existing invoice) |
| 11 | Create order → invoice → register payment (combined) |

**First-pass signal:** Prompt is about creating an outgoing invoice OR a credit note, driven by invoice line descriptions / product lists. No "fixed price", no "project hours", no "bank return".

**Internal family discrimination (the hardest cluster):**
- "create AND send" + single service description + no product numbers → 08.
- "three product lines" + product numbers in parentheses + mixed VAT (25%/15%/0%) → 09.
- "complained/reklamiert" + "full credit note" → 10.
- "order"/"Auftrag"/"commande" + "convert to invoice" + "register payment" → 11.

---

### Family C · Payment Events

Tasks that register, reverse, or manage payments against existing invoices.

| Task | Operation |
|------|-----------|
| 17 | Register full payment (NOK, simple) |
| 18 | Reverse payment (bank return) |
| 25 | Overdue reminder fee + partial payment |
| 27 | Register EUR payment + book FX gain/loss |

**First-pass signal:** Prompt centers on a PAYMENT action (not invoice creation). An invoice already exists; the action is about money moving.

**Internal family discrimination:**
- "returned by bank" / "returnert av banken" → 18.
- "overdue/forfalt" + "reminder fee/purregebyr" → 25.
- "EUR" + two exchange rates mentioned → 27.
- Otherwise (outstanding invoice, register full payment) → 17.

---

### Family D · Employee Costs

Tasks about employee-related financial events (not creating the employee entity itself).

| Task | Operation |
|------|-----------|
| 12 | Run payroll (salary + bonus for one employee) |
| 13 | Register travel expense (per diem + itemized costs) |
| 22 | Book receipt expense to account (single receipt, attachment) |

**First-pass signal:** Prompt is about money going TO or FOR an employee (payroll, travel, expenses). Named employee identified by email. No invoice to a customer.

**Internal family discrimination:**
- "salary/payroll/lønn/salário" + NOK amounts → 12.
- "travel/trip/reise/N days/per diem/Tagegeld" → 13.
- "receipt/kvittering" + department → 22 (note: 22 also has an attachment; see Family E for attachment routing).

---

### Family E · Attachment-Driven Tasks

Tasks where the prompt's primary data source is an attached file. Attachment type is the primary discriminator.

| Task | Attachment type | Content |
|------|----------------|---------|
| 19 | PDF (employment contract / offer letter) | Onboard employee |
| 20 | PDF (supplier invoice) | Register supplier invoice from scan |
| 22 | Image/receipt | Book expense to account + department |
| 23 | CSV (bank statement) | Reconcile bank to open invoices |

**First-pass signal:** Prompt contains "(see attached PDF)" / "(vedlagt CSV)" / "from this receipt" or equivalent. This is a HARD gate — if attachment language is present, route to Family E first.

**Internal family discrimination:**
- CSV + "bank statement/bankutskrift/relevé bancaire" → 23.
- PDF + "employment contract/arbeidskontrakt/offer letter/Angebotsschreiben" → 19.
- PDF + "supplier invoice/leverandørfaktura/factura de proveedor" → 20.
- Receipt image + "department/avdeling" + "expense account" → 22.

**Note on task 22:** It straddles Family D and E. If attachment language is absent but expense/receipt wording is present, route by Family D cues. If attachment is explicit, route by Family E.

---

### Family F · Project Operations

Tasks that perform financial or time-tracking operations against a Tripletex project. (Creating a project entity alone = Family A/task 05.)

| Task | Operation |
|------|-----------|
| 14 | Set fixed price + invoice a percentage milestone |
| 15 | Register hours for one employee → project invoice |
| 29 | Full lifecycle: budget + hours (2 employees) + supplier cost + invoice |

**First-pass signal:** Prompt involves an existing or newly created project AND financial operations (hours, fixed price, invoice). Usually a project name in quotes.

**Internal family discrimination:**
- "fixed price/fastpris/Festpreis" + percentage milestone → 14.
- "register N hours" + "hourly rate" + single employee → 15.
- Numbered multi-step structure (4 steps: budget + 2-employee hours + supplier + invoice) → 29.

**Family F / Family A boundary:** If the only action is "create the project" with no hours, price, or invoice → 05 (Family A).

---

### Family G · Ledger and Voucher Operations

Tasks that read or modify the general ledger outside of the invoice/payment flows.

| Task | Operation |
|------|-----------|
| 07 | Create accounting dimension + post linked voucher |
| 16 | Register supplier invoice (text-based, no PDF) |
| 21 | Correct ledger errors (implicit scan variant) |
| 24 | Correct ledger errors (explicit 4-error listing) |
| 28 | Analyze expense trends + create internal projects |

**First-pass signal:** Prompt deals with ledger accounts, voucher posting, or error correction — not customer-facing invoices or employee payroll.

**Internal family discrimination:**
- "free/custom accounting dimension/fri regnskapsdimensjon" + post voucher linked to dimension → 07.
- "invoice INV-2026-XXXX" + "including VAT" + account number (text, no attachment) → 16.
- "largest increase" + "January to February 2026" + "internal project" → 28.
- "errors in ledger" + Jan–Feb 2026 + explicit 4-error spec (accounts + amounts in prompt) → 24.
- "errors in ledger" + Jan–Feb 2026 + NO explicit spec → 21.

---

### Family H · Periodic Closing

Tasks that close accounting periods or reconcile the balance of accounts. High-complexity, rare tasks.

| Task | Operation |
|------|-----------|
| 26 | Month-end closing (accruals, monthly depreciation, salary provision) |
| 30 | Simplified year-end closing (3-asset depreciation, prepaid reversal, 22% tax) |

*Note: Task 23 (bank reconciliation) is in Family E because its primary discriminator is the CSV attachment, not period-closing intent.*

**First-pass signal:** Prompt uses "closing/clôture/cierre/årsoppgjør/månedsavslutning" language or involves structured period-end calculations (depreciation + accruals + tax).

**Internal family discrimination:**
- "month-end" + specific month (March 2026) + single depreciation + salary provision → 26.
- "year-end" + year 2025 + three named assets + "separate voucher per depreciation" + 22% tax → 30.

---

## Part 2 — First-Pass Family Router

The classifier should apply this decision tree BEFORE selecting an exact task:

```
1. Does the prompt mention an attachment?
   - "see attached PDF" / "vedlagt PDF" / "PDF ci-joint" / "PDF adjunto" / "attached PDF"
     → Family E (tasks 19, 20, 22, 23)
   - "vedlagt CSV" / "attached CSV" / "bank statement (attached)"
     → Task 23 directly (only CSV consumer)
   - Receipt/image implied but no explicit PDF
     → Continue below; receipt cues go to 22

2. Does the prompt mention "bank returned" / "returnert av banken" / "retourné par la banque"?
   → Task 18 directly

3. Is the primary subject a NAMED ENTITY being created for the first time?
   - "new customer/kunden/client" → Family A → 01
   - "new supplier/leverandør/Lieferant" → Family A → 02
   - "department(s)/avdeling(er)/Abteilungen" → Family A → 03
   - "product/produkt" + product number → Family A → 04
   - "project" + customer + PM email → Family A → 05
   - "new employee" + birthdate + no attachment → Family A → 06

4. Does the prompt mention "salary/payroll/lønn/salário/Gehalt"?
   → Family D → Task 12

5. Does the prompt mention "travel expense/Reisekostenabrechnung/reiserekning/despesa de viagem" + N days?
   → Family D → Task 13

6. Does the prompt mention "fixed price/fastpris/Festpreis/prix forfaitaire/preço fixo"?
   → Family F → Task 14

7. Does the prompt mention "register N hours for [employee] on [activity]"?
   → Family F → Task 15

8. Does the prompt have 4 numbered lifecycle steps (budget + hours + supplier + invoice)?
   → Family F → Task 29

9. Does the prompt mention "create AND send / opprett og send" (invoice, single line)?
   → Family B → Task 08

10. Does the prompt have "three product lines" + product numbers + mixed VAT?
    → Family B → Task 09

11. Does the prompt mention "order/Auftrag/commande" + "convert to invoice" + payment?
    → Family B → Task 11

12. Does the prompt mention "complained/reklamiert/réclamé" + "credit note/Gutschrift/avoir"?
    → Family B → Task 10

13. Does the prompt mention "outstanding invoice" + "register full payment" (NOK, no FX)?
    → Family C → Task 17

14. Does the prompt mention "overdue/forfalt/vencida" + "reminder fee/purregebyr"?
    → Family C → Task 25

15. Does the prompt mention "EUR" + two exchange rates?
    → Family C → Task 27

16. Does the prompt mention "INV-2026-XXXX" + account number (text, no attachment)?
    → Family G → Task 16

17. Does the prompt mention "accounting dimension/fri regnskapsdimensjon" + post voucher?
    → Family G → Task 07

18. Does the prompt mention "largest increase" + "January to February" + "internal project"?
    → Family G → Task 28

19. Does the prompt mention ledger errors + Jan–Feb 2026 + explicit 4-error spec?
    → Family G → Task 24

20. Does the prompt mention ledger errors + Jan–Feb 2026 (no explicit spec)?
    → Family G → Task 21

21. Does the prompt mention "bank statement/bankutskrift" + matching payments?
    → Family E → Task 23

22. Does the prompt mention "year-end/årsoppgjør" + year 2025 + 3 assets + 22% tax?
    → Family H → Task 30

23. Does the prompt mention "month-end/månedsavslutning" + monthly depreciation + salary provision?
    → Family H → Task 26

24. Fall through → re-read prompt for secondary signals; if still ambiguous, emit Task 09 as a
    default (most structurally rich task in Family B, least likely to cause catastrophic failure).
```

---

## Part 3 — Live Retry-Aware Classifier Contract

> This section specifies how the semantic artifacts in this document and in
> `task-cards.md` should be used to build the live classifier prompt hierarchy.
> It directly addresses the retry policy: attempt 1 = truthful best; if rejected,
> exhaust remaining task universe until an eligible task is found.

### Architecture: base worldview + retry overlay

**Base worldview (attempt 1):** The classifier sees the full 30-task universe. Its output is the semantically correct best match, with no knowledge of which tasks are excluded at runtime. The family router above is the primary mental model.

**Retry overlay (attempt 2+):** When the runtime rejects the first choice (because it's in the exclusion set), the classifier is re-prompted with:
- The original prompt (unchanged)
- Explicit instruction: "Task [X] is not eligible. Choose the next-best interpretation from the REMAINING task universe."
- The remaining universe is the full 30-task set MINUS the excluded task IDs seen so far
- The retry must produce a DIFFERENT task ID — "unresolved" is not permitted while eligible tasks remain

### What belongs in the base worldview

These elements should always be present in the base classifier prompt:
- The full 30-task name list (one line each, task ID + canonical name)
- The family structure (8 families, ~3 sentences per family)
- The confusion-zone discrimination rules (the tables from `task-cards.md`)
- The critical attachment discriminator: "if attachment, check type first"
- The instruction that the output is always a single `tx_task_id` (01–30)

### What belongs in the retry overlay only

These elements are added ONLY when re-prompting after a rejection:
- The explicit exclusion notice: "Task [ID] ([Name]) is not eligible for this attempt."
- Cumulative list of rejected IDs so far (grows per retry)
- The instruction to choose from the REMAINING universe
- Optional: brief note on WHY a task was excluded (e.g., "already at max score") — useful for the classifier to understand that semantic correctness still holds, only eligibility differs

**Important:** The retry overlay MUST NOT say "that task doesn't exist" or imply the excluded task is wrong semantically. Correct phrasing: "Task 08 is currently not eligible for selection. Please choose the next-best interpretation from the remaining tasks."

### Stopping condition: exhaustive retry

The retry loop runs until one of these conditions is met:

1. **Eligible task found:** Classifier returns a task ID not in the exclusion set → proceed with that task's strategy.
2. **Universe exhausted:** All 30 task IDs have been either selected or rejected. At this point (and ONLY at this point), return `{ taskId: null, reason: "no eligible task found after exhausting full universe" }`.

The classifier should NEVER return "unresolved" while eligible tasks remain. Even if the 5th-best semantic interpretation is a very weak match, it is still better than no attempt. The boundary only triggers when NO eligible task remains.

### What evidence is strong enough to justify a second-best reinterpretation?

When the best semantic match is excluded and the classifier must find a second-best, the strength of the reinterpretation matters. Use these tiers:

**Tier 1 (strong second-best — proceed confidently):**
- Both tasks are in the SAME confusion zone cluster (e.g., task 08 excluded → task 09 or 11)
- The second-best shares the same domain (invoicing, payment, employee, project)
- The prompt has at least one cue that partially fits the second-best task

**Tier 2 (acceptable second-best — proceed with lower confidence):**
- Tasks are in the same FAMILY but not a known confusion pair
- The second-best is semantically adjacent (e.g., task 17 excluded → task 25 both in Family C)
- No contradictory cues in the prompt for the second-best

**Tier 3 (weak second-best — proceed but log low confidence):**
- Tasks are in different families
- The second-best shares only a surface entity (e.g., both mention "project")
- Prompt cues that fit the second-best are incidental, not primary

All three tiers should PROCEED (not halt). The confidence tier should be logged for observability so that human review can identify systematic weak-routing patterns.

### Retry observability contract

Every routing event (first attempt and any retries) must produce a structured log:

```json
{
  "requestId": "...",
  "attempt": 1,
  "classifierOutput": "08",
  "eligibilityCheck": "excluded (perfect score)",
  "retryReason": "task 08 in exclusion set"
}
{
  "requestId": "...",
  "attempt": 2,
  "classifierOutput": "09",
  "eligibilityCheck": "eligible",
  "selectedStrategy": "09.create-customer-invoice.v1",
  "semanticConfidenceTier": "tier-1"
}
```

The first attempt's `classifierOutput` is the **canonical semantic truth** and should be preserved as such in the run artifact. It is the correct routing answer. Only `attempt >= 2` outputs are policy-filtered.

### Retry prompt template

```
[BASE WORLDVIEW — see above]

---

RETRY INSTRUCTION (applies only on retry attempts):
Task [ID] ([Name]) has already been selected and is not currently eligible.
Tasks excluded so far: [ID1], [ID2], ...

Given the same prompt, choose the NEXT BEST interpretation from the remaining
task universe (all tasks except those excluded above).

You must return a specific task ID. Do not return "unresolved" — choose the
semantically closest remaining eligible task, even if the fit is imperfect.
The system will handle confidence calibration separately.
```

---

## Part 4 — Cross-Family Confusion Alerts

These cross-family confusions are the most dangerous (hardest to recover from in retry):

### Alert 1: Task 21 vs 24 (within Family G)
Both are "correct ledger errors". Routing mistake causes the wrong strategy to run. Key: does the prompt explicitly list account numbers and amounts for all 4 errors?
- YES → 24 (explicit)
- NO → 21 (implicit scan)
**Known production failure:** German task-24 prompt classified as 21. This is the highest-priority routing disambiguation to get right.

### Alert 2: Task 08 vs 09 (Family B)
08 creates and SENDS; 09 creates but does NOT send. Both are single-session invoice creation. Routing 09 to 08 sends an invoice the scorer may not expect. Key: product numbers + mixed VAT = 09; single service description = 08.

### Alert 3: Task 19 vs 06 (Family E vs A)
Both create employees. 19 reads from PDF, 06 reads from inline text. Routing 19 to 06 means missing employment details. Key: attachment language is the hard gate.

### Alert 4: Task 16 vs 20 (Family G vs E)
Both register supplier invoices. 16 has text data; 20 has PDF. Routing 20 to 16 means the strategy won't know how to extract the invoice data. Key: "see attached PDF" is the hard gate.

### Alert 5: Task 28 vs 21/24 (Family G)
All read Jan–Feb 2026 ledger. 28 analyzes TRENDS; 21/24 fix ERRORS. Routing 28 to 21/24 creates projects when it should post corrective vouchers. Key: "largest increase" + "internal project" vs "errors/correct/fix".

---

## Part 5 — Current Evidence Gaps

Tasks with weak semantic evidence (inform the live classifier with lower confidence):

| Task | Gap | Mitigation |
|------|-----|-----------|
| 21 | Prompt pattern unclear; distinction from 24 relies on ABSENCE of explicit error specs | Route on negative cue: if 4-error spec absent → 21 |
| 23 | 2 prompt examples; CSV attachment is strong enough to route | CSV file attachment = definitive |
| 26 | 1 prompt example; "month-end closing" language is distinctive | Low risk of confusion with 30 |
| 27 | 2 examples; EUR + two rates is distinctive | Strong positive discriminator |
| 30 | 3 examples; year + 3 assets + 22% tax is distinctive | "2025" + 3 named assets is definitive |

---

## Part 6 — Suggested AGENTS.md Classifier Section Structure

The live AGENTS.md (classifier context) should be structured as follows to consume this research:

```markdown
## Task Classification

### Step 1: Attachment check (HARD GATE)
[Paste the attachment discriminator from Part 2, steps 1-2]

### Step 2: Family routing
[Paste the 8-family summary from Part 1, one paragraph per family]

### Step 3: Exact task disambiguation
[Paste the confusion-zone tables from task-cards.md for the relevant family]

### Step 4: Output
Return exactly: {"taskId": "XX"}

---

## Retry Protocol
[Paste the retry prompt template from Part 3]
The retry instruction is injected ONLY when the runtime adds it.
Do not apply exclusions on your first attempt.
```

This structure ensures:
- Attempt 1 classifier sees only the base worldview (no exclusion bias)
- The retry overlay is appended by the runtime, not pre-loaded
- The family router scales O(log N) before the confusion-zone tables are consulted
- The attachment gate fires before any family-level reasoning
