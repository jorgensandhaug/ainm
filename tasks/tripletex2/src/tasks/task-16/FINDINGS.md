# Task 16 (tx_task_id=11) — Register Supplier Invoice (text-only) — Investigation Findings

## Task Identity

- Canonical task id: `16`
- Leaderboard tx_task_id: `11`
- Scorer: 4 checks, max 8 raw (2 pts each), normalized 0–4
- Current best: **1/4** (1 check passing)
- Total attempts: 24 (12 local, 12 untracked/batch)
- All prompts follow: "Received invoice INV-XXXX from supplier X (org Y) for Z NOK incl. 25% VAT, account NNNN. Register the supplier invoice."

## Production Run Scorecard

| Run | Timestamp | Approach | Booking? | Score |
|-----|-----------|----------|----------|-------|
| a290e68c | Mar 20 15:46 | direct POST /ledger/voucher | auto-booked | 0/4 |
| bc4931a3 | Mar 20 16:52 | direct POST /ledger/voucher | auto-booked | 0/4 |
| b3c40a84 | Mar 20 17:18 | direct POST /ledger/voucher | auto-booked | 0/4 |
| aa17fe23 | Mar 20 20:26 | direct POST /ledger/voucher | auto-booked | 0/4 |
| **0b6fe5b8** | **Mar 20 22:20** | **importDocument** | **NO** | **1/4** (best ever) |
| db7151ac | Mar 21 18:14 | importDocument | YES | 0/4 |
| a3b089eb | Mar 21 19:09 | importDocument | YES | 0/4 |
| 8c302260 | Mar 21 19:56 | importDocument | YES | 0/4 |
| aa847819 | Mar 21 21:22 | importDocument | YES | 0/4 |
| 1a623504 | Mar 21 23:18 | importDocument | YES | 0/4 |
| b8f958e4 | Mar 21 23:33 | importDocument | YES | 0/4 |
| c290243c | Mar 22 01:33 | importDocument | YES | 0/4 |
| d49da665 | Mar 22 04:54 | importDocument | YES (crash+dup SI) | 0/4 |

**Pattern**: The ONLY run to ever score >0 is the ONLY importDocument run without booking.

## Key Finding 1: The Booking Step Broke the Score

**The single most impactful discovery**: adding `PUT /ledger/voucher/{id}?sendToLedger=true` (the booking step) caused the score to drop from 1/4 to 0/4.

- **0b6fe5b8** (Mar 20, 5 calls, NO booking) → scored **1/4**
- **ALL 9 runs after** (Mar 20–22, 5 calls, WITH booking) → scored **0/4**

The booking step was added to the trusted standard based on cross-task evidence from task 20 (PDF supplier invoice), where `sendToLedger=true` improved the score from 7/10 to 8/10. This was incorrectly generalized to task 11.

### Faulty assumption

> "If booking helps task 20 (PDF supplier invoice), it should also help task 11 (text-only supplier invoice)."

This was documented in RESEARCH.md as the "sendToLedger=true hypothesis" with a note that it was cross-task evidence. The worst case was assumed to be "matching v1's correctness at the same 5 calls." In reality, booking **actively reduced** the score from 1 to 0.

### Why booking might hurt

When `PUT sendToLedger=true` books the voucher, Tripletex may:
- Modify or recreate the system-generated VAT posting (observed: posting ID changed from 3845825437 → 3845825456 in run aa847819)
- Change the supplierInvoice entity's internal state (e.g., amounts, outstanding balance)
- Alter the voucher's relationship to the SI entity in a way the scorer doesn't expect

The scorer may expect an **unbooked** voucher for this task type.

## Key Finding 2: Differences Between 0b6fe5b8 and Later Runs

The 1/4 run (0b6fe5b8) differs from the 0/4 runs in more than just booking:

| Aspect | 0b6fe5b8 (1/4) | Later runs (0/4) |
|--------|-----------------|-------------------|
| Supplier resolution | GET first, POST only if absent | POST always (creates new every time) |
| vatType resolution | GET /ledger/vatType (explicit) | Hardcoded `vatType: { id: 1 }` |
| FormData description | `import-${invoiceNumber}` | Not included |
| Booking | sendToLedger=false only | sendToLedger=false + sendToLedger=true |

Any of these differences could contribute to the score delta. The booking step is the most likely culprit, but the supplier lookup-first approach and explicit vatType resolution should also be tested.

## Key Finding 3: importDocument Limitations

All production runs use `POST /ledger/voucher/importDocument` with generated EHF/UBL XML. This creates a supplierInvoice entity + voucher, but with significant limitations:

1. **Immutable voucher description**: Auto-generated as `"Faktura nummer INV-XXXX fra Supplier"` — cannot be changed to match the prompt's description (e.g., "kontortjenester")
2. **DueDate from XML**: Set to `<cbc:DueDate>` which the agent defaults to the invoice date (same day), not a proper 30-day term
3. **Duplicate supplier risk**: importDocument may auto-create a second supplier from XML data if it doesn't match the existing one exactly
4. **OrderLines**: importDocument creates 1 orderLine from the XML InvoiceLine; POST /supplierInvoice creates 0

## Key Finding 4: POST /supplierInvoice — Untested in Production

Sandbox scripts 138–161 discovered `POST /supplierInvoice` as an alternative approach that creates BOTH a supplierInvoice entity AND a voucher in a single call with full field control:

```
POST /supplier → GET /ledger/account → POST /supplierInvoice (with embedded voucher+postings)
```

Advantages over importDocument:
- Custom `voucher.description` from the prompt
- Explicit `invoiceDueDate` control
- No XML generation needed
- No duplicate supplier risk from import auto-creation
- Direct supplier linkage

**This approach has NEVER been tested in production.** It works in sandbox (scripts 145, 151, 160, 161).

## Key Finding 5: Direct POST /ledger/voucher — No SI Entity

The earliest run (a290e68c) used `POST /ledger/voucher` directly. This creates a voucher but **no supplierInvoice entity**. From sandbox script 116:

```
CHECK HYPOTHESIS | importDocument | direct voucher
SI entity exists | YES            | NO
Voucher exists   | YES            | YES (auto-booked)
```

This approach likely scored 0/4 in the early untracked attempts (leaderboard shows best=0 through attempt 7).

## Hypotheses for the Remaining 3 Failed Checks

Even our best run (0b6fe5b8, 1/4) fails 3 of 4 checks. Possible causes:

1. **Voucher description mismatch**: Scorer expects "kontortjenester" (from prompt), gets "Faktura nummer INV-2026-7606 fra Lumière SARL" (from importDocument auto-generation). POST /supplierInvoice would fix this.

2. **Missing/wrong invoiceDueDate**: XML `<DueDate>` is set to the invoice date (same day). Scorer may expect a proper due date or no due date. POST /supplierInvoice would fix this.

3. **Wrong supplierInvoice amounts**: importDocument populates `amount`, `amountExcludingVat`, etc. from XML. POST /supplierInvoice leaves some as 0 (read-only). The scorer may expect specific values.

4. **Duplicate suppliers**: If importDocument auto-creates a second supplier from XML, the scorer may find multiple suppliers for the org number and fail validation.

## Improvement Plan

### Step 1: Recover baseline (target: 1/4)
Remove the booking step. Revert to 0b6fe5b8's approach:
- GET /supplier (lookup-first)
- GET /ledger/account
- GET /ledger/vatType (explicit, not hardcoded)
- POST importDocument
- PUT sendToLedger=false

### Step 2: Test POST /supplierInvoice (target: 2–4/4)
Replace importDocument with POST /supplierInvoice:
- POST /supplier
- GET /ledger/account
- POST /supplierInvoice (with custom description, correct dueDate, embedded voucher+postings)
- NO booking step

This addresses the voucher description mismatch, invoiceDueDate, and duplicate supplier issues simultaneously.

### Step 3: Isolate variables
If Step 2 doesn't reach 4/4, test each variable independently:
- Custom vs auto-generated voucher description
- With vs without invoiceDueDate
- With vs without booking
- Lookup-first vs always-create supplier
- Explicit vs hardcoded vatType

## Key Finding 6: Interpretation Analysis — What Our Code Does vs What the Scorer Likely Expects

### The Prompt (canonical form)

Every task 11 prompt follows this exact structure, translated into 6 languages:

> "We have received invoice INV-XXXX from supplier X (org Y) for Z NOK including VAT. The amount relates to office services (account NNNN). Register the supplier invoice with the correct input VAT (25%)."

Observed languages: Norwegian Bokmål, Nynorsk, German, French, Spanish, English. All use identical data fields. The key verb is **"Registrer"** (register), NOT "Bokfør" (book/post to ledger).

### Interpretation Axis 1: "Register" vs "Book" — CONFIRMED WRONG

**Our interpretation (v2 strategy, all post-0b6fe5b8 runs):** "Register" means create the supplier invoice AND book it (sendToLedger=true). The voucher should get a real number (>0).

**Likely correct interpretation:** In Norwegian accounting, "registrere leverandørfakturaen" means **entering it into the system** — creating the SI entity and its associated unbooked voucher. It does NOT mean posting it to the general ledger. A supplier invoice in Tripletex goes through distinct states:

1. **Registrert** (registered) — SI entity exists, voucher has number=0 (unbooked)
2. **Godkjent** (approved)
3. **Bokført** (booked) — voucher gets a real number, posted to ledger
4. **Betalt** (paid)

The prompt says "Registrer", asking for state 1. Our v2 strategy performs state 3. **This directly explains why booking dropped the score from 1/4 to 0/4** — the scorer likely checks that the voucher is in "registered but unbooked" state (number=0). Booking changes it to state 3, which the prompt didn't ask for.

**Evidence strength: STRONG.** The 0b6fe5b8→0/4 regression is perfectly explained by this. The word "Registrer" is unambiguous in Norwegian accounting context.

### Interpretation Axis 2: API Approach — importDocument vs POST /supplierInvoice

**Our interpretation:** Fabricate an EHF/UBL XML document and import it via `POST /ledger/voucher/importDocument`. This is the "electronic invoice import" workflow in Tripletex.

**Likely correct interpretation:** A text-only prompt describes a **manual registration** scenario — the user received a paper/email invoice and is entering it by hand. This maps to Tripletex's `POST /supplierInvoice` endpoint, which is what the "Ny leverandørfaktura" (New supplier invoice) UI button uses.

importDocument is designed for actual electronic invoices received via Peppol/EHF. Using it for a text-only prompt means:
- We're fabricating a document that never existed
- The resulting state has artifacts that manual registration wouldn't have

| Aspect | importDocument (our approach) | POST /supplierInvoice (manual registration) |
|--------|-------------------------------|---------------------------------------------|
| Voucher description | IMMUTABLE: "Faktura nummer INV-XXXX fra Supplier" | Custom: can be set to prompt description |
| invoiceDueDate | From XML `<cbc:DueDate>` — we set it = invoice date | Explicit field — can be set to anything |
| orderLines | 1 line auto-created from XML InvoiceLine | 0 lines (or explicitly created) |
| SI entity amounts | Populated from XML (non-zero) | Some fields read-only (may be 0) |
| kidOrReceiverReference | From XML PaymentMeans (if present) | Separate field |
| Supplier auto-creation | May auto-create duplicate from XML data | No auto-creation risk |

**Evidence strength: MODERATE.** The POST /supplierInvoice approach has never been tested in production. It could fix 2-3 checks (description, dueDate) but might introduce new failures (SI amounts being 0).

### Interpretation Axis 3: Voucher Description

**Our interpretation:** The voucher description is immutable from importDocument: "Faktura nummer INV-2026-7606 fra Lumière SARL". We cannot change this.

**Likely correct interpretation:** The scorer probably expects the voucher description to match the prompt's service description. The prompt says "kontortjenester" / "services de bureau" / "Bürodienstleistungen" / "office services" — this is what a human would type as the voucher description when registering manually.

With importDocument, the auto-generated description is always "Faktura nummer {invoiceNumber} fra {supplierName}" regardless of what service the invoice is for. This is a Tripletex system-generated value that cannot be overridden via any PUT.

With `POST /supplierInvoice`, the voucher description CAN be set to the prompt description.

**Evidence strength: MODERATE-HIGH.** Voucher description is a standard scored field in accounting systems. The mismatch between "Faktura nummer..." and "kontortjenester" is stark.

### Interpretation Axis 4: Due Date (invoiceDueDate)

**Our interpretation:** When the prompt doesn't specify a due date, set `dueDate = invoiceDate` (both strategies do this at line 95: `const dueDate = input.dueDate ?? invoiceDate`). In the XML, `<cbc:DueDate>` = invoice date.

**Alternative interpretations:**
1. **Standard 30-day terms**: invoiceDate + 30 days is the default payment term in Norwegian business. A Tripletex user registering manually would likely use 30-day terms.
2. **No due date**: Leave the field empty/null, since the prompt doesn't mention it.
3. **Same as invoice date**: What we currently do.

The 0b6fe5b8 run (1/4) used DueDate = runDate (same as IssueDate). This passed 1 check. Whether a different DueDate would pass more checks is unknown.

**Evidence strength: LOW-MODERATE.** We don't have production data to distinguish these interpretations. But DueDate = invoiceDate is unusual in practice.

### Interpretation Axis 5: PaymentMeans / kidOrReceiverReference

**Our current XML (v2 strategy):** Does NOT include `<cac:PaymentMeans>`. This means `kidOrReceiverReference` on the SI entity is empty.

**0b6fe5b8 (1/4):** Also did NOT include PaymentMeans.

**The current trusted standard (updated after 0b6fe5b8):** Says to include PaymentMeans with `<cbc:PaymentID>${invoiceNumber}</cbc:PaymentID>`. This was added based on task 20 evidence (PDF supplier invoice, Check 5 = kidOrReceiverReference).

This is another case of cross-task generalization that hasn't been validated for task 11. However, unlike booking, adding PaymentMeans is unlikely to HURT — it just populates a field. Whether task 11's scorer checks this field is unknown.

**Evidence strength: LOW.** No production data shows this matters for task 11. But it's safe to include.

### Interpretation Axis 6: Supplier Address / Bank Account

**The prompt gives:** supplier name, org number. Nothing else — no address, no bank account.

**Our approach:** Create supplier with only name + org number. No address or bank fields.

**Possible scorer expectation:** The scorer might not check address/bank at all for task 11 (these fields aren't in the prompt). This is different from task 20, where the PDF contains address and bank data.

**Evidence strength: LOW.** The prompt doesn't mention address/bank, so the scorer likely doesn't check them for task 11.

### Most Likely Check Mapping (Speculative)

Given that 0b6fe5b8 (importDocument, no booking) passes exactly 1 of 4 checks:

| Check | What it likely tests | 0b6fe5b8 result | Why |
|-------|---------------------|-----------------|-----|
| 1 | SI entity exists with correct invoiceNumber + supplier | **PASS** | importDocument creates SI entity with correct fields |
| 2 | Voucher description matches prompt description | **FAIL** | "Faktura nummer..." ≠ "services de bureau" |
| 3 | invoiceDueDate is correct (30 days? null?) | **FAIL** | DueDate = invoiceDate (same day) |
| 4 | Postings correct on correct accounts with VAT | **FAIL** | Postings ARE set, but maybe wrong format/amounts? Or voucher is wrong type? |

And when booking is added (all 0/4 runs): Check 1 ALSO fails because booking changes the SI entity or voucher state to something the scorer doesn't expect for "registered".

Alternative check mapping:

| Check | What it likely tests | 0b6fe5b8 result | Why |
|-------|---------------------|-----------------|-----|
| 1 | SI entity exists with correct supplier linkage | **PASS** | importDocument creates SI with supplier |
| 2 | Voucher is in registered/unbooked state (number=0) | **PASS** (but FAILS with booking) | 0b6fe5b8 is unbooked; booked runs fail this |
| 3 | Voucher description = prompt description | **FAIL** | Immutable from importDocument |
| 4 | invoiceDueDate = 30-day terms | **FAIL** | We set it = invoiceDate |

Wait — this gives 2 passing for 0b6fe5b8, but we only see 1/4 (1 check). Unless 0b6fe5b8 scored 2/8 raw which normalizes differently...

Actually: leaderboard shows best_score went from 0 → 1 with max_score = 4. So 1/4 = 1 check passed. The trusted standard's claim of "2/4 checks passed" is INCORRECT (that would give best_score=2).

So exactly 1 check passes in 0b6fe5b8. The most likely single check: **SI entity exists with correct invoiceNumber and supplier**. Everything else fails.

### Faulty Claims in the Trusted Standard

The current `register-supplier-invoice.md` trusted standard contains several claims contradicted by production evidence:

1. **"the scorer requires a booked voucher — unbooked vouchers scored 0%"** → WRONG. 0b6fe5b8 was unbooked and scored 1/4. All booked runs scored 0/4.

2. **"do NOT skip the booking step (step 5) — without it the voucher stays unbooked and the scorer returns 0%"** → WRONG. The pre-0b6fe5b8 runs that scored 0 used direct POST /ledger/voucher (no SI entity), not importDocument without booking. The trusted standard confused "no SI entity" with "unbooked". Correlation ≠ causation.

3. **"the 0b6fe5b8 run was NOT booked — adding a booking step should unlock 1 more check"** → WRONG. Booking REMOVED the 1 passing check, resulting in 0/4.

4. **"scored 1/8 (score_raw=4, score_max=8, 2/4 checks passed)"** → WRONG. Leaderboard shows best_score=1, max_score=4. That's 1 check passed (2/8 raw), not 2 checks (4/8 raw).

These errors cascaded: the incorrect claim about booking led to v2 being created with sendToLedger=true, which was deployed to ALL subsequent production runs, causing 9 consecutive 0/4 scores.

## Recommended Next Steps (Priority Order)

### Priority 1: Revert booking — target 1/4 (recover baseline)
Remove sendToLedger=true. Deploy v1 (importDocument + sendToLedger=false only). This should recover the 1/4 baseline proven by 0b6fe5b8.

### Priority 2: Test POST /supplierInvoice — target 2-4/4 (new approach)
Create a v3 strategy using POST /supplierInvoice instead of importDocument:
```
POST /supplier → GET /ledger/account → POST /supplierInvoice (with custom description, 30-day dueDate, embedded voucher+postings)
```
This fixes the two most likely failing checks: voucher description and invoiceDueDate.
NO booking step — leave voucher in "registered" state.

### Priority 3: Fix trusted standard
Correct the 4 factual errors listed above. Remove all claims that booking helps for task 11. Add explicit warning that task 11 and task 20 have DIFFERENT scorer expectations regarding booking.

## Anti-Patterns Confirmed

- ~~sendToLedger=true helps~~ → **HURTS** for task 11 (0/4 vs 1/4)
- Direct POST /ledger/voucher → no SI entity → 0/4
- POST /incomingInvoice → 403 on public accounts
- sendToLedger=true with postings in one PUT → 422
- Cross-task generalization without production validation (task 20 → task 11)
