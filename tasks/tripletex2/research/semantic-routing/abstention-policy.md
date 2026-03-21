# Abstention Policy: When to Return `unresolved`

Wave 1 research. Companion to `contrastive-routing.md`.

---

## Layer-Separation Note

This document defines **canonical abstention rules** — what evidence is required to confidently route, and what ambiguity should block dispatch. It is NOT a live selection policy. A runtime optimization layer may later choose a different "second-best" task after correct identification, but this document does not govern that choice. Never let a live policy-layer decision contaminate the canonical unresolved signal: if the canonical answer is `unresolved`, record it as such even if a fallback behavior will be attempted at runtime.

---

## General Abstention Triggers

Return `unresolved` whenever:
1. **Task match is ambiguous** — two or more tasks are equally plausible and no single discriminating signal tips the balance.
2. **Required fields cannot be extracted** — the prompt names a clear task but is missing a field that the task's strategy requires to run.
3. **Field values conflict** — the prompt gives two incompatible values for the same field (e.g., two different org numbers attributed to the same supplier, two contradictory VAT rates for one line).
4. **Field values are invalid** — a value fails basic format checks (org number format, date format, negative amounts where positive is required).
5. **File is unreadable** — a task that requires an attachment (19, 20, 22) specifies a file but the file cannot be parsed.
6. **Unsupported task family** — the prompt clearly belongs to tasks 23, 26, 27, or 30 which have no implemented strategy.

---

## Required Evidence Per Task

Evidence thresholds below are the MINIMUM for a `resolved` classification. Missing any required field → `unresolved` with `code: "missing-required-field"`.

### Tier 1 tasks (01-08)

| Task | Minimum required evidence |
|------|--------------------------|
| 01 | `customerName` + `organizationNumber` + `email` |
| 02 | `supplierName` + `organizationNumber` + `email` |
| 03 | At least one `departmentName` |
| 04 | `productName` + `productNumber` + `unitPriceExcludingVatNok` + `vatRatePercent` |
| 05 | `projectName` + `customerOrganizationNumber` + `projectManagerEmail` |
| 06 | `employeeName` + `birthDate` + `email` + `startDate` |
| 07 | `dimensionName` + at least one `dimensionValueName` + `postingDimensionValueName` + `postingAccountNumber` + `amountNok` |
| 08 | `customerName` + `organizationNumber` + `lineDescription` + `unitPriceExcludingVatNok` |

### Tier 2 tasks (09-18)

| Task | Minimum required evidence |
|------|--------------------------|
| 09 | `customerOrganizationNumber` + at least one line in `lines[]` with description + price |
| 10 | `customerOrganizationNumber` + `lineDescription` + `amountExcludingVatNok` |
| 11 | `customerOrganizationNumber` + at least one line in `lines[]` with description + price |
| 12 | `employeeEmail` + `payrollMonth` + `baseSalaryNok` + `bonusAmountNok` |
| 13 | `employeeEmail` + `title` + `purpose` + `departureDate` + `returnDate` + at least one cost + at least one per-diem row |
| 14 | `projectName` + `customerOrganizationNumber` + `projectManagerEmail` + `fixedPriceExcludingVatNok` + `milestoneAmountExcludingVatNok` |
| 15 | `employeeEmail` + `projectName` + `customerOrganizationNumber` + `activityName` + `hours` + `hourlyRateExcludingVatNok` |
| 16 | `supplierName` + `organizationNumber` + `invoiceNumber` + `lineDescription` + `grossAmountNok` + `expenseAccountNumber` + `vatRatePercent` |
| 17 | `customerOrganizationNumber` + `lineDescription` + `amountExcludingVatNok` |
| 18 | `customerOrganizationNumber` + `lineDescription` + `amountExcludingVatNok` |

### Tier 3 tasks (19-30)

| Task | Minimum required evidence |
|------|--------------------------|
| 19 | Readable PDF attachment + `employeeName` + `birthDate` + `departmentName` + `occupationCodeId` + `annualSalaryNok` + `percentageOfFullTimeEquivalent` + `startDate` |
| 20 | All of 16 + readable PDF attachment + `attachmentFileName` |
| 21 | None (zero-field task — `inputJson: "{}"` when prompt clearly matches) |
| 22 | `departmentName` + `lineDescription` + `grossAmountNok` + `voucherDate` + `attachmentFileName` |
| 23 | **Always unresolved** |
| 24 | None (zero-field task — `inputJson: "{}"` when prompt clearly matches) |
| 25 | None (zero-field task — `inputJson: "{}"` when prompt clearly matches) |
| 26 | **Always unresolved** |
| 27 | **Always unresolved** (despite playbook existence; AGENTS.md policy as of 2026-03-21) |
| 28 | None (zero-field task — `inputJson: "{}"` when prompt clearly matches) |
| 29 | `projectName` + `customerName` + `customerOrganizationNumber` + `projectBudgetNok` + at least one `employees[]` entry + `supplierName` + `supplierOrganizationNumber` + `supplierCostNok` |
| 30 | **Always unresolved** |

---

## Ambiguity Patterns That Should Return `unresolved`

### 08 vs 09 — Ambiguous when
- Prompt has exactly ONE service line at a single price but the prompt **does not say "send"** and the customer could be existing or new.
- Decision: if no explicit "send" instruction AND no product catalog reference, prefer 08 (create-and-send is the default for a single-line invoice). If still truly ambiguous, return `unresolved` with `code: "ambiguous-task"`.
- **Do NOT abstain** if the prompt says "créer et envoyer" or "opprett og send" — that's 08.

### 10 vs 18 — Ambiguous when
- Prompt says "reverse" or "cancel" the invoice without specifying whether it's a credit note (10) or a payment reversal (18).
- Example ambiguous prompt: "Cancel the invoice for Maintenance (30500 NOK) for customer X." — no mention of credit note vs. payment.
- Return `unresolved` with `code: "ambiguous-task"` in this case.
- **Do NOT abstain** if "credit note" / "Gutschrift" / "avoir" is present (→ 10) OR if "bank returned payment" / "annuler le paiement" is present (→ 18).

### 16 vs 20 — Ambiguous when
- Prompt mentions a PDF or attachment in the context of a supplier invoice, but it's unclear whether the attachment IS the invoice document or a related file.
- Usually NOT ambiguous: "see attached PDF" almost always signals task 20.
- Abstain if the prompt says "refer to the attachment for details" without specifying what the attachment contains.

### 16 vs 22 — Ambiguous when
- Prompt mentions a business purchase but gives no invoice number and no department. Could be a direct-line supplier expense or an employee receipt.
- Return `unresolved` with `code: "ambiguous-task"`.

### 21 vs 24 — Ambiguous when
- Prompt mentions ledger errors for Jan-Feb 2026 but does NOT list specific account numbers/amounts AND is not in Nynorsk.
- This is the most likely source of 21/24 routing errors in production.
- **Return `unresolved`** with `code: "ambiguous-task"` when:
  - No specific account numbers mentioned (can't confirm it's 24's exact error set)
  - Not Nynorsk (can't confirm it's 21's language variant)
  - OR the specific error accounts/amounts don't match either known hardcoded prompt family
- **Do NOT abstain** if the prompt explicitly lists specific error values matching 24's pattern.

### 15 vs 29 — Ambiguous when
- Prompt says "full project" with a single employee (no supplier cost). Could be 15 or a simplified 29.
- Signal for 29: **supplier cost** is explicitly required. Signal for 15: **hourly rate** is stated.
- Return `unresolved` if neither signal is present.

### 17 vs 25 — Ambiguous when
- Prompt mentions an overdue invoice AND a payment, but doesn't specify a reminder fee amount or a partial payment amount.
- If only "overdue" without exact fee/partial amounts → lean 17 (full payment of overdue invoice).
- If BOTH reminder fee (50 NOK) and partial payment (5000 NOK) mentioned → 25. Never ambiguous once both amounts appear.

### 27 vs 17 — Ambiguous when
- Prompt mentions paying a customer invoice but doesn't specify currency. If the invoice is in NOK, it's 17. If non-NOK, it's 27.
- Return `unresolved` if currency is unspecified and no exchange rate is given.

---

## Attachment-Dependent Routing Rules

The following tasks REQUIRE an attachment to be resolved:

| Task | Attachment type | If attachment missing/unreadable |
|------|-----------------|----------------------------------|
| 19 | Employment contract or offer letter (PDF) | Return `unresolved`, `code: "unreadable-file"` if file present but unreadable; `code: "missing-required-field"` if no attachment at all |
| 20 | Supplier invoice (PDF) | Return `unresolved`, `code: "unreadable-file"` if file present but unreadable; otherwise treat as task 16 (text-only supplier invoice) if no attachment mentioned |
| 22 | Receipt/expense document (PDF or image) | Return `unresolved`, `code: "missing-required-field"` if no attachment — receipt upload is scored |

**Note on 20 vs 16 fallback:** If a task-20 prompt is received but the PDF is not available at routing time, do NOT silently degrade to task 16 without noting the degradation. Return `unresolved` if the PDF was referenced but is unreadable.

---

## Zero-Field Tasks (Always Resolve if Pattern Matches)

Tasks 21, 24, 25, and 28 have **no required input fields** — the strategy reads everything it needs from the live Tripletex ledger. When the prompt clearly matches one of these patterns, return `resolved` with `inputJson: "{}"`.

Specific disambiguation for same-family zero-field tasks:

**21 vs 24 resolution rule:**
- Prompt in Nynorsk + "audit the ledger" style without enumerating specific error values → **21**
- Prompt in any language + explicitly enumerates 4 specific errors with account numbers and amounts → **24**
- Prompt mentions ledger errors but without the above signals → `unresolved`, `code: "ambiguous-task"`

**25 resolution rule:**
- Prompt mentions all of: overdue invoice, 50 NOK reminder fee, accounts 1500 and 3400, 5000 NOK partial payment → **25**
- Missing any of these specifics → do NOT route to 25; check if it's really 17

**28 resolution rule:**
- Prompt mentions comparing January-February expenses, finding the top 3 accounts by increase, and creating internal projects → **28**
- "Errors" / "wrong account" language → NOT 28

---

## Unsupported Task IDs (Always Abstain)

| Task | Policy | Note |
|------|--------|------|
| 23 | Always `unresolved`, `code: "unsupported-request"` | No prompt evidence |
| 26 | Always `unresolved`, `code: "unsupported-request"` | Leaderboard score of 6.0 is anomalous — do not infer capability |
| 27 | Always `unresolved`, `code: "unsupported-request"` per AGENTS.md | Playbook exists; strategy not yet exposed. Recognize `taskId: "27"` in response. |
| 30 | Always `unresolved`, `code: "unsupported-request"` | No prompt evidence |

**Note on task 27:** The foreign-currency payment playbook is complete and production-tested, and AGENTS.md already defines 27's classification cues. If the policy changes (strategy gets activated), the prompt patterns for routing are already documented in `contrastive-routing.md`. The abstention here is a runtime policy choice, NOT a semantic routing uncertainty.

---

## Confidence Required Before Forcing `resolved`

A classifier should only emit `resolved` when:
1. One and only one task matches all available signals.
2. All required fields for that task are confidently extracted.
3. No red-flag trap pattern applies (see `false-friends.md`).

In all other cases, prefer `unresolved` with the appropriate code. False `resolved` classifications have a higher cost than false `unresolved` — a wrong strategy can corrupt the Tripletex account state and score 0.
