# False Friends: Prompts That Look Like One Task but Are Another

Wave 1 research. Companion to `contrastive-routing.md` and `abstention-policy.md`.

A "false friend" in this context is a prompt that shares surface vocabulary with task A but should route to task B. Each entry includes the misleading phrase, the wrong route it suggests, the correct route, and (where corpus evidence exists) a worked example.

---

## Layer-Separation Note

False-friend identification is canonical semantic research. Perfect-score tasks (e.g., 14, 18, 25, 28) appear as correct routes in this document and must not be removed from the semantic universe because they score well. A live optimization layer may later skip dispatching to a perfect-score task, but the routing research must still record the true nearest semantic match — even when that match is a task the runtime will avoid.

---

## FF-01: German "Rechnung erhalten" → NOT Task 11 (Order+Invoice+Payment)

**Wrong route:** Task 11 (Create Order, Invoice, Register Payment)
**Correct route:** Task 16 (Register Supplier Invoice)

**Why it's a trap**
German "Rechnung" means "invoice" generically. A prompt saying "Wir haben die Rechnung INV-2026-XXXX vom Lieferanten X erhalten" ("We received invoice INV-2026-XXXX from supplier X") sounds like it might relate to an order-and-invoice workflow, but this is an **incoming supplier invoice** — the opposite direction.

**Misleading signals:**
- German "Rechnung" (invoice) — same word used for both outgoing and incoming invoices
- "erhalten" (received) — could sound like a customer receiving an outgoing invoice
- An invoice number and an amount are stated

**Correct signals:**
- "vom Lieferanten" (from the supplier) — supplier is the sender, not the customer
- "Erfassen Sie die Lieferantenrechnung" (Register the supplier invoice)
- Expense account number given ("Konto 6590")
- VAT stated as "inklusive MwSt." (inclusive of VAT)

**Worked example (real corpus prompt, mislabeled in production labels)**
> "Wir haben die Rechnung INV-2026-2118 vom Lieferanten Brückentor GmbH (Org.-Nr. 981448294) über 70400 NOK einschließlich MwSt. erhalten. Der Betrag betrifft Bürodienstleistungen (Konto 6590). Erfassen Sie die Lieferantenrechnung mit korrekter Vorsteuer."

→ Correct route: **Task 16** (supplier invoice, no attachment)

**Decision rule:** If the prompt says "Lieferanten" / "leverandør" / "supplier" / "fournisseur" / "fornecedor" / "proveedor" before the invoice reference, it is always an incoming supplier invoice (16 or 20), never an outgoing customer order (11).

---

## FF-02: French "annuler la facture" vs "annuler le paiement"

**Wrong route for "annuler le paiement":** Task 10 (Full Credit Note)
**Correct route for "annuler le paiement":** Task 18 (Reverse Payment)

**Why it's a trap**
In French, both "annuler la facture" and "annuler le paiement" translate roughly to "cancel" something invoice-related in English. The difference is critical:
- "annuler la facture" = cancel the invoice itself → **Task 10** (credit note)
- "annuler le paiement" = cancel the payment on the invoice → **Task 18** (payment reversal)

**Misleading signals:**
- Both use the verb "annuler"
- Both involve an invoice
- Both name a customer and an ex-VAT amount

**Correct signals:**
- Task 10: "annuler l'intégralité de la facture", "avoir complet", "Gutschrift", "kreditnota", "nota de crédito completa", "nota de crédito"
- Task 18: "annuler le paiement", "le paiement a été retourné par la banque", "paiement retourné", "Zahlung zurückgebucht", "pagamento devolvido pelo banco", "pago devuelto"

**Worked example (real corpus prompts)**
> Task 18: "Le paiement de Étoile SARL (nº org. 835510131) pour la facture "Session de formation" (19650 NOK HT) a été retourné par la banque. Annulez le paiement afin que la facture affiche à nouveau le montant impayé."

> Task 10 (equivalent shape): "Le client Étoile SARL (nº org. 955361490) a réclamé concernant la facture pour "Maintenance" (45550 NOK HT). Émettez un avoir complet qui annule l'intégralité de la facture."

**Decision rule:** The object of "annuler" is the critical discriminator. "annuler le **paiement**" → 18. "annuler la **facture**" / "avoir complet" → 10.

---

## FF-03: "Purregebyr" / "reminder fee" prompt → NOT Task 17 (Payment Registration)

**Wrong route:** Task 17 (Register Customer Invoice Payment)
**Correct route:** Task 25 (Overdue Reminder Fee and Partial Payment)

**Why it's a trap**
Task 17 and task 25 both involve registering a payment on an existing customer invoice. The false friend is when a prompt mentions "the invoice is overdue" — a classifier might stop at "register payment" and route to 17. Task 25 requires additional specific steps that task 17 does not.

**Misleading signals:**
- Both tasks involve locating an existing invoice
- Both tasks involve registering a payment
- "overdue" / "forfalt" / "überfällig" is present in both contexts

**Correct signals for task 25:**
- EXACT FEE: "reminder fee of 50 NOK" / "purregebyr på 50 kr"
- EXACT ACCOUNTS: "debit accounts receivable (1500), credit reminder fee income (3400)"
- EXACT PARTIAL AMOUNT: "partial payment of 5000 NOK" / "delbetaling på 5000 kr"
- Prompt also asks to CREATE AND SEND a separate fee invoice

**Worked example (real corpus prompt)**
> "En av kundene dine har en forfalt faktura. Finn den forfalte fakturaen og bokfør et purregebyr på 50 kr. Debet kundefordringer (1500), kredit purregebyr (3400). Opprett også en faktura for purregebyrene og send den til kunden. Registrer deretter en delbetaling på 5000 kr på den opprinnelige fakturaen."
> → Correct route: **Task 25**

> "Registrer betaling på fakturaen for kunden X (org.nr N) for tjenesten Z (25000 NOK ekskl. MVA)."
> → Correct route: **Task 17**

**Decision rule:** If ANY of the three 25-specific signals appear (50 NOK fee, accounts 1500+3400, 5000 NOK partial), route to 25. Do not route to 17 when the overdue invoice also involves a reminder-fee accounting step.

---

## FF-04: "Crea el proyecto" prompt with customer + manager → NOT Task 05 (Create Project)

**Wrong route:** Task 05 (Create Project)
**Correct route:** Task 14 (Set Project Fixed Price + Invoice Milestone) or Task 15 (Project Hours + Invoice)

**Why it's a trap**
"Create a project" language appears in tasks 05, 14, 15, and 29. A prompt that starts with "create the project" and names a customer and manager looks exactly like task 05 — but if it also sets a fixed price or registers hours, it belongs in 14 or 15 respectively.

**Misleading signals:**
- "create a project" / "créer un projet" / "opprett et prosjekt"
- Customer organization number given
- Manager email given

**Correct signals for 14:**
- "fixed price of X NOK" / "fastpris X kr" / "Festpreis X NOK" — a specific NOK amount as the project budget cap
- "invoice Y% of the fixed price" / "fakturere Y% av fastprisen"
- Milestone percentage or milestone amount stated

**Correct signals for 15:**
- "register X hours" / "registrer X timer"
- "hourly rate of Y NOK" / "timesats: Y kr"
- Specific activity name given

**Worked example (real corpus prompts)**

> Task 14: "Set a fixed price of 428550 NOK on the project 'CRM Integration' for Ironbridge Ltd (org no. 832020141). The project manager is Ella Williams (ella.williams@example.org). Invoice the customer for 25% of the fixed price."
> → Correct route: **Task 14** (not 05, even though it creates a project)

> Task 15: "Registrer 5 timer for Silje Strand (silje.strand@example.org) på aktiviteten 'Design' i prosjektet 'Skytjeneste-oppsett' for Nordhav AS (org.nr 912074005). Timesats: 1750 kr/t. Generer en prosjektfaktura."
> → Correct route: **Task 15** (project + hours + invoice)

> Task 05 (true): "Opprett prosjektet 'Analyse Sjøbris' knytt til kunden Sjøbris AS (org.nr 883693329). Prosjektleder er Steinar Berge (steinar.berge@example.org)."
> → Correct route: **Task 05** (no billing, no hours)

**Decision rule:** "Create project" alone → 05. "Create project + fixed price + milestone" → 14. "Existing/new project + hours + hourly rate" → 15.

---

## FF-05: "Onboard employee" with no contract → NOT Task 19

**Wrong route:** Task 19 (Onboard Employee from Contract)
**Correct route:** Task 06 (Create Employee)

**Why it's a trap**
The word "onboard" appears in AGENTS.md for task 19, and human prompts sometimes say "onboard the employee" loosely. But task 19 REQUIRES an attached PDF (offer letter or employment contract) with nested employment details. If no attachment exists and the prompt only gives name + birth date + email + start date, it is task 06.

**Misleading signals:**
- "onboard", "add the employee to Tripletex", "create the employee"
- Name + email + start date given

**Correct signals for 19:**
- "see attached PDF" / "se vedlagt PDF" / "voir PDF ci-joint"
- Annual salary + percentage FTE (not just start date)
- Occupation code or STYRK code mentioned
- Department to be created

**Correct signals for 06:**
- Birth date given
- Start date given
- No salary amounts
- No attached document
- No occupation code

**Worked example**

> Task 19: "Du har mottatt en arbeidskontrakt (se vedlagt PDF). Opprett den ansatte i Tripletex med alle detaljer fra kontrakten: personnummer, fødselsdato, avdeling, stillingskode, lønn, stillingsprosent og startdato."
> → Correct route: **Task 19**

> Task 06 (equivalent shape): "Create a new employee: Thomas Harris, born 1991-06-04, email thomas.harris@example.org, start date 2026-10-06."
> → Correct route: **Task 06**

**Decision rule:** An attached PDF with employment details is MANDATORY for task 19. Prompt wording alone ("onboard", "add employee") is not enough.

---

## FF-06: Project + supplier invoice within one prompt → NOT Task 16 (Supplier Invoice)

**Wrong route:** Task 16 (Register Supplier Invoice)
**Correct route:** Task 29 (Full Project Lifecycle)

**Why it's a trap**
Task 29 includes a supplier cost booking step. If a classifier sees the phrase "register the supplier invoice / cost for the project" in a larger lifecycle prompt, it might extract just that step and route to 16.

**Misleading signals:**
- Supplier name + org number + amount mentioned
- "register the supplier cost" / "leverandørkostnad"

**Correct signals for 29:**
- Multiple employees listed (each with hours)
- Customer creation or reuse
- Project creation with budget
- Hours registration
- Final customer invoice

**Decision rule:** If the supplier cost appears as ONE STEP in a larger multi-step lifecycle prompt that also includes project creation, employee hours, and a customer invoice → route the WHOLE prompt to task 29. Only route to 16 if the supplier invoice registration is the ENTIRE task.

---

## FF-07: "Create dimension + post voucher" — NOT Task 17 (Customer Invoice Payment)

**Wrong route:** Task 17 (Register Customer Invoice Payment)
**Correct route:** Task 07 (Create Accounting Dimension and Post Voucher)

**Why it's a trap**
The prompt-task-labels.jsonl file (confirmed suspect) had many task-07 prompts mislabeled as task 17. This cross-contamination reveals a real vocabulary overlap: both tasks involve posting a voucher, both involve ledger accounts, and the classifier may pick up the payment-posting language and wrongly route to 17.

**Misleading signals:**
- "post a voucher", "book a voucher", "bokfør et bilag"
- Account number given
- Amount given

**Correct signals for 07:**
- "create a dimension" / "opprett en dimensjon" / "free accounting dimension" / "fri regnskapsdimensjon"
- Dimension name + dimension value names (at least two)
- "link the voucher to the dimension value X"
- No invoice, no customer invoice outstanding

**Correct signals for 17:**
- "unpaid invoice", "register payment on the invoice"
- Customer organization number
- Invoice line description + ex-VAT amount

**Worked example (from corpus)**

> Task 07 (mislabeled as 17 in labels): "Créez une dimension comptable personnalisée 'Kostsenter' avec les valeurs 'IT' et 'HR'. Puis comptabilisez une pièce sur le compte 6590 pour 38100 NOK, liée à la valeur de dimension 'HR'."
> → Correct route: **Task 07** (dimension creation + voucher)

**Decision rule:** If the prompt creates a named accounting dimension with values and links a voucher to one value, it is always task 07, regardless of how much it sounds like a general voucher posting.

---

## FF-08: Travel expense prompt with duration-only → NOT Task 13 (resolved)

**Wrong route:** Task 13 (Register Travel Expense) as `resolved`
**Correct route:** Task 13 as `unresolved` with `code: "missing-required-field"` (or `ambiguous-field-value`)

**Why it's a trap**
Task 13 requires both `departureDate` and `returnDate` as required fields. Some travel expense prompts give only a duration ("the trip lasted 3 days") without explicit dates. These prompts match task 13 on all other dimensions but lack the dates needed for deterministic execution.

**Misleading signals:**
- All the task-13 vocabulary is present: travel expense, per diem, cost categories, employee email
- Duration in days is given
- Destination is given

**Missing signal:**
- No explicit departure or return date
- Only a duration: "3 days", "4 Tage", "4 jours", "3 dias"

**Worked example**
> "Register a travel expense for Lucy Walker (lucy.walker@example.org) for 'Client visit Bergen'. The trip lasted 3 days with per diem (800 NOK/day). Expenses: flight 6200 NOK, taxi 400 NOK."
> → This IS task 13, but `departureDate` and `returnDate` cannot be determined deterministically. Multiple Tripletex-accepted outcomes exist (sandbox produced 3 different valid delivered expenses from the same ambiguous prompt). Route as `unresolved` with `code: "ambiguous-field-value"`.

**Decision rule:** A travel expense prompt with only a day-count (no explicit dates) must not be resolved. Multiple valid date windows are equally plausible and the scorer may accept only one specific window. Return `unresolved` rather than guessing.

---

## FF-09: Ledger error prompt routed to 21 instead of 24

**Wrong route:** Task 21 (Correct Ledger Errors — Nynorsk / audit variant)
**Correct route:** Task 24 (Correct Ledger Errors — explicit error values variant)

**Why it's a trap**
Tasks 21 and 24 have identical AGENTS.md descriptions at a glance ("correct ledger errors", "Jan-Feb 2026", four errors, one corrective voucher). The classifier's default may be to pick 21 if it encounters this task family, regardless of language.

**Misleading signals:**
- Both: "discover errors in general ledger", "find the 4 errors", "Jan-Feb 2026"
- The AGENTS.md classifier cue says "choose the exact task id from the prompt wording" but this is circular if you don't know the mapping

**Correct signals for 24:**
- Specific account numbers listed for each error (e.g., "7300 used instead of 7000", "6500 used instead of 6540", "6290: 15200 instead of 13400")
- Specific amounts listed for each error
- Non-Nynorsk language (English, German, Portuguese, Spanish, French)

**Correct signals for 21:**
- Nynorsk language markers: "revisér alle bilaga", "finn dei fire feila", "korrektiven for januar og februar"
- OR prompt says "the ledger has four known errors" without enumerating account/amount specifics

**Worked example (production miss, 2026-03-21)**
> German prompt: "Wir haben Fehler im Hauptbuch für Januar und Februar 2026 entdeckt. Überprüfen Sie alle Belege und finden Sie die 4 Fehler: eine Buchung auf dem falschen Konto (Konto 7300 wurde anstelle von 7000 verwendet, Betrag 7800 NOK), einen doppelten Beleg auf Konto 7000 mit 5600 NOK, eine fehlende Mehrwertsteuerposition auf Konto 6540 mit 15600 NOK und einen falschen Betrag auf Konto 6290: 15200 NOK statt 13400 NOK. Buchen Sie die Korrekturbuchungen."
> → Was misclassified as **Task 21** in production. Correct route: **Task 24**.
> The explicit account numbers (7300→7000, 7000 duplicate, 6540 VAT, 6290 amount) and non-Nynorsk language confirm task 24.

**Decision rule:** If the prompt LISTS specific account numbers and amounts for each of the 4 errors → **24**. If the prompt implies errors exist without listing them → **21** (or ambiguous → unresolved).

---

## FF-10: "Create order" in task 11 vs task 09

**Wrong route:** Task 11 (Create Order, Invoice, Register Payment) when actually task 09 (Create Customer Invoice)
**Or vice versa:** Task 09 when actually task 11

**Why it's a trap**
Task 09 and task 11 both produce a customer invoice with multiple product lines. The difference is whether an ORDER object is explicitly created first and whether a PAYMENT step follows.

**Signal for 09:**
- "create an invoice" directly (no order step)
- Mixed VAT rates on lines
- No payment step

**Signal for 11:**
- "create an order", "créez une commande", "erstellen Sie eine Bestellung"
- Order is explicitly converted: "convert to invoice", "convertissez en facture"
- Full payment registered at the end

**Worked example (real corpus)**
> Task 11: "Créez une commande pour le client Forêt SARL (nº org. 962176127) avec les produits Maintenance (2417) à 32250 NOK et Développement système (7053) à 16900 NOK. Convertissez la commande en facture et enregistrez le paiement intégral."
> → Correct route: **Task 11** (order + invoice + payment)

> Task 09: "Créez une facture pour le client Lumière SARL (nº org. 925760838) avec trois lignes de produit: Maintenance (3644) à 1850 NOK avec 25 % TVA, Licence logicielle (4934) à 14850 NOK avec 15 % TVA, Assistance réseau (6217) à 9100 NOK avec 0 % TVA."
> → Correct route: **Task 09** (create invoice, no order, no payment)

**Decision rule:** "créez une commande" / "create an order" + "convert to invoice" + "register payment" → 11. "create an invoice" (no order, no payment) + multiple lines → 09.

---

## FF-11: Payroll prompt confused with employee creation

**Wrong route:** Task 06 (Create Employee)
**Correct route:** Task 12 (Run Payroll with Bonus)

**Why it's a trap**
Task 06 and task 12 both reference an employee. Task 12 prompts name the employee (by email), which might be parsed as "we need to create this employee" if the classifier doesn't recognize the payroll vocabulary.

**Worked example**
> Task 12: "Führen Sie die Gehaltsabrechnung für Marie Becker (marie.becker@example.org) für diesen Monat durch. Das Grundgehalt beträgt 44150 NOK. Fügen Sie einen einmaligen Bonus von 16200 NOK zum Grundgehalt hinzu."
> → Correct route: **Task 12** (payroll), NOT task 06 (create employee). Marie Becker already exists.

**Decision rule:** If the prompt gives an email AND a salary amount AND refers to "this month" → task 12. If the prompt gives a birth date AND no salary → task 06.

---

## FF-12: Receipt expense voucher confused with supplier invoice

**Wrong route:** Task 16 (Register Supplier Invoice)
**Correct route:** Task 22 (Register Receipt Expense Voucher)

**Why it's a trap**
Both tasks book an incoming expense. Task 22 prompts may feel like a supplier invoice because there's a monetary amount and an expense account.

**Misleading signals:**
- Amount stated
- Expense category mentioned (could sound like an expense account)
- "register this expense" / "bokfør dette"

**Correct signals for 22:**
- Department mentioned ("avdeling", "Abteilung", "département", "departamento")
- "receipt" / "kvittering" / "reçu" / "recibo" language
- Expense category: "Forretningslunsj", "Kontorstoler", "business lunch", "office chairs"
- No invoice number
- No supplier org number

**Correct signals for 16:**
- Formal supplier identity (name + org number)
- Invoice number (INV-XXXX format)
- Expense account number stated explicitly

**Worked example (real corpus)**
> Task 22: "Necesitamos el gasto de Forretningslunsj de este recibo registrado en el departamento Drift. Usa la cuenta de gastos correcta y asegura el tratamiento correcto del IVA."
> → Correct route: **Task 22** (receipt/expense voucher with department)

> Task 22: "Vi trenger Togbillett fra denne kvitteringen bokført på avdeling Utvikling."
> → Correct route: **Task 22** (receipt, department)

**Decision rule:** Department + receipt category + no invoice number → task 22. Supplier org number + formal invoice number + explicit account in text → task 16.

---

## Summary Table

| False Friend | Looks Like | Actually Is | Key Discriminator |
|---|---|---|---|
| DE "Rechnung vom Lieferanten erhalten" | 11 (customer invoice) | 16 (supplier invoice) | "Lieferanten" = supplier |
| FR "annuler le paiement" | 10 (credit note) | 18 (payment reversal) | "le paiement" ≠ "la facture" |
| Overdue invoice + register payment | 17 (payment reg.) | 25 (reminder fee + partial) | 50 NOK fee + accounts 1500/3400 |
| "Create project" + fixed price | 05 (create project) | 14 (fixed price + invoice) | fixed price amount present |
| "Onboard employee" (no contract PDF) | 19 (from contract) | 06 (create employee) | PDF attachment is mandatory for 19 |
| Supplier cost inside lifecycle prompt | 16 (supplier invoice) | 29 (full lifecycle) | context: multi-step lifecycle |
| "Post voucher on account 6590" | 17 (payment reg.) | 07 (dimension + voucher) | dimension creation precedes voucher |
| Travel expense, duration-only (no dates) | 13 (resolved) | 13 (unresolved — missing dates) | departure/return dates are required |
| Ledger errors (German, explicit amounts) | 21 (Nynorsk variant) | 24 (explicit values variant) | specific account/amount enumeration |
| FR "Créez une commande… enregistrez le paiement" | 09 (create invoice) | 11 (order + invoice + payment) | "commande" + "convertissez" + "paiement" |
| Payroll email + salary | 06 (create employee) | 12 (payroll) | salary + month = payroll |
| Receipt + department | 16 (supplier invoice) | 22 (receipt voucher) | no invoice number, has department |
