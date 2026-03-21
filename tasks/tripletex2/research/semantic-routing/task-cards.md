# Semantic Task Cards — Tripletex 30-Task Universe

> **Wave 1 research artifact.** Purpose: give a downstream classifier enough semantic
> signal to route prompts correctly before reading any task schema. This document
> covers the full task universe (IDs 01–30) using tripletex2 numbering.
>
> **Corpus note.** The only available labeled prompt evidence is at
> `tasks/tripletex/data/prompt-task-labels.jsonl`. That file uses OLD tripletex v1
> task IDs, which diverge systematically from the new tripletex2 IDs. All examples
> in this document have been remapped by content analysis, not by raw label. ~3–5%
> of old-corpus entries appear mislabeled (create-invoice prompts under old-04,
> project-hours under old-09, ledger-errors under old-15, invoice under old-17);
> these are flagged inline. Do not build a supervised classifier directly from raw
> old-corpus labels.
>
> **Canonical-universe policy.** All 30 tasks are retained in this document as
> full semantic entities, including tasks that currently have perfect scores and are
> excluded from live strategy routing. See the "Routing Policy vs Semantic Universe"
> section at the bottom for the explicit separation.

---

## Task 01 — Create customer

**Core intent:** Create a new customer master-data record in Tripletex.
**Real-world side effect:** A customer appears in the ledger; future invoices can be issued to them.

**Primary semantic cues:**
- Action: create / opprett / créez / erstellen / crie / crear
- Object: *customer* / *kunden* / *client* / *Kunden* / *cliente*
- Data given: `organizationNumber`, `email`, postal address (optional)

**Multilingual wording patterns:**
- NO: "Opprett kunden [Name] med organisasjonsnummer [N]. E-post: …"
- NN: "Opprett kunden … med organisasjonsnummer …"
- EN: "Create the customer [Name] with organization number [N]. Email: …"
- DE: "Erstellen Sie den Kunden [Name] mit der Organisationsnummer [N]."
- FR: "Créez le client [Name] avec le numéro d'organisation [N]."
- PT/ES: "Crie/Crea o/el cliente … com/con número de organização/organización …"

**Attachment cues:** None. All data supplied inline.

**Strongest negative cues — what this is NOT:**
- Not task 02 (Create supplier) — no "leverandør/supplier/Lieferant/fornecedor/proveedor"
- Not task 05 (Create project) — no project name, no project manager, no customer-linkage as a secondary entity
- Not task 08 (Create and send invoice) — no invoice amount, no service description
- Not task 29 (Full project lifecycle) — no multi-step structure

**Unresolved / abstention conditions:**
- If prompt says "create customer AND supplier" → probably mislabeled; flag for review.
- If prompt creates a customer AND immediately invoices them → consider task 08 or 09.

---

## Task 02 — Create supplier

**Core intent:** Create a new supplier in Tripletex. Invoice-style emails (`faktura@…`) must be mirrored to both `email` and `invoiceEmail`.
**Real-world side effect:** Supplier appears in AP ledger; supplier invoices can be booked.

**Primary semantic cues:**
- Action: register / create / opprett / registrer / registre / register
- Object: *supplier* / *leverandør* / *Lieferant* / *fournisseur* / *fornecedor* / *proveedor*
- Data given: organization number, email (often `faktura@…`)

**Multilingual wording patterns:**
- NO: "Registrer leverandøren [Name] med organisasjonsnummer [N]. E-post: faktura@…"
- EN: "Register the supplier [Name] with organization number [N]. Email: faktura@…"
- DE: "Registrieren Sie den Lieferanten [Name] mit der Organisationsnummer [N]."
- FR: "Enregistrez le fournisseur [Name] avec le numéro d'organisation [N]."
- PT/ES: "Registre/Registra o/el proveedor/fornecedor …"

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 01 (customer) — "supplier/leverandør" vs "customer/kunden"
- Not task 16 (Register supplier invoice) — no invoice number, no amount, no VAT
- Not task 20 (PDF supplier invoice) — no attachment

**Unresolved / abstention conditions:**
- Old corpus had one mislabeled prompt under old-04 that was actually a create-invoice prompt — ignore.
- If prompt says "create supplier AND register their invoice" → task 16 or 20 dominates.

---

## Task 03 — Create department

**Core intent:** Create one or more departments (often a list of 3). Multi-name prompts use batch create.
**Real-world side effect:** Department names appear in Tripletex for employee/cost assignment.

**Primary semantic cues:**
- Action: create / opprett / erstellen / créez / crie / crear
- Object: *department(s)* / *avdeling(er)* / *Abteilung(en)* / *département(s)* / *departamento(s)* / *avdelingar*
- Data given: list of 2–5 department names, often including Norwegian-language names like "Utvikling", "Økonomi", "HR", "Innkjøp", "Salg", "Logistikk"

**Multilingual wording patterns:**
- NO: "Opprett tre avdelinger i Tripletex: \"Utvikling\", \"Administrasjon\" og \"Lager\"."
- NN: "Opprett tre avdelingar i Tripletex: …"
- DE: "Erstellen Sie drei Abteilungen in Tripletex: \"HR\", \"Økonomi\" und \"Kundeservice\"."
- PT: "Crie três departamentos no Tripletex: …"

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 07 (accounting dimension) — department ≠ accounting dimension; "dimension/Kostsenter/dimensjon" is the discriminator
- Not task 05 (project) — no customer, no project manager

**Unresolved / abstention conditions:**
- If Norwegian dept names appear as PART of a larger task (e.g., task 19 onboarding), don't route to 03.

---

## Task 04 — Create product

**Core intent:** Create one product with name, product number, price (ex-VAT), and VAT rate.
**Real-world side effect:** Product appears in product catalog; can be used on invoices.

**Primary semantic cues:**
- Action: create / opprett / erstellen / créez / crie / crear
- Object: *product* / *produkt* / *Produkt* / *produit* / *produto* / *producto*
- Data given: product name (quoted), product number (integer), price in NOK ex-VAT, VAT rate %

**Multilingual wording patterns:**
- EN: "Create the product \"Cloud Storage\" with product number 8912. The price is 26850 NOK excluding VAT, with the standard rate of 25%."
- DE: "Erstellen Sie das Produkt \"Fachbuch\" mit der Produktnummer 2237. Der Preis beträgt 5650 NOK ohne MwSt., mit dem MwSt.-Satz von 0% für Bücher."
- PT: "Crie o produto \"Pão integral\" com número de produto 1871. O preço é 28350 NOK sem IVA, utilizando a taxa de IVA para alimentos de 15%."

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 09 or 11 — those USE products (with product numbers in parentheses on order lines); this CREATES the catalog entry
- Not task 03 (department) — no department names

**Unresolved / abstention conditions:**
- Product number given but no price → unlikely; probably a data-extraction edge.

---

## Task 05 — Create project

**Core intent:** Create a project linked to an existing customer and assign an existing employee as project manager. Minimal entity.
**Real-world side effect:** Project appears in Tripletex; hours and costs can be booked against it.

**Primary semantic cues:**
- Action: create / opprett / crea / crie / créez / erstellen
- Object: *project* / *prosjekt* / *proyecto* / *projeto* / *projet* / *Projekt*
- Data given: project name (quoted), customer org number + name, project manager email
- Key signal: project manager identified by EMAIL, customer by org number

**Multilingual wording patterns:**
- NO: "Opprett prosjektet \"[Name]\" knytt til kunden [Customer] (org.nr [N]). Prosjektleiar er [PM] ([email])."
- EN: "Create the project \"[Name]\" linked to the customer [Customer] (org no. [N]). The project manager is [PM] ([email])."
- ES: "Crea el proyecto \"[Name]\" vinculado al cliente [Customer] (org. nº [N]). El director del proyecto es [PM] ([email])."
- PT: "Crie o projeto \"[Name]\" vinculado ao cliente [Customer] (org. nº [N]). O gerente de projeto é [PM] ([email])."
- FR: "Créez le projet \"[Name]\" lié au client [Customer] (nº org. [N]). Le chef de projet est [PM] ([email])."

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 14 (fixed price) — no "fixed price"/"fastpris" and no invoice percentage
- Not task 15 (hours + invoice) — no hours, no hourly rate
- Not task 29 (full lifecycle) — no numbered steps, no budget, no supplier cost

**Unresolved / abstention conditions:**
- If prompt says "create project" but then immediately says "invoice X% of fixed price" → task 14.
- If prompt has 4 numbered steps → task 29.

---

## Task 06 — Create employee

**Core intent:** Create a new employee master-data record. Minimal identity fields: name, birth date, email, start date.
**Real-world side effect:** Employee appears in Tripletex HR; can be assigned to projects and payroll.

**Primary semantic cues:**
- Action: create / create (them) as an employee / "Crie-o como funcionário"
- Object: *employee* / *ansatt* / *Mitarbeiter* / *employé* / *funcionário* / *empleado*
- Data given: full name, birth date (format: "N. Month YYYY"), email, start date
- Note: "We have a new employee named X" is the canonical opening

**Multilingual wording patterns:**
- PT: "Temos um novo funcionário chamado [Name], nascido em [date]. Crie-o como funcionário com o e-mail [email] e data de início [date]."
- ES: "Tenemos un nuevo empleado llamado [Name], nacido el [date]. Créelo como empleado con el correo [email] y fecha de inicio [date]."
- EN: "We have a new employee named [Name], born [date]. Please create them as an employee with email [email] and start date [date]."

**Attachment cues:** None. (With attachment → task 19 or 21.)

**Strongest negative cues — what this is NOT:**
- Not task 19 (onboard from contract) — no PDF attachment, no employment details (STYRK code, salary %, standard hours)
- Not task 12 (payroll) — no salary amounts, not processing payroll for the month
- Not task 21 (onboard with full setup) — task 21 explicitly mentions offer letter PDF

**Unresolved / abstention conditions:**
- If prompt includes a PDF attachment and mentions department/salary → task 19 or 21 (not task 06).
- If prompt asks to "create employee" AND immediately run payroll → probably task 12 with embedded create.

---

## Task 07 — Create accounting dimension and post voucher

**Core intent:** Create a custom free accounting dimension (e.g., "Kostsenter" or "Marked"), add 2+ values (e.g., "IT", "HR"), then post a ledger voucher linked to one value.
**Real-world side effect:** A new dimension exists for cost-center tracking; one manual journal entry is posted.

**Primary semantic cues:**
- Action: create/opprett/erstellen + dimension + then post/book/bokfør/comptabilisez
- Object: *free accounting dimension* / *fri regnskapsdimensjon* / *benutzerdefinierte Buchhaltungsdimension* / *dimension comptable personnalisée* / *dimensão contabilística personalizada*
- Data given: dimension name (e.g., "Kostsenter", "Marked", "Region"), value names (2–3), posting account number, amount in NOK

**Multilingual wording patterns:**
- NO: "Opprett en fri regnskapsdimensjon \"Kostsenter\" med verdiene \"Innkjøp\" og \"Logistikk\". Bokfør deretter et bilag på konto 6590 for 34250 kr, knyttet til dimensjonsverdien \"Innkjøp\"."
- EN: "Create a custom accounting dimension \"Marked\" with the values \"Offentlig\" and \"Privat\". Then post a voucher on account 7300 for 37250 NOK, linked to the dimension value \"Privat\"."
- FR: "Créez une dimension comptable personnalisée \"Kostsenter\" avec les valeurs \"IT\" et \"HR\". Puis comptabilisez une pièce sur le compte 6590 pour 38100 NOK, liée à la valeur de dimension \"HR\"."
- DE: "Erstellen Sie eine benutzerdefinierte Buchhaltungsdimension \"Region\" mit den Werten \"Vestlandet\" und \"Midt-Norge\". Buchen Sie dann einen Beleg auf Konto 6540 über 8600 NOK."
- PT: "Crie uma dimensão contabilística personalizada \"Region\" com os valores \"Vestlandet\" e \"Midt-Norge\". Em seguida, lance um documento na conta 6860 por 47500 NOK."

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 03 (department) — "avdeling/Abteilung/département" is not a "fri dimensjon/free dimension"
- Not task 21/24 (correct ledger errors) — no mention of errors, correction, or scanning vouchers
- Not task 22 (receipt expense) — no receipt, no expense category

**Unresolved / abstention conditions:**
- Old corpus had one mislabeled prompt under old-17 that was actually a multi-line invoice prompt — ignore.

---

## Task 08 — Create and send invoice (⚠ confusion zone: 08 vs 09 vs 11)

**Core intent:** Create a new customer, resolve VAT, create a single-line invoice, and send it in the same write call. Customer often has no pre-existing account.
**Real-world side effect:** An invoice is created AND dispatched to the customer in one operation.

**Primary semantic cues:**
- Action: *create AND send* / "opprett og send" / "crear y enviar" / "crie e envie" / "créez et envoyez"
- Single invoice line with a service description (no product numbers given)
- Amount in NOK ex-VAT for a named service

**Multilingual wording patterns:**
- EN: "Create and send an invoice to the customer [Name] (org no. [N]) for [X] NOK excluding VAT. The invoice is for [Service]."
- NO: "Opprett og send en faktura til kunden [Name] (org.nr [N]) på [X] kr eksklusiv MVA. Fakturaen gjelder [Service]."
- NN: "Opprett og send ein faktura til kunden [Name] (org.nr [N]) på [X] kr eksklusiv MVA. Fakturaen gjeld [Service]."
- PT: "Crie e envie uma fatura ao cliente [Name] (org. nº [N]) por [X] NOK sem IVA. A fatura refere-se a [Service]."

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 09: Task 09 has MULTIPLE product lines (usually 3), uses product numbers in parentheses, and has mixed VAT rates (25%+15%+0%); task 08 has ONE line and no product numbers.
- Not task 11: Task 11 has "create an ORDER", "convert the order to invoice", AND registers payment — three explicit phases; task 08 is single-step.
- Not task 14/15: those involve existing PROJECTS.
- Not task 06: no "create customer" — but the customer here is usually NEW with no email (MANUAL send method).

**Unresolved / abstention conditions:**
- If prompt specifies product numbers like "(8912)" → more likely task 09.
- If prompt says "register payment" → more likely task 11.

---

## Task 09 — Create customer invoice (⚠ confusion zone: 08 vs 09 vs 11)

**Core intent:** Create a multi-line outgoing invoice for an existing customer using existing products identified by name AND number. Mixed VAT rates are canonical (25%, 15% food, 0%).
**Real-world side effect:** Invoice is created but NOT sent (sendToCustomer=false is the default).

**Primary semantic cues:**
- Three product lines with product numbers in parentheses: "[Description] ([number]) at [X] NOK with [Z]% VAT"
- Mixed VAT rates: 25% standard + 15% food category ("næringsmiddel"/"alimento"/"aliment") + sometimes 0%
- Customer identified by org number; invoice NOT sent

**Multilingual wording patterns:**
- FR: "Créez une facture pour le client [Name] (nº org. [N]) avec trois lignes de produit : [Desc] ([num]) à [X] NOK avec 25% TVA, [Desc] ([num]) à [Y] NOK avec 15% TVA (aliments), et [Desc] ([num]) à [Z] NOK avec 0% TVA."
- NO/NN: "Opprett ein/en faktura til kunden [Name] med tre produktlinjar/linjer: [Desc] ([num]) til [X] kr med 25% MVA, [Desc] ([num]) til [Y] kr med 15% MVA (næringsmiddel), og [Desc] ([num]) til [Z] kr med 0%."
- EN: "Create an invoice for the customer [Name] (org no. [N]) with three product lines: [Desc] ([num]) at [X] NOK with 25% VAT, [Desc] ([num]) at [Y] NOK with 15% VAT (food), and [Desc] ([num]) at [Z] NOK with 0% VAT."
- ES: "Crea una factura para el cliente [Name] (org. nº [N]) con tres líneas de producto: [Desc] ([num]) a [X] NOK con 25% IVA, [Desc] ([num]) a [Y] NOK con 15% IVA (alimento), …"

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 08: Task 08 has ONE line, no product numbers, and "create AND send"; task 09 has 3 lines and is not sent.
- Not task 11: Task 11 uses ORDER flow (explicit "order"/"pedido"/"commande") AND registers payment.
- Old corpus had one mislabeled prompt under old-09 about registering project hours — ignore.

**Unresolved / abstention conditions:**
- If 2 product lines (not 3) → still likely task 09 unless "order" and payment are mentioned.
- If no product numbers given → consider task 08.

---

## Task 10 — Issue full credit note (⚠ confusion zone: 10 vs 18)

**Core intent:** Issue a full credit note that reverses an entire existing outgoing invoice. Triggered by a customer complaint.
**Real-world side effect:** A credit note invoice is created; the original invoice balance is neutralized.

**Primary semantic cues:**
- Customer COMPLAINED ("reklamiert", "réclamé", "reklamert", "has complained about", "har reklamert")
- "Full credit note" / "vollständige Gutschrift" / "avoir complet" / "kreditnota" / "nota de crédito completa"
- The original invoice is identified by service description + ex-VAT amount

**Multilingual wording patterns:**
- DE: "Der Kunde [Name] hat die Rechnung für \"[Service]\" ([X] NOK ohne MwSt.) reklamiert. Erstellen Sie eine vollständige Gutschrift, die die gesamte Rechnung storniert."
- FR: "Le client [Name] a réclamé concernant la facture pour \"[Service]\" ([X] NOK HT). Émettez un avoir complet qui annule l'intégralité de la facture."
- EN: "The customer [Name] has complained about the invoice for \"[Service]\" ([X] NOK excl. VAT). Issue a full credit note that reverses the entire invoice."
- NO/NN: "Kunden [Name] har reklamert på fakturaen for \"[Service]\" ([X] kr ekskl. MVA). Opprett ei fullstendig kreditnota som reverserer heile fakturaen."
- PT: "O cliente [Name] reclamou sobre a fatura para \"[Service]\" ([X] NOK sem IVA). Emita uma nota de crédito completa que reverte toda a fatura."

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 18: Task 18 involves a PAYMENT being returned by the bank — the invoice itself was not complained about; it's a payment reversal.
- Not task 17: Task 17 registers a new payment; task 10 reverses an invoice.

**Unresolved / abstention conditions:**
- If prompt says "partial credit note" → this is not a known task variant; abstain or route to 10 with caveat.

---

## Task 11 — Create order, invoice, and register payment (⚠ confusion zone: 08 vs 09 vs 11)

**Core intent:** Create an order with existing products, convert the order to an invoice, and settle full payment in the same flow. Three-phase: order → invoice → payment.
**Real-world side effect:** An order, an invoice, AND a payment are registered in Tripletex.

**Primary semantic cues:**
- Explicit "order"/"ordre"/"pedido"/"Auftrag"/"commande" creation
- "Convert the order to invoice" / "convertissez la commande en facture" / "convierte el pedido en factura" / "wandeln Sie den Auftrag in eine Rechnung um"
- "Register the payment" / "enregistrez le paiement" / "registra el pago"
- Products given with numbers AND amounts (but 2 products, not 3)

**Multilingual wording patterns:**
- FR: "Créez une commande pour le client [Name] (nº org. [N]) avec les produits [Desc] ([num]) à [X] NOK et [Desc] ([num]) à [Y] NOK. Convertissez la commande en facture et enregistrez le paiement."
- ES: "Crea un pedido para el cliente [Name] (org. nº [N]) con los productos [Desc] ([num]) a [X] NOK y [Desc] ([num]) a [Y] NOK. Convierte el pedido en factura y registra el pago."
- DE: "Erstellen Sie einen Auftrag für den Kunden [Name] mit den Produkten [Desc] ([num]) zu [X] NOK und [Desc] ([num]) zu [Y] NOK. Wandeln Sie den Auftrag in eine Rechnung um und registrieren Sie die Zahlung."
- PT: "Crie um pedido para o cliente [Name] com os produtos [Desc] ([num]) a [X] NOK e [Desc] ([num]) a [Y] NOK. Converta o pedido em fatura e registe o pagamento."

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 08: No "order" keyword; task 08 is single-line invoice + send, not order + pay.
- Not task 09: Task 09 has 3 lines with mixed VAT and no payment; task 11 has 2 products + payment.
- Not task 17: Task 17 is a standalone payment on an existing unpaid invoice; task 11 creates the full chain from scratch.

**Unresolved / abstention conditions:**
- If 3 products with mixed VAT and no payment → task 09. If 2 products and payment → task 11.

---

## Task 12 — Run payroll with bonus (⚠ confusion zone: 06 vs 12 vs 13 vs 19)

**Core intent:** Execute payroll for one named employee for the current month: base salary + one-time bonus.
**Real-world side effect:** Salary transaction posted for the employee; payroll is processed.

**Primary semantic cues:**
- "Process salary" / "run payroll" / "run the payroll for" / "processe o salário" / "Führen Sie die Gehaltsabrechnung durch" / "exécutez la paie" / "ejecute la nómina"
- Employee identified by email
- Base salary amount (NOK) + bonus amount (NOK)
- Time reference: "for this month" / "para este mês" / "für diesen Monat" / "pour ce mois"

**Multilingual wording patterns:**
- PT: "Processe o salário de [Name] ([email]) para este mês. O salário base é de [X] NOK. Adicione um bónus único de [Y] NOK além do salário base."
- DE: "Führen Sie die Gehaltsabrechnung für [Name] ([email]) für diesen Monat durch. Das Grundgehalt beträgt [X] NOK. Fügen Sie einen einmaligen Bonus von [Y] NOK hinzu."
- ES: "Ejecute la nómina de [Name] ([email]) para este mes. El salario base es de [X] NOK. Añada una bonificación única de [Y] NOK."
- FR: "Exécutez la paie de [Name] ([email]) pour ce mois. Le salaire de base est de [X] NOK. Ajoutez une prime unique de [Y] NOK."

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 06: Task 06 creates the employee record; task 12 processes payroll for an existing one.
- Not task 13: Task 13 is about travel and per-diem, not salary.
- Not task 19: Task 19 has a PDF attachment.

**Unresolved / abstention conditions:**
- If employee doesn't exist in the prompt (needs creating) → may need task 06 pre-step; but route to 12.

---

## Task 13 — Register travel expense (⚠ confusion zone: 06 vs 12 vs 13 vs 19)

**Core intent:** Register travel expenses for an existing employee with explicit dates/duration, per-diem compensation, and itemized out-of-pocket costs (flight, taxi, etc.). Deliver the expense report.
**Real-world side effect:** Travel expense is posted for the employee; reimbursement is captured.

**Primary semantic cues:**
- "Travel expense" / "reisekostenabrechnung" / "Reisekostenabrechnung" / "nota de gastos de viaje" / "despesa de viagem" / "reiserekning"
- Trip title (quoted, often a city visit): "Client visit [City]" / "Kundebesøk [City]" / "Conferencia [City]"
- Duration: "N days" / "N dager" / "N Tage"
- Per diem: "per diem (daily rate 800 NOK)" / "Tagegeld (Tagessatz 800 NOK)" / "dietas (tarifa diaria 800 NOK)"
- Expense items: "flight ticket [X] NOK and taxi [Y] NOK"

**Multilingual wording patterns:**
- DE: "Erfassen Sie eine Reisekostenabrechnung für [Name] ([email]) für \"[Trip]\". Die Reise dauerte [N] Tage mit Tagegeld (Tagessatz 800 NOK). Auslagen: Flugticket [X] NOK und Taxi [Y] NOK."
- EN: "Register a travel expense for [Name] ([email]) for \"[Trip]\". The trip lasted [N] days with per diem (daily rate 800 NOK). Expenses: flight ticket [X] NOK and taxi [Y] NOK."
- NO/NN: "Registrer ei reiserekning for [Name] ([email]) for \"[Trip]\". Reisa varte [N] dagar med diett (dagssats 800 kr). Utlegg: flybillett [X] kr og taxi [Y] kr."
- ES: "Registre una nota de gastos de viaje para [Name] ([email]) por \"[Trip]\". El viaje duró [N] días con dietas (tarifa diaria 800 NOK). Gastos: billete de avión [X] NOK y taxi [Y] NOK."
- PT: "Registe uma despesa de viagem para [Name] ([email]) referente a \"[Trip]\". A viagem durou [N] dias com ajudas de custo (taxa diária 800 NOK). Despesas: bilhete de avião [X] NOK e taxi [Y] NOK."

**Attachment cues:** None for text-based variant. (Some prompts may mention a receipt; route to 22 if a receipt attachment drives the whole expense.)

**Strongest negative cues — what this is NOT:**
- Not task 12: No "salary/payroll/lønn" language; the financial amounts here are travel costs, not salary.
- Not task 22: Task 22 is about a specific receipt and its expense account; task 13 is a structured travel claim with duration, per diem, and itemized costs.

**Unresolved / abstention conditions:**
- Old corpus had one task-15 prompt that was actually a travel-expense (mislabeled); route by content.

---

## Task 14 — Set project fixed price and invoice milestone (⚠ confusion zone: 05 vs 14 vs 15 vs 29)

**Core intent:** Set a fixed price on an existing project, assign project manager, link customer, and invoice a percentage of the fixed price as a milestone payment.
**Real-world side effect:** Project has a fixed-price contract; a partial invoice is issued.

**Primary semantic cues:**
- "Fixed price" / "fastpris" / "Festpreis" / "prix forfaitaire" / "preço fixo" / "precio fijo"
- A specific NOK amount for the fixed price
- Invoice percentage: "25% of the fixed price" / "50%" / "33%"
- Project name + customer + project manager (typical full setup)

**Multilingual wording patterns:**
- EN: "Set a fixed price of [X] NOK on the project \"[Name]\" for [Customer] (org no. [N]). The project manager is [PM] ([email]). Invoice the customer for [Y]% of the fixed price as a partial payment."
- NO: "Sett fastpris [X] kr på prosjektet \"[Name]\" for [Customer] (org.nr [N]). Prosjektleder er [PM] ([email]). Fakturer kunden for [Y]% av fastprisen som ei delbetaling."
- DE: "Legen Sie einen Festpreis von [X] NOK für das Projekt \"[Name]\" für [Customer] fest. Projektleiter ist [PM] ([email]). Stellen Sie dem Kunden [Y]% als Teilrechnung in Rechnung."
- FR: "Fixez un prix forfaitaire de [X] NOK sur le projet \"[Name]\" pour [Customer]. Le chef de projet est [PM] ([email]). Facturez au client [Y]% du prix forfaitaire."
- PT: "Defina um preço fixo de [X] NOK no projeto \"[Name]\" para [Customer]. O gestor de projeto é [PM] ([email]). Fature ao cliente [Y]% do preço fixo."
- ES: "Establezca un precio fijo de [X] NOK en el proyecto \"[Name]\" para [Customer]. El director del proyecto es [PM] ([email]). Facture al cliente [Y]% del precio fijo."

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 05: Task 05 just creates the project entity with no financial operations.
- Not task 15: Task 15 registers HOURS and creates a time-based invoice; no fixed price or percentage.
- Not task 29: Task 29 has 4+ numbered lifecycle steps including budget, hours, supplier cost.

**Unresolved / abstention conditions:**
- Old corpus had one mislabeled task-15 prompt that was a ledger-error prompt — ignore.

---

## Task 15 — Register project hours and create project invoice (⚠ confusion zone: 05 vs 14 vs 15 vs 29)

**Core intent:** Register hours for one employee on a project activity (with hourly rate), then create a project invoice from those hours.
**Real-world side effect:** Timesheet entry is posted; a project invoice is created.

**Primary semantic cues:**
- "Register [N] hours for [Employee]" / "Registrer [N] timer for" / "Erfassen Sie [N] Stunden für" / "Enregistrez [N] heures pour"
- "Activity" name (e.g., "Design", "Rådgivning", "Conseil")
- "Hourly rate [X] NOK/h" / "timesats [X] kr/t" / "Stundensatz [X] NOK/h" / "taux horaire [X] NOK/h"
- Project name + customer + employee email
- "Generate/create a project invoice" at the end

**Multilingual wording patterns:**
- NO: "Registrer [N] timer for [Name] ([email]) på aktiviteten \"[Activity]\" i prosjektet \"[Project]\" for [Customer] (org.nr [N]). Timesats: [X] kr/t. Generer en prosjektfaktura."
- DE: "Erfassen Sie [N] Stunden für [Name] ([email]) auf der Aktivität \"[Activity]\" im Projekt \"[Project]\" für [Customer]. Stundensatz: [X] NOK/h. Erstellen Sie eine Projektrechnung."
- FR: "Enregistrez [N] heures pour [Name] ([email]) sur l'activité \"[Activity]\" du projet \"[Project]\" pour [Customer]. Taux horaire : [X] NOK/h. Générez une facture de projet."
- NO/NN: "Registrer [N] timar for [Name] ([email]) på aktiviteten \"[Activity]\" i prosjektet \"[Project]\"..."

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 05: Task 05 has no hours, no rate.
- Not task 14: Task 14 has "fixed price" and a percentage milestone; no per-hour registration.
- Not task 29: Task 29 has multiple employees' hours + supplier cost + budget as numbered steps.

**Unresolved / abstention conditions:**
- Old corpus had one mislabeled old-09 prompt about project hours — route by content.

---

## Task 16 — Register supplier invoice (text-based) (⚠ confusion zone: 16 vs 20 vs 22)

**Core intent:** Register a supplier invoice received in text form (no PDF). Invoice number is given explicitly; supplier may or may not exist.
**Real-world side effect:** Supplier invoice is imported and posted to the ledger with correct expense account and input VAT.

**Primary semantic cues:**
- Invoice number given: "invoice INV-2026-XXXX" / "faktura INV-2026-XXXX" / "Rechnung INV-2026-XXXX"
- Amount "including VAT" (brutto amount given)
- Expense account number mentioned: "konto 6590" / "account 6300" / "Konto 7300"
- Supplier identified by org number + name

**Multilingual wording patterns:**
- DE: "Wir haben die Rechnung INV-2026-[N] vom Lieferanten [Name] (Org.-Nr. [N]) über [X] NOK einschließlich MwSt. erhalten. Der Betrag betrifft [Service] (Konto [N]). Erfassen Sie die Lieferantenrechnung."
- NO/NN: "Me har motteke faktura INV-2026-[N] frå leverandøren [Name] (org.nr [N]) på [X] kr inklusiv MVA. Beløpet gjeld [Service] (konto [N]). Registrer leverandørfakturaen."
- EN: "We have received invoice INV-2026-[N] from the supplier [Name] (org no. [N]) for [X] NOK including VAT. The amount relates to [Service] (account [N]). Register the supplier invoice."

**Attachment cues:** NO attachment. This is the text-based variant; attachment → task 20.

**Strongest negative cues — what this is NOT:**
- Not task 20: Task 20 explicitly says "see attached PDF"; task 16 has all data inline.
- Not task 22: Task 22 is a receipt expense voucher (receipt, not supplier invoice), with a department.
- Not task 02: Task 02 creates the supplier master data; task 16 registers the invoice.

**Unresolved / abstention conditions:**
- If invoice number is missing and a PDF is mentioned → task 20.
- If "receipt" is mentioned → task 22.

---

## Task 17 — Register customer invoice payment (⚠ confusion zone: 17 vs 25 vs 27)

**Core intent:** Register full payment on an existing unpaid customer invoice. Straightforward payment registration.
**Real-world side effect:** Invoice moves to paid status; bank account is debited.

**Primary semantic cues:**
- "[Customer] has an outstanding invoice for [X] NOK excluding VAT for \"[Service]\". Register full payment."
- "outstanding invoice" / "utestående faktura" / "offene Rechnung" / "facture impayée" / "fatura pendente"
- "Register full payment" / "Registrer full betaling" / "vollständige Zahlung" / "paiement complet"
- Customer identified by org number

**Multilingual wording patterns:**
- NO: "Kunden [Name] (org.nr [N]) har en utestående faktura på [X] kr eksklusiv MVA for \"[Service]\". Registrer full betaling på denne fakturaen."
- EN: "The customer [Name] (org no. [N]) has an outstanding invoice for [X] NOK excluding VAT for \"[Service]\". Register full payment on this invoice."

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 25: Task 25 involves an OVERDUE invoice + a REMINDER FEE (50 NOK posted to 1500/3400) + partial payment (5000 NOK) — much more complex.
- Not task 27: Task 27 involves a foreign-currency (EUR) invoice with two exchange rates mentioned.
- Not task 18: Task 18 is about REVERSING an already-registered payment.

**Unresolved / abstention conditions:**
- If "returned by bank" or "bank return" → task 18.
- If "overdue" + reminder fee → task 25.
- If "EUR" + two exchange rates → task 27.

---

## Task 18 — Reverse customer invoice payment (⚠ confusion zone: 10 vs 18)

**Core intent:** Reverse an already-registered payment on a customer invoice because the bank returned it. The invoice should show as outstanding again.
**Real-world side effect:** Payment is reversed; invoice returns to unpaid status.

**Primary semantic cues:**
- "payment... was returned by the bank" / "betalinga... vart returnert av banken" / "paiement... retourné par la banque" / "pago... devuelto por el banco" / "pagamento... devolvido pelo banco"
- "Reverse the payment" / "Reverser betalingen" / "Stornieren Sie die Zahlung" / "Annulez le paiement" / "Reverta o pagamento"
- "so the invoice shows outstanding amount again" / "slik at fakturaen igjen viser utestående beløp"

**Multilingual wording patterns:**
- NO: "Betalingen fra [Customer] (org.nr [N]) for fakturaen \"[Service]\" ([X] kr ekskl. MVA) ble returnert av banken. Reverser betalingen slik at fakturaen igjen viser utestående beløp."
- FR: "Le paiement de [Customer] pour la facture \"[Service]\" ([X] NOK HT) a été retourné par la banque. Annulez le paiement afin que la facture affiche à nouveau le montant impayé."
- DE: "Die Zahlung von [Customer] für die Rechnung \"[Service]\" ([X] NOK ohne MwSt.) wurde von der Bank zurückgebucht. Stornieren Sie die Zahlung, damit die Rechnung wieder den ausstehenden Betrag anzeigt."
- ES: "El pago de [Customer] (org. nº [N]) por la factura \"[Service]\" ([X] NOK sin IVA) fue devuelto por el banco. Revierta el pago para que la factura vuelva a mostrar el importe pendiente."
- PT: "O pagamento de [Customer] referente à fatura \"[Service]\" ([X] NOK sem IVA) foi devolvido pelo banco. Reverta o pagamento para que a fatura volte a mostrar o montante em aberto."
- NN: "Betalinga frå [Customer] for fakturaen \"[Service]\" ([X] kr ekskl. MVA) vart returnert av banken. Reverser betalinga slik at fakturaen igjen viser uteståande beløp."

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 10: Task 10 involves customer COMPLAINT → full credit note. Task 18 is specifically about a BANK RETURN of an already-registered payment.
- Not task 17: Task 17 registers a new payment; task 18 reverses one.

**Unresolved / abstention conditions:**
- If the wording says "cancel the invoice" rather than "cancel the payment" → task 10.

---

## Task 19 — Onboard employee from contract (attachment) (⚠ confusion zone: 06 vs 12 vs 13 vs 19)

**Core intent:** Read an employee contract or offer letter from a PDF attachment and create the employee with full employment details (department, STYRK/occupation code, salary, work percentage, standard hours, start date).
**Real-world side effect:** Employee is fully configured for payroll and project assignment.

**Primary semantic cues:**
- **PDF attachment present** — this is the PRIMARY discriminator
- "employment contract" / "arbeidskontrakt" / "Angebotsschreiben"/"Arbeitsvertrag" / "lettre d'offre" / "contrato de trabajo" / "contrato de trabalho"
- Rich employment details: department, STYRK code, salary %, standard hours, start date, personnummer/fødselsdato

**Multilingual wording patterns:**
- NO: "Du har mottatt en arbeidskontrakt (se vedlagt PDF). Opprett den ansatte i Tripletex med alle detaljer fra kontrakten: personnummer, fødselsdato, avdeling, stillingskode, lønn, stillingsprosent og startdato."
- FR: "Vous avez recu une lettre d'offre (voir PDF ci-joint) pour un nouvel employe. Effectuez l'integration complete : creez l'employe, attribuez le bon departement, configurez les details d'emploi avec le pourcentage et le salaire annuel, et configurez les heures de travail standard."
- DE: "Sie haben ein Angebotsschreiben erhalten (siehe beigefugte PDF) fuer einen neuen Mitarbeiter. Fuehren Sie das vollstaendige Onboarding durch: erstellen Sie den Mitarbeiter, weisen Sie die richtige Abteilung zu, richten Sie die Beschaeftigungsdetails ein."

**Attachment cues:** PDF attachment always present. This is the task 19/21 defining signal. Without attachment → task 06.

**Strongest negative cues — what this is NOT:**
- Not task 06: Task 06 has all data inline (no attachment) and only basic fields.
- Not task 12: No salary processing; this is setup, not payroll execution.

**Unresolved / abstention conditions:**
- Task 19 vs attachment-based onboarding in old corpus: treat both Norwegian contract and multilingual offer letter as task 19 (same schema).

---

## Task 20 — Register supplier invoice with PDF attachment (⚠ confusion zone: 16 vs 20 vs 22)

**Core intent:** Parse a supplier invoice from an attached PDF and register it in Tripletex. Create the supplier if it doesn't exist.
**Real-world side effect:** Supplier invoice is booked using data extracted from the PDF.

**Primary semantic cues:**
- "see attached PDF" / "ver PDF adjunto" / "voir PDF ci-joint" / "see the attached PDF"
- "supplier invoice" / "leverandørfaktura" / "factura de proveedor" / "facture fournisseur"
- "Create the supplier if it does not exist" / "Crea el proveedor si no existe"
- "Use the correct expense account and input VAT" / "Usa la cuenta de gastos correcta"

**Multilingual wording patterns:**
- EN: "You received a supplier invoice (see attached PDF). Register the invoice in Tripletex. Create the supplier if it does not exist. Use the correct expense account and input VAT."
- ES: "Has recibido una factura de proveedor (ver PDF adjunto). Registra la factura en Tripletex. Crea el proveedor si no existe. Usa la cuenta de gastos correcta y el IVA de entrada."

**Attachment cues:** PDF invoice always attached. This is the primary discriminator vs task 16.

**Strongest negative cues — what this is NOT:**
- Not task 16: Task 16 has all invoice data inline (INV-XXXX, account, amount with VAT); task 20 requires reading the PDF.
- Not task 22: Task 22 is a receipt (single expense line, department context), not a supplier invoice.
- Not task 19: Task 19 attachment is an employee contract, not an invoice.

**Unresolved / abstention conditions:**
- If attachment is a receipt (not an invoice) → task 22.

---

## Task 21 — Correct ledger errors — implicit scan variant (⚠ confusion zone: 21 vs 24 vs 28)

**Core intent:** Audit Jan–Feb 2026 vouchers for four known error types (wrong account, duplicate, missing VAT, wrong amount) where the specific account/amount details are NOT enumerated in the prompt. Runtime must discover them by scanning the live ledger.
**Real-world side effect:** Corrective journal entries are posted.

**Primary semantic cues:**
- "errors in the ledger" / "errors in the general ledger" / "erros no livro razão"
- Jan–Feb 2026 time frame mentioned
- Four error types mentioned but NOT with specific account numbers
- "Correct all errors" / "correct with corrective entries"

**Multilingual wording patterns:** (Weakly evidenced — extrapolated from strategy notes and known task-24 contrast.)
- May appear in Norwegian Nynorsk (NN) based on memory file notes about "Nynorsk variant"
- "Revise alle bilag og finn feil" type structure without explicit account/amount specs

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 24: Task 24 EXPLICITLY lists each of the 4 errors with specific account numbers and amounts in the prompt text.
- Not task 28: Task 28 finds TRENDS (largest increase), not errors; and creates internal projects.

**Unresolved / abstention conditions:**
- ⚠ **Weakly evidenced.** The distinction between 21 and 24 rests on whether the prompt explicitly enumerates the 4 error specs. This is a fine-grained routing decision. Known production failure: a German task-24 prompt (explicit 4-error listing) was misclassified as task-21 (2026-03-21).
- If prompt explicitly says "find the 4 errors: wrong account (account X used instead of Y, value N NOK), duplicate voucher (account Z, value M NOK), missing VAT (account W, excl. N NOK), wrong amount (account V, X NOK instead of Y NOK)" → task 24.
- If prompt says errors exist but doesn't specify exact accounts/amounts → task 21.

---

## Task 22 — Register receipt expense voucher (attachment) (⚠ confusion zone: 16 vs 20 vs 22)

**Core intent:** Book a single expense line from a receipt attachment to the correct expense account and department, with correct VAT treatment.
**Real-world side effect:** Manual expense voucher is posted; receipt is attached.

**Primary semantic cues:**
- **Receipt** (not invoice) from an attachment
- Department mentioned explicitly: "department Utvikling" / "avdeling Utvikling" / "departamento Drift"
- Expense type from receipt: "Togbillett" (train), "Forretningslunsj" (business lunch), "Kontorstoler" (office chairs)
- "Use the correct expense account" / "bruk riktig utgiftskonto"
- "Ensure correct VAT treatment" / "korrekt MVA-behandling"

**Multilingual wording patterns:**
- NO: "Vi trenger [ExpenseType] fra denne kvitteringen bokfort pa avdeling [Dept]. Bruk riktig utgiftskonto basert pa kjopet, og sorg for korrekt MVA-behandling."
- ES: "Necesitamos el gasto de [ExpenseType] de este recibo registrado en el departamento [Dept]. Usa la cuenta de gastos correcta y asegura el tratamiento correcto del IVA."

**Attachment cues:** Receipt attachment always present. Combined with "department" mention, this is a strong two-signal discriminator.

**Strongest negative cues — what this is NOT:**
- Not task 16: Task 16 has supplier invoice number (INV-XXXX) and full invoice data, no receipt.
- Not task 20: Task 20 is a formal supplier invoice PDF; task 22 is a receipt.
- Not task 13: Task 13 has trip duration, per diem, multiple expense items; task 22 is a single receipt line.

**Unresolved / abstention conditions:**
- If no department mentioned → still likely task 22 if "receipt" and "expense account" language present.

---

## Task 23 — Reconcile bank statement (CSV attachment) (⚠ confusion zone: 23 vs 26 vs 30)

**Core intent:** Match rows from an attached bank statement CSV to open customer invoices (incoming) and supplier invoices (outgoing). Handle partial payments.
**Real-world side effect:** Multiple invoice payments are registered or vouchers posted for bank reconciliation.

**Primary semantic cues:**
- **CSV attachment** — primary discriminator
- "bank statement" / "bankutskrift" / "bankutskrifta" / "relevé bancaire" / "extracto bancario"
- "match" / "reconcile" / "match incoming payments to customer invoices"
- "outgoing payments to supplier invoices"
- "handle partial payments"

**Multilingual wording patterns:**
- NO/NN: "Avstem bankutskrifta (vedlagt CSV) mot opne fakturaer i Tripletex. Match innbetalingar til kundefakturaer og utbetalingar til leverandorfakturaer. Handter delbetalingar korrekt."
- EN: "Reconcile the bank statement (attached CSV) against open invoices in Tripletex. Match incoming payments to customer invoices and outgoing payments to supplier invoices. Handle partial payments correctly."

**Attachment cues:** Always has a CSV file attached. CSV is the single strongest cue for this task.

**Strongest negative cues — what this is NOT:**
- Not task 26 (month-end closing): No CSV; closing has accruals, depreciation, salary provisions.
- Not task 30 (year-end closing): Year-end is annual, involves tax, 3 assets; no bank CSV.
- Not task 17 (payment): Task 17 is a single manual payment registration; task 23 is bulk CSV matching.

**Unresolved / abstention conditions:**
- ⚠ **Task 23 is not implemented** (strategy is not-implemented.v1). Evidence is thin (2 prompt examples only). Route confidently on CSV + bank statement language; the solver will attempt a best-effort.
- Leaderboard score: 0.6/6.

---

## Task 24 — Correct ledger errors — explicit 4-error listing (⚠ confusion zone: 21 vs 24 vs 28)

**Core intent:** Find and correct exactly 4 specific ledger errors that are EXPLICITLY described in the prompt (wrong account with specific account numbers and NOK amount, duplicate voucher with specific account and amount, missing VAT line with specific net amount, wrong amount posted vs expected).
**Real-world side effect:** One corrective journal voucher repairs all 4 errors.

**Primary semantic cues:**
- Jan–Feb 2026 ledger explicitly referenced
- **Explicit listing of 4 error specs with account numbers and amounts**:
  - "wrong account (account X used instead of Y, value N NOK)"
  - "duplicate voucher (account Z, value M NOK)"
  - "missing VAT line (account W, excl. N NOK missing VAT on account 2710)"
  - "incorrect/wrong amount (account V, X NOK posted instead of Y NOK)"

**Multilingual wording patterns:**
- PT: "Descobrimos erros no livro razão de janeiro e fevereiro de 2026. Revise todos os vouchers e encontre os 4 erros: um lançamento na conta errada (conta [X] usada em vez de [Y], valor [N] NOK), um voucher duplicado (conta [Z], valor [M] NOK), uma linha de IVA em falta (conta [W], valor sem IVA [N] NOK falta IVA na conta 2710), e um valor incorreto (conta [V], [X] NOK registado em vez de [Y] NOK). Corrija todos os erros."
- EN: "We have discovered errors in the general ledger for January and February 2026. Review all vouchers and find the 4 errors: a posting to the wrong account (account [X] used instead of [Y], amount [N] NOK), a duplicate voucher (account [Z], amount [M] NOK), a missing VAT line (account [W], amount excl. [N] NOK missing VAT on account 2710), and an incorrect amount (account [V], [X] NOK posted instead of [Y] NOK). Correct all errors with appropriate correction vouchers."

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 21: Task 21 does NOT give explicit account numbers/amounts for each error; the runtime discovers them.
- Not task 28: Task 28 analyzes expense TRENDS and creates projects; no error types enumerated.

**Unresolved / abstention conditions:**
- The primary discriminator vs task 21 is whether all 4 error specs include specific account numbers and NOK amounts. If present → task 24. If absent → task 21.
- Account numbers in the prompt vary across instances (7300→7000, 6500→6540, 6340→6390, etc.) — this is expected; the VALUES change across benchmark runs.

---

## Task 25 — Overdue reminder fee and partial payment (⚠ confusion zone: 17 vs 25 vs 27)

**Core intent:** Find the one overdue unpaid invoice, post a manual 50 NOK reminder fee (debit 1500, credit 3400), create and send a fee invoice, AND register a 5000 NOK partial payment on the original invoice.
**Real-world side effect:** Reminder fee is posted and invoiced; partial payment is applied.

**Primary semantic cues:**
- "overdue" / "forfalt" / "vencida" / "en retard" / "vencido"
- "reminder fee" / "purregebyr" / "cargo por recordatorio" / "frais de rappel" — amount typically 50 NOK
- Specific accounts: 1500 (accounts receivable) and 3400 (reminder fee income)
- "partial payment" / "delbetaling" / "pago parcial" — amount typically 5000 NOK
- "create/send a [reminder] invoice for the fee"

**Multilingual wording patterns:**
- NO: "En av kundene dine har en forfalt faktura. Finn den forfalte fakturaen og bokfor et purregebyr pa 50 kr. Debet kundefordringer (1500), kredit purregebyr (3400). Opprett også en faktura for purregebyret til kunden og send den. Registrer i tillegg en delbetaling på 5000 kr."
- ES: "Uno de sus clientes tiene una factura vencida. Encuentre la factura vencida y registre un cargo por recordatorio de 50 NOK. Debito cuentas por cobrar (1500), credito ingresos por recordatorio (3400). También cree una factura por la tarifa de recordatorio al cliente y envíela. Además, registre un pago parcial de 5000 NOK."

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 17: Task 17 is a single full payment registration; task 25 has the reminder fee + fee invoice + partial payment.
- Not task 27: Task 27 involves EUR invoices and exchange rate differences.

**Unresolved / abstention conditions:**
- All task-25 prompts are "no-argument" (the live ledger state determines which invoice is overdue); route on language pattern alone.

---

## Task 26 — Month-end closing (⚠ confusion zone: 23 vs 26 vs 30)

**Core intent:** Post month-end journal entries: accrual reversal (prepaid cost), monthly depreciation, and salary accrual — all in one combined voucher.
**Real-world side effect:** Period-end accounting entries are made.

**Primary semantic cues:**
- "month-end closing" / "cierre mensual" / "månedsavslutning" / "clôture mensuelle" / "encerramento mensal"
- Specific month mentioned: "March 2026" / "mars 2026"
- Three entry types: accrual/periodificación (1700→expense), depreciation (cost÷years÷12), salary accrual (5000/2900)
- "Verify that the trial balance is zero" sometimes mentioned

**Multilingual wording patterns:**
- ES: "Realice el cierre mensual de marzo de 2026. Registre la periodificación ([X] NOK por mes de la cuenta 1700 a gasto). Contabilice la depreciación mensual de un activo fijo con costo de adquisición [Y] NOK y vida útil [N] años. Verifique que el balance de saldos sea cero. También registre una provisión salarial (débito cuenta de gastos salariales 5000, crédito cuenta de salarios acumulados 2900)."

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 30 (year-end): Year-end is annual, involves tax (22%), 3 separate assets with separate vouchers, and year "2025".
- Not task 23 (bank reconciliation): Task 23 has a CSV attachment; task 26 has no attachment.

**Unresolved / abstention conditions:**
- ⚠ **Task 26 is not implemented** locally (strategy is not-implemented.v1), BUT it scores 6/6 on the leaderboard (perfect). Evidence: 1 prompt example.
- Despite being perfect-score, it remains in the semantic universe. See policy note at bottom.

---

## Task 27 — Register foreign-currency payment with exchange gain (⚠ confusion zone: 17 vs 25 vs 27)

**Core intent:** Register payment on a EUR-denominated customer invoice when the exchange rate at payment differs from the invoice rate. Book the exchange gain/loss ("agio") to the correct account.
**Real-world side effect:** EUR payment is registered; FX difference is posted automatically or manually.

**Primary semantic cues:**
- Foreign currency: **EUR** (always EUR in known examples)
- **Two exchange rates mentioned**: original invoice rate + current payment rate
  - "when the exchange rate was [X] NOK/EUR" + "but the rate is [Y] NOK/EUR"
- "exchange gain" / "agio" / "diferencia de tipo de cambio" / "diferença cambial" / "différence de change"
- Invoice amount in EUR (not NOK)

**Multilingual wording patterns:**
- PT: "Enviámos uma fatura de [N] EUR ao [Customer] (org. nº [N]) quando a taxa de câmbio era [X] NOK/EUR. O cliente pagou agora, mas a taxa é [Y] NOK/EUR. Registe o pagamento e lance a diferença cambial (agio) na conta correta."
- ES: "Enviamos una factura por [N] EUR a [Customer] cuando el tipo de cambio era [X] NOK/EUR. El cliente ha pagado ahora, pero el tipo es [Y] NOK/EUR. Registre el pago y contabilice la diferencia de tipo de cambio (agio) en la cuenta correcta."

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 17: Task 17 is a plain NOK payment with no exchange rate mentioned.
- Not task 25: Task 25 involves overdue + reminder fee + partial payment.

**Unresolved / abstention conditions:**
- ⚠ **Task 27 is named but not implemented** (strategy is not-implemented.v1). Leaderboard score: 1.5/6.
- Strong discriminator: EUR + two exchange rates. Near-zero false-positive risk.

---

## Task 28 — Analyze expense increase and create internal projects (⚠ confusion zone: 21 vs 24 vs 28)

**Core intent:** Read Jan–Feb 2026 general ledger postings, identify the 3 expense accounts with the LARGEST INCREASE in amount, and create one internal project + one activity per account.
**Real-world side effect:** 3 internal Tripletex projects are created; no invoice, no error correction.

**Primary semantic cues:**
- "costs increased significantly" / "costos aumentaron significativamente" / "custos aumentaram significativamente"
- "January to February 2026" — specific months mentioned for COMPARISON
- "identify the three expense accounts with the largest increase"
- "create an internal project for each" + "create an activity for each project"

**Multilingual wording patterns:**
- EN: "Total costs increased significantly from January to February 2026. Analyze the general ledger and identify the three expense accounts with the largest increase in amount. Create an internal project for each of the three accounts using the account name. Also create an activity for each project."
- PT: "Os custos totais aumentaram significativamente de janeiro a fevereiro de 2026. Analise o livro razão e identifique as três contas de despesa com o maior aumento em valor. Crie um projeto interno para cada uma das três contas com o nome da conta. Também crie uma atividade para cada projeto."

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 21/24: Tasks 21/24 are about ERRORS (wrong account, duplicate, missing VAT, wrong amount); task 28 is about TRENDS (largest increase). Task 28 creates projects; tasks 21/24 post corrective entries.
- Not task 29: Task 29 is a full project lifecycle with hours, budget, supplier cost; task 28 only creates internal projects with activities.

**Unresolved / abstention conditions:**
- If prompt mentions both "errors" AND "increase" → likely a trick; analyze primary intent. "Analyze increase" → 28; "correct errors" → 21/24.

---

## Task 29 — Full project lifecycle (⚠ confusion zone: 05 vs 14 vs 15 vs 29)

**Core intent:** Execute a complete multi-step project lifecycle: (1) create project with budget, (2) register hours for 2 employees, (3) register supplier cost, (4) create customer invoice.
**Real-world side effect:** End-to-end project accounting: employees, supplier, invoice all linked to one project.

**Primary semantic cues:**
- **Numbered steps** (4 explicit steps): 1) budget, 2) log hours (2 employees), 3) supplier cost, 4) invoice
- "complete project lifecycle" / "vollständigen Projektzyklus" / "hele prosjektsyklusen" / "complete project lifecycle"
- Two employees named with hours: one project manager + one consultant
- Supplier cost as a separate line
- Final customer invoice for the project

**Multilingual wording patterns:**
- DE: "Führen Sie den vollständigen Projektzyklus für '[Project]' ([Customer], Org.-Nr. [N]) durch: 1) Das Projekt hat ein Budget von [X] NOK. 2) Erfassen Sie Stunden: [PM] (Projektleiter, [email]) [A] Stunden und [Consultant] (Berater, [email]) [B] Stunden. 3) Erfassen Sie Lieferantenkosten von [Y] NOK von [Supplier] (Org.-Nr. [N]). 4) Erstellen Sie eine Kundenrechnung für das Projekt."
- NO: "Gjennomfør hele prosjektsyklusen for '[Project]' ([Customer], org.nr [N]): 1) Prosjektet har budsjett [X] kr. 2) Registrer timer: [PM] (prosjektleder, [email]) [A] timer og [Consultant] (konsulent, [email]) [B] timer. 3) Registrer leverandørkostnad [Y] kr fra [Supplier] (org.nr [N]). 4) Opprett kundefaktura for prosjektet."
- EN: "Execute the complete project lifecycle for '[Project]' ([Customer], org no. [N]): 1) The project has a budget of [X] NOK. 2) Log time: [PM] (project manager, [email]) [A] hours and [Consultant] (consultant, [email]) [B] hours. 3) Register supplier cost of [Y] NOK from [Supplier] (org no. [N]). 4) Create a customer invoice for the project."

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 05: Task 05 only creates the project entity.
- Not task 15: Task 15 registers hours for ONE employee and creates an invoice; no supplier cost or budget.
- Not task 14: Task 14 sets a fixed price and invoices a percentage; no hours or supplier cost.

**Unresolved / abstention conditions:**
- 4 numbered steps with both hours and supplier cost → definitively task 29.

---

## Task 30 — Simplified year-end closing (⚠ confusion zone: 23 vs 26 vs 30)

**Core intent:** Perform simplified annual closing for a specific year (2025): depreciate 3 named assets (separate voucher each), reverse prepaid expenses, and calculate + post 22% tax provision.
**Real-world side effect:** Annual accounting entries finalize fiscal year 2025.

**Primary semantic cues:**
- "simplified year-end closing" / "forenklet årsoppgjør" / "cierre anual simplificado" / "encerramento anual simplificado"
- Year **2025** mentioned explicitly
- **Three named assets** with cost, useful life, and account: e.g., "Kjøretøy (249600 NOK, 10 years, account 1230)"
- "Account 6010 for depreciation expense and 1209 for accumulated depreciation"
- "Separate voucher for each depreciation" / "eget bilag" / "comprobante separado" / "lançamento separado"
- Prepaid reversal: "account 1700 total [X] NOK"
- Tax: "22% of taxable result" / "22% del resultado imponible" / "22% av skattbart resultat"

**Multilingual wording patterns:**
- ES: "Realice el cierre anual simplificado de 2025: 1) Calcule y contabilice la depreciación anual de tres activos: [Asset1] ([X] NOK, [N] años lineales, cuenta [C1]), [Asset2] ([Y] NOK, [M] años, cuenta [C2]), [Asset3] ([Z] NOK, [P] años, cuenta [C3]). Use cuenta 6010 para gasto de depreciación y 1209 para depreciación acumulada. 2) Revierta gastos prepagados (total [W] NOK en cuenta 1700). 3) Calcule y contabilice la provisión de impuestos (22% del resultado imponible) en cuenta 8700/2920. Registre cada depreciación como un comprobante separado."
- NO: "Utfør forenklet årsoppgjør for 2025: 1) Beregn og bokfør årlige avskrivninger for tre eiendeler: ... Bokfør hver avskrivning som et eget bilag."
- PT: "Realize o encerramento anual simplificado de 2025: 1) Calcule e registe a depreciação anual de três ativos: ... Registe cada depreciação como um lançamento separado."

**Attachment cues:** None.

**Strongest negative cues — what this is NOT:**
- Not task 26 (month-end): Monthly; single voucher; no "2025" year; no 3-asset list; no 22% tax.
- Not task 23 (bank reconciliation): CSV attachment + matching; no depreciation.

**Unresolved / abstention conditions:**
- ⚠ **Task 30 is not implemented** locally. Leaderboard score: 1.8/6. 3 prompt examples available.
- Despite not being implemented, it remains in the semantic universe. Route confidently on year-end + 3 assets + 22% tax.

---

## Confusion Zone Deep-Dives

### 08 vs 09 vs 11 — Invoice creation family

| Signal | Task 08 | Task 09 | Task 11 |
|--------|---------|---------|---------|
| Number of lines | 1 | 3 (always "three product lines") | 2 |
| Product numbers | None | Yes (in parentheses) | Yes |
| VAT pattern | Implied 25% | Mixed: 25% + 15% + 0% | Usually uniform |
| Send? | YES ("create AND send") | No | No |
| Payment? | No | No | YES ("register payment") |
| "Order" keyword? | No | No | YES ("order"/"Auftrag"/"commande") |
| "Convert to invoice"? | No | No | YES |

**Routing rule:** If "three product lines" + product numbers + mixed VAT → 09. If "order" + "convert" + payment → 11. If single-line + "create and send" → 08.

### 10 vs 18 — Payment/invoice reversal

| Signal | Task 10 | Task 18 |
|--------|---------|---------|
| Trigger | Customer COMPLAINT | Bank RETURN of payment |
| Action | Issue credit note | Reverse the payment |
| Result | Invoice neutralized by credit note | Invoice shows outstanding again |
| Key phrase | "reklamiert/réclamé/complained/reklamert" | "returned by bank/returnert av banken/retourné par la banque" |

**Routing rule:** "complaint" + "credit note" → 10. "bank returned" + "reverse payment" → 18.

### 16 vs 20 vs 22 — Supplier/expense document booking

| Signal | Task 16 | Task 20 | Task 22 |
|--------|---------|---------|---------|
| Document type | Supplier invoice (text) | Supplier invoice (PDF) | Receipt |
| Invoice number given? | YES (INV-2026-XXXX) | No (extract from PDF) | No |
| Attachment? | No | YES (PDF) | YES (receipt) |
| Department mentioned? | No | No | YES |
| "Expense account" explicit? | No (given as account num) | "Use correct expense account" | "Use correct expense account" |

**Routing rule:** INV-2026-XXXX in text, no attachment → 16. Attachment = PDF + "supplier invoice" → 20. Attachment + "receipt" + department → 22.

### 06 vs 12 vs 13 vs 19 — Employee-centric tasks

| Signal | Task 06 | Task 12 | Task 13 | Task 19 |
|--------|---------|---------|---------|---------|
| Attachment? | No | No | No | YES (PDF) |
| Action | Create employee record | Run payroll | Log travel expense | Full onboarding |
| Key phrase | "new employee named X, born …" | "process salary/payroll for …" | "travel expense … N days … per diem" | "employment contract/offer letter (see attached PDF)" |
| Financial data | None | Salary NOK + bonus | Flight/taxi/per diem | STYRK, salary %, hours |

**Routing rule:** PDF attachment → 19. "Salary/payroll/lønn" + amounts → 12. "Travel/trip/days/per diem" → 13. "New employee, born, email, start date" → 06.

### 05 vs 14 vs 15 vs 29 — Project operations

| Signal | Task 05 | Task 14 | Task 15 | Task 29 |
|--------|---------|---------|---------|---------|
| Financial ops? | None | Fixed price + % invoice | Hours × rate → invoice | Budget + hours + supplier + invoice |
| "Fixed price"? | No | YES | No | No |
| "Hours"? | No | No | YES (1 employee) | YES (2 employees) |
| "Supplier cost"? | No | No | No | YES |
| Numbered steps? | No | No | No | YES (4 steps) |

**Routing rule:** No financials → 05. "Fixed price" + percentage → 14. Single employee's hours + invoice → 15. 4 numbered steps with budget+hours+supplier → 29.

### 17 vs 25 vs 27 — Payment registration variants

| Signal | Task 17 | Task 25 | Task 27 |
|--------|---------|---------|---------|
| Invoice status | Outstanding | Overdue | Outstanding (EUR) |
| Reminder fee? | No | YES (50 NOK, 1500/3400) | No |
| Partial payment? | No | YES (5000 NOK fixed) | No |
| Currency? | NOK | NOK | EUR |
| Exchange rates? | No | No | YES (two rates: invoice vs payment) |

**Routing rule:** EUR + two exchange rates → 27. Overdue + reminder fee → 25. Simple full payment → 17.

### 21 vs 24 vs 28 — Ledger read tasks

| Signal | Task 21 | Task 24 | Task 28 |
|--------|---------|---------|---------|
| Goal | Fix errors (implicit) | Fix errors (explicit) | Analyze trends → projects |
| Error types listed in prompt? | Types named, no exact accounts | YES: exact accounts + amounts for all 4 | No errors — only "largest increase" |
| Output | Corrective voucher | Corrective voucher | 3 new internal projects |
| "Increase/increase" language? | No | No | YES |

**Routing rule:** "largest increase" + "internal project" → 28. "4 errors: wrong account (X instead of Y, N NOK)..." with full spec → 24. Generic error mention without full spec → 21.

### 23 vs 26 vs 30 — Closing and reconciliation

| Signal | Task 23 | Task 26 | Task 30 |
|--------|---------|---------|---------|
| Attachment? | YES (CSV) | No | No |
| Period | N/A (bank statement) | Monthly (March 2026) | Annual (2025) |
| Three assets? | No | No | YES (3 named assets) |
| 22% tax? | No | No | YES |
| "Bank statement"? | YES | No | No |

**Routing rule:** CSV + bank statement → 23. "2025" + 3 assets + 22% tax → 30. Monthly + depreciation + salary provision → 26.

---

## Corpus Data Quality Notes

**Label contamination in old corpus** (`tasks/tripletex/data/prompt-task-labels.jsonl`):
This file uses the OLD tripletex v1 task ID numbering. The old IDs diverge systematically from the current tripletex2 IDs (01–30). Additionally, ~3–5% of entries appear mislabeled even within the old system:

| Observed mislabeled old ID | Prompt content | True task |
|----------------------------|---------------|-----------|
| old-04 | "Opprett ein faktura til kunden..." | task 09 (create customer invoice) |
| old-09 | "Registrer 11 timar for Sigrid Haugen..." | task 15 (register project hours) |
| old-15 | "Descobrimos erros no livro razão..." | task 24 (correct ledger errors) |
| old-17 | "Crie uma fatura para o cliente Floresta Lda..." | task 09 (create customer invoice) |

**Do not use raw old-corpus `tx_task_id` values as supervised training labels.** Remap by prompt content analysis first.

---

## Routing Policy vs Semantic Universe

> **Important:** This section addresses the cross-channel steering note received during research.

### Two distinct layers

**Layer 1 — Canonical semantic routing** (this document):
The full 30-task universe is the ground truth for routing. Every task appears with its full semantic identity including those currently scoring 0/max and those with perfect scores. The routing classifier should always produce its **best true semantic match**, regardless of the live execution policy.

Tasks currently at perfect score (kill-list as of 2026-03-21):
- Tier 1: 01, 02, 03, 04, 05, 07, 08 (all 2/2)
- Tier 2: 14, 18 (4/4 each)
- Tier 3: 25, 26, 28 (6/6 each)

These tasks are **not removed from this document**. They are essential:
- As the semantically nearest correct answer for many prompts
- As **negative anchors** for distinguishing superficially similar tasks (e.g., 08 is the best negative anchor for 09 and 11)
- To prevent the classifier from confidently routing to a wrong task just because the right one was hidden

**Layer 2 — Live selection policy** (NOT in this document):
At runtime, after the classifier returns its best task ID, the runtime MAY apply a solved-task exclusion filter:

```
classifier returns: best_task_id
if best_task_id in exclusion_set:
  log(first_choice=best_task_id, reason="already perfect / excluded")
  ask classifier to re-rank excluding best_task_id
  → return second_best_task_id
```

This is a runtime feedback loop, not a taxonomy change. The classifier's first choice (the truthful semantic answer) must be logged and observable. The exclusion reasoning must be explicit (which task was excluded, why). The retry may produce a suboptimal semantic match but that is intentional for score optimization.

**Critical invariant:** Anything that contaminates Layer 1 (e.g., removing perfect-score tasks from the training corpus or task-cards) will degrade both layers — the classifier will become confused about task boundaries even for the tasks it IS supposed to route to. Do not conflate the two layers.

### How to support solved-task exclusion without poisoning the corpus

1. Keep this document (and the family-map.md) unchanged as the canonical reference.
2. At runtime, maintain a separate `exclusion-set.json` (or read from `active-strategies.json` + leaderboard) that lists excluded task IDs.
3. The classifier prompt should present the full task list but the runtime can add: "Note: if your best match is in [excluded set], re-rank to the next best."
4. Always log: `{ firstChoice, excludedReason, retryChoice, finalStrategy }` for observability.
5. Never train or fine-tune a classifier on prompts relabeled to the retry choice — only the truthful first choice is the correct label.
