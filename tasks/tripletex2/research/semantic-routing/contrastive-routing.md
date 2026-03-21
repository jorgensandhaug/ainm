# Contrastive Routing: Tripletex Task Families

Wave 1 research. Evidence base: playbooks, AGENTS.md, production run corpus, prompt-task-labels.jsonl (labels suspect — used for prompt text only, not for task-id ground truth).

---

## Layer-Separation Note

This document is **canonical semantic routing research** — it answers _what task a prompt actually is_ across the full 30-task universe. It is NOT a live selection policy. A runtime optimization layer may later exclude already-perfect task IDs from live dispatch (to score maximally on remaining tasks), but those perfect-score tasks MUST stay visible in this canonical map as correct routing targets and as essential negative anchors. Do NOT interpret any cluster here as instructions to suppress a task from the semantic universe.

---

## Cluster 08 vs 09 vs 11 — Invoice creation family

All three tasks create invoices for existing or new customers. The splitting signals are (a) whether to **send** the invoice, (b) whether lines come from **products in a catalog**, (c) whether a **payment** step follows, and (d) whether an **order** object is explicitly required.

### 08 — Create and Send Invoice
Trigger when: one simple service line; the invoice is **sent** to the customer in the same action; the customer may be new (no "already exists" implication); no product catalog references; no payment step.

**Positive cues**
- EN: "create and send an invoice", "send the invoice"
- NO/NN: "opprett og send ein faktura", "opprett og send en faktura"
- DE: "Erstellen und senden Sie eine Rechnung", "sende die Rechnung"
- FR: "créer et envoyer une facture", "envoyer la facture"
- PT: "criar e enviar uma fatura", "envie a fatura"
- ES: "crea y envía una factura", "enviar la factura"
- One line: service description + single NOK amount
- Customer may be newly created in this same task (only name + org number given, no "already exists")
- Explicit or implicit VAT instruction ("eksklusiv MVA", "ohne MwSt.", "hors TVA", "sem IVA", "excl. VAT")

**Negative cues (rule out 08)**
- Multiple product lines with different VAT rates → lean 09
- "register payment", "settle", "bezahlen" → lean 11
- "existing products" with catalog numbers in parentheses → lean 09
- Prompt says "don't send" or "without sending" → lean 09

**Multilingual discriminator phrases**
- 08: "Create and send an invoice to the customer X for Y NOK excluding VAT. The invoice is for Z."
- 08 (NO): "Opprett og send ein faktura til kunden X (org.nr N) for Y kr eksklusiv MVA. Fakturaen gjeld Z."
- 08 (DE): "Erstellen und senden Sie eine Rechnung an den Kunden X (Org.-Nr. N) über Y NOK ohne MwSt. Die Rechnung betrifft Z."
- 08 (FR): "Créez et envoyez une facture au client X (nº org. N) pour Y NOK hors TVA. La facture concerne Z."
- 08 (PT): "Crie e envie uma fatura ao cliente X (org. nº N) por Y NOK sem IVA. A fatura refere-se a Z."
- 08 (ES): "Crea y envía una factura al cliente X (org. nº N) por Y NOK sin IVA. La factura es por Z."

---

### 09 — Create Customer Invoice (multiple products, mixed VAT, no send)
Trigger when: existing customer by org number; multiple product lines with product numbers in parentheses; mixed VAT rates (25%, 15%, 0%); create-only (no send instruction).

**Positive cues**
- Product references with numbers in parentheses: `"Webdesign (6744) til 27000 kr med 25 % MVA"`
- Explicit mixed VAT percentages across lines: "25 % TVA", "15 % TVA (alimentación)", "0 % exonéré"
- Prompt says "create invoice" without "send"
- Customer identified by org number as existing
- Three or more named line items

**Negative cues (rule out 09)**
- "send the invoice" → lean 08
- "create order" → lean 11
- Payment step described → lean 11
- Single line only → lean 08
- No product numbers / not existing-customer shape → lean 08

**Multilingual discriminator phrases**
- 09 (FR): "Créez une facture pour le client X (nº org. N) avec trois lignes de produit : Maintenance (3644) à 1850 NOK avec 25 % TVA, Licence logicielle (4934) à 14850 NOK avec 15 % TVA, Assistance réseau (6217) à 9100 NOK avec 0 % TVA exonéré."
- 09 (NO/NN): "Opprett ein faktura til kunden X (org.nr N) med tre produktlinjer: Webdesign (6744) til 27000 kr med 25 % MVA, Programvarelisens (2584) til 9300 kr med 15 % MVA (næringsmiddel), Analyserapport (3927) til 12250 kr med 0 % MVA fritak."
- 09 (ES): "Crea una factura para el cliente X (org. nº N) con tres líneas: Mantenimiento (2109) a Y NOK con 25 % IVA, Horas de consultoría (1175) a Z NOK con 15 % IVA (alimentos), Informe de análisis (9974) a W NOK con 0 % IVA exento."

---

### 11 — Create Order, Invoice, and Register Payment
Trigger when: existing customer + existing products → **order creation** → convert to invoice → **register full payment**, all in one task.

**Positive cues**
- Explicit order creation: "create an order", "créez une commande", "erstellen Sie eine Bestellung"
- Convert order to invoice: "convert the order to an invoice", "convertissez la commande en facture", "wandeln Sie die Bestellung in eine Rechnung um"
- Full payment after invoicing: "register full payment", "registre el pago completo", "enregistrez le paiement complet"
- Products with catalog numbers
- The payment uses the invoice's gross amount, not the ex-VAT prompt total

**Negative cues (rule out 11)**
- No payment step → lean 08 or 09
- No order creation → lean 08 or 09
- Project-linked billing → lean 15 or 14

**Multilingual discriminator phrases**
- 11 (FR): "Créez une commande pour le client X (nº org. N) avec les produits A (N1) à Y1 NOK et B (N2) à Y2 NOK. Convertissez la commande en facture et enregistrez le paiement intégral."
- 11 (DE): "Erstellen Sie eine Bestellung für den Kunden X (Org.-Nr. N) mit den Produkten A (N1) für Y1 NOK und B (N2) für Y2 NOK. Wandeln Sie die Bestellung in eine Rechnung um und registrieren Sie die vollständige Zahlung."
- 11 (ES): "Crea un pedido para el cliente X (org. nº N) con los productos A (N1) a Y1 NOK y B (N2) a Y2 NOK. Convierte el pedido en factura y registra el pago completo."

**Red-flag traps**
- A prompt saying "register supplier invoice" + "Rechnung erhalten" + invoice number + VAT + account → that is Task 16, NOT Task 11, even though it uses the German word "Rechnung" (invoice). Task 11 is about OUTGOING invoices to customers, task 16 is INCOMING supplier invoices.

---

## Cluster 10 vs 18 — Reversal family

Both tasks operate on existing invoices and both involve "reversing" something, but they reverse different objects.

### 10 — Issue Full Credit Note
Trigger when: create a credit note that **reverses the entire invoice**; the invoice itself becomes "credited".

**Positive cues**
- EN: "issue a full credit note", "full credit note", "reverse the entire invoice", "credit note for the full amount"
- NO: "kreditnota", "utstede en kreditnota", "reversere hele fakturaen"
- DE: "vollständige Gutschrift", "Gutschrift ausstellen", "storniert die gesamte Rechnung"
- FR: "avoir complet", "émettre un avoir", "annuler l'intégralité de la facture"
- PT: "nota de crédito completa", "emitir uma nota de crédito", "anular a fatura"
- ES: "nota de crédito completa", "emitir una nota de crédito", "anular la factura"
- Customer complained / disputed the invoice

**Negative cues (rule out 10)**
- "bank returned the payment" → lean 18
- "reverse the payment" / "annuler le PAIEMENT" → lean 18
- "the payment was returned" → lean 18
- No "credit note" language → consider 18

### 18 — Reverse Customer Invoice Payment
Trigger when: a **payment** that was already registered on a paid invoice needs to be undone (bank returned, bounced, error).

**Positive cues**
- EN: "the payment was returned by the bank", "reverse the payment", "undo the payment", "payment reversed"
- NO: "betalingen ble returnert", "omgjøre betalingen", "betaling returnert av banken"
- DE: "die Zahlung wurde von der Bank zurückgegeben", "die Zahlung stornieren", "Zahlung zurückgebucht"
- FR: "le paiement a été retourné par la banque", "annulez le paiement", "paiement retourné"
- PT: "o pagamento foi devolvido pelo banco", "reverter o pagamento", "pagamento devolvido"
- ES: "el pago fue devuelto por el banco", "anular el pago", "revertir el pago"
- Invoice is currently **paid** (outstanding = 0); task reopens it

**Negative cues (rule out 18)**
- "credit note" language → lean 10
- Invoice is currently **unpaid** → lean 17 (payment registration), not reversal

**Red-flag trap (most dangerous confusion in this cluster)**
- FR "annuler le paiement" → task 18 (reverse the payment)
- FR "annuler la facture" → task 10 (credit note)
- DE "Gutschrift" → task 10 (credit note), NOT reversal
- ES "anular el pago" → task 18; "anular la factura" → task 10
- PT "reverter o pagamento" → task 18; "nota de crédito" → task 10

---

## Cluster 16 vs 20 vs 22 — Incoming expense/invoice family

All three involve posting an expense or incoming invoice with an attachment. The key splits are: invoice vs. receipt, and whether a PDF is attached.

### 16 — Register Supplier Invoice (text only)
Trigger when: prompt gives all invoice fields in text — supplier name, org number, invoice number, gross amount, expense account, VAT rate — with **no attachment reference**.

**Positive cues**
- EN: "register the supplier invoice", "incoming invoice from supplier"
- NO: "registrer leverandørfakturaen", "mottatt faktura fra leverandøren"
- DE: "erfassen Sie die Lieferantenrechnung", "Rechnung vom Lieferanten erhalten"
- FR: "enregistrez la facture fournisseur", "facture reçue du fournisseur"
- PT: "registre a fatura do fornecedor", "fatura recebida do fornecedor"
- ES: "registra la factura del proveedor", "hemos recibido la factura del proveedor"
- Invoice number explicitly stated ("INV-2026-XXXX")
- Explicit expense account number given in text
- Explicit VAT rate given in text

**Negative cues (rule out 16)**
- "see attached PDF" → lean 20
- "receipt" / "kvittering" / "recibo" → lean 22
- No invoice number → lean 22

### 20 — Register Supplier Invoice with PDF Attachment
Trigger when: same as task 16 but with an **attached PDF** containing the invoice data.

**Positive cues**
- EN: "see attached PDF", "you received a supplier invoice (see attached PDF)"
- NO: "se vedlagt PDF", "du har mottatt en leverandørfaktura (se vedlagt PDF)"
- DE: "siehe angehängte PDF", "Sie haben eine Lieferantenrechnung erhalten (siehe PDF)"
- FR: "voir PDF ci-joint", "vous avez reçu une facture fournisseur (voir PDF ci-joint)"
- PT: "ver PDF em anexo", "recebeu uma fatura do fornecedor (ver PDF anexado)"
- ES: "ver PDF adjunto", "ha recibido una factura del proveedor (ver PDF adjunto)"
- `attachmentFileName` present in extracted fields

**Red-flag trap (16 vs 20)**
- The ONLY reliable discriminator is the PDF attachment reference. If the prompt says "see attached PDF" for a supplier invoice, use 20. Without it, use 16.
- Supplier invoice prompts in both 16 and 20 use identical vocabulary. Do not rely on any other signal.

### 22 — Register Receipt Expense Voucher
Trigger when: employee expense receipt (restaurant, office supplies, etc.); one selected line from a receipt; booking to a named department; balance against bank account 1920; upload receipt file.

**Positive cues**
- EN: "receipt", "book this expense", "from this receipt"
- NO: "kvittering", "bokfør dette på avdeling X", "fra denne kvitteringen"
- DE: "Quittung", "buchen Sie diesen Aufwand", "diese Quittung"
- FR: "reçu", "ticket de caisse", "comptabilisez cette dépense"
- PT: "recibo", "registre esta despesa"
- ES: "recibo", "registra este gasto"
- **Department** mentioned explicitly ("avdeling", "département", "Abteilung", "departamento")
- Expense category: "Forretningslunsj" / "business lunch" / "Déjeuner d'affaires" / "office chairs" / "Kontorstoler" / "office supplies"
- No invoice number (receipts don't have invoice numbers)
- A single receipt line is selected (not the whole receipt total)

**Negative cues (rule out 22)**
- Invoice number present → lean 16 or 20
- Supplier business identity (org number) + formal invoice structure → lean 16 or 20
- No department mention → lean 16

**Red-flag trap (20 vs 22)**
- Both 20 and 22 involve a PDF/attachment. The decisive signal is the nature of the document:
  - Formal supplier invoice (has invoice number, supplier org nr) + PDF → task 20
  - Employee receipt (no invoice number, has department, has category like "Forretningslunsj") + PDF/receipt image → task 22
- The prompt phrase "see attached PDF" alone cannot disambiguate 20 from 22; look at the expense category and presence/absence of an invoice number.

---

## Cluster 06 vs 12 vs 13 vs 19 — Employee-related family

All four tasks involve an employee. The key split is: creating the employee record (06/19) vs. operating on an existing employee (12/13).

### 06 — Create Employee
Trigger when: create a new employee card with identity fields only — name, birth date, email, start date. No salary configuration, no travel, no contract PDF.

**Positive cues**
- EN: "create a new employee", "add an employee", "onboard" followed by identity fields only
- NO: "opprett en ny ansatt", "legg til ansatt"
- DE: "einen neuen Mitarbeiter erstellen", "Mitarbeiter anlegen"
- FR: "créer un nouvel employé", "ajouter un employé"
- PT: "criar um novo funcionário", "adicionar um funcionário"
- ES: "crear un nuevo empleado", "dar de alta a un empleado"
- Birth date present
- Email present
- Start date present
- **No** salary / bonus / travel / contract language

**Negative cues (rule out 06)**
- "salary" / "bonus" → lean 12
- "travel" / "per diem" → lean 13
- Attached contract/offer letter → lean 19
- "occupation code" / "STYRK" → lean 19

### 12 — Run Payroll with Bonus
Trigger when: existing employee (identified by email); base salary amount; bonus amount; payroll for a specific month.

**Positive cues**
- EN: "process payroll", "run payroll for", "base salary", "one-time bonus"
- NO: "kjør lønn for", "grunnlønn", "bonus"
- DE: "Gehaltsabrechnung durchführen", "Grundgehalt", "einmaliger Bonus"
- FR: "traiter la paie", "salaire de base", "bonus unique"
- PT: "processar o salário", "salário base", "bônus único"
- ES: "procesar la nómina", "salario base", "bonificación única"
- Two amounts: base salary + bonus
- Month reference ("this month", "for March", "pour ce mois", "für diesen Monat")
- Employee identified by email only (no birth date)

**Negative cues (rule out 12)**
- Birth date given (without salary) → lean 06
- Travel / departure / per diem → lean 13
- Contract PDF → lean 19

### 13 — Register Travel Expense
Trigger when: existing employee (by email); trip with departure + return dates; named destinations; per-diem rate; cost categories (flight, taxi, hotel).

**Positive cues**
- EN: "travel expense", "register a travel expense claim", "per diem", "daily rate"
- NO: "reiseregning", "reiseutgifter", "dagpenger", "dagpengerate"
- DE: "Reisekostenabrechnung", "Reisekosten", "Tagegeld", "Tagessatz"
- FR: "note de frais", "frais de voyage", "indemnité journalière", "taux journalier"
- PT: "despesas de viagem", "diárias", "taxa diária"
- ES: "gastos de viaje", "dietas", "tarifa diaria"
- Named cost items: "flight ticket", "Flugticket", "billet d'avion", "bilhete de avião"
- Departure and return dates
- Trip title or purpose

**Negative cues (rule out 13)**
- No travel dates / no per-diem → lean 12 (salary)
- Birth date + start date → lean 06

### 19 — Onboard Employee from Contract
Trigger when: attached PDF (offer letter or employment contract); full onboarding with occupation code, annual salary, department, percentage FTE, nested employment details.

**Positive cues**
- EN: "you received an offer letter (see attached PDF)", "employment contract (see attached PDF)"
- NO: "du har mottatt en tilbudsbrev (se vedlagt PDF)", "arbeidskontrakt (se vedlagt PDF)"
- DE: "Sie haben ein Angebotsschreiben erhalten (siehe PDF)", "Arbeitsvertrag (siehe PDF)"
- FR: "vous avez reçu une lettre d'offre (voir PDF ci-joint)", "contrat de travail (voir PDF)"
- PT: "recebeu uma carta-oferta (ver PDF em anexo)", "contrato de trabalho (ver PDF)"
- ES: "ha recibido una carta de oferta (ver PDF adjunto)", "contrato de trabajo (ver PDF)"
- STYRK code or occupation code mentioned
- Annual salary (årslønn / Jahresgehalt / salaire annuel)
- Full-time percentage (stillingsprosent / Beschäftigungsgrad / pourcentage temps plein)
- Department to be created

**Red-flag trap (06 vs 19)**
- Both 06 and 19 create a new employee. The split: 19 requires an attached PDF with contract details. A prompt that says "onboard the employee" or "create the employee from the attached contract" with a PDF → 19. A prompt that just gives name + birth date + email + start date in text → 06.
- 19 prompts are significantly longer and more complex (nested employment details, occupation code).

---

## Cluster 05 vs 14 vs 15 vs 29 — Project family

All four tasks involve projects. The split is: create-only (05), billing setup (14), hours-based invoicing (15), or full lifecycle (29).

### 05 — Create Project
Trigger when: create a project for an existing customer; assign a project manager; no billing, no hours, no supplier.

**Positive cues**
- EN: "create a project", "set up a project for", "project manager"
- NO: "opprett et prosjekt", "knytt til kunden", "prosjektleder"
- DE: "erstellen Sie ein Projekt", "Projektleiter"
- FR: "créez un projet", "chef de projet"
- PT: "crie um projeto", "gerente de projeto"
- ES: "crea un proyecto", "director del proyecto"
- Customer identified by org number
- Manager identified by email
- **No** invoice, billing, hours, supplier

**Negative cues (rule out 05)**
- Fixed price or invoice amount → lean 14
- Hours + hourly rate → lean 15
- Multiple employees + supplier cost → lean 29

### 14 — Set Project Fixed Price and Invoice Milestone
Trigger when: project (may need creating) + set a **fixed price** + invoice a **percentage** of that price.

**Positive cues**
- EN: "fixed price", "set a fixed price of X NOK", "invoice the customer for Y%"
- NO: "fastpris", "sett en fastpris", "fakturere X% av fastprisen"
- DE: "Festpreis", "einen Festpreis von X NOK festlegen", "Y% des Festpreises"
- FR: "prix fixe", "définir un prix fixe de X NOK", "facturer Y% du prix fixe"
- PT: "preço fixo", "definir um preço fixo de X NOK", "faturar Y% do preço"
- ES: "precio fijo", "fijar un precio fijo de X NOK", "facturar el Y% del precio"
- Milestone percentage or milestone amount stated
- Invoice without sending

**Negative cues (rule out 14)**
- No price amount → lean 05
- Hours + activity + hourly rate → lean 15
- Multiple employees + supplier → lean 29

### 15 — Register Project Hours and Create Project Invoice
Trigger when: existing employee + existing project + specific activity + hours count + hourly rate → project invoice.

**Positive cues**
- EN: "register X hours for employee Y on activity Z in project P", "hourly rate of W NOK"
- NO: "registrer X timer for Y på aktiviteten Z i prosjektet P", "timesats: W kr"
- DE: "erfassen Sie X Stunden für Y auf der Aktivität Z im Projekt P", "Stundensatz: W NOK"
- FR: "enregistrez X heures pour Y sur l'activité Z dans le projet P", "taux horaire: W NOK"
- PT: "registe X horas para Y na atividade Z no projeto P", "taxa horária: W NOK"
- ES: "registre X horas para Y en la actividad Z del proyecto P", "tarifa horaria: W NOK"
- Hours count given explicitly
- Hourly rate given explicitly
- Employee identified by email
- Project identified by name and/or customer

**Negative cues (rule out 15)**
- "fixed price" → lean 14
- Multiple employees + supplier cost → lean 29
- No hours → lean 05 or 14

### 29 — Full Project Lifecycle
Trigger when: the task requires **creating or reusing ALL of**: customer, employees (plural), supplier, project + budget, hours registration, supplier cost booking, final project invoice.

**Positive cues**
- EN: "complete project lifecycle", "full lifecycle", "set up the project end-to-end"
- NO: "gjennomfør hele prosjektsyklusen", "full prosjektlivssyklus"
- DE: "vollständigen Projektzyklus durchführen", "kompletter Projektzyklus"
- FR: "réaliser le cycle de vie complet du projet"
- PT: "realizar o ciclo de vida completo do projeto"
- ES: "realizar el ciclo de vida completo del proyecto"
- Multiple employees listed (each with name + email + hours)
- Supplier name + org number + cost amount
- Project budget stated
- Final invoice step

**Negative cues (rule out 29)**
- Single employee, no supplier → lean 15
- Just project creation, no billing → lean 05
- Fixed price billing → lean 14

**Red-flag trap (15 vs 29)**
- Task 15 is for a single employee on an existing project with a stated hourly rate. Task 29 builds the whole thing from scratch and involves multiple employees and a supplier cost. The key tell for 29 is the presence of a **supplier** and **multiple employees listed with hours**.

---

## Cluster 17 vs 25 vs 27 — Payment family

All three tasks register a payment against an existing invoice, but with different scope and context.

### 17 — Register Customer Invoice Payment
Trigger when: locate an existing **unpaid** invoice → register **full payment**. No reminder fee, no foreign currency.

**Positive cues**
- EN: "register payment", "locate the unpaid invoice", "mark as paid", "the invoice is outstanding"
- NO: "registrer betaling", "betal fakturaen", "fakturaen er ubetalt"
- DE: "Zahlung registrieren", "Rechnung bezahlen", "offene Rechnung"
- FR: "enregistrer le paiement", "payer la facture", "facture impayée"
- PT: "registar o pagamento", "pagar a fatura", "fatura em aberto"
- ES: "registrar el pago", "pagar la factura", "factura pendiente de pago"
- Customer + ex-VAT amount + line description given

**Negative cues (rule out 17)**
- "overdue" + reminder fee + partial payment → lean 25
- Non-NOK currency + exchange rate → lean 27
- "reverse" or "cancel payment" → lean 18

### 25 — Overdue Reminder Fee and Partial Payment
Trigger when: find the one overdue invoice; post a **50 NOK reminder fee** to accounts 1500/3400; create and send a fee invoice; register a **5000 NOK partial payment**.

**Positive cues**
- EN: "overdue invoice", "reminder fee of 50 NOK", "partial payment of 5000 NOK", "debit accounts receivable (1500), credit reminder fee (3400)"
- NO: "forfalt faktura", "purregebyr på 50 kr", "delbetaling på 5000 kr", "debet kundefordringer (1500), kredit purregebyr (3400)"
- DE: "überfällige Rechnung", "Mahngebühr von 50 NOK", "Teilzahlung von 5000 NOK"
- FR: "facture en retard", "frais de rappel de 50 NOK", "paiement partiel de 5000 NOK"
- PT: "fatura vencida", "taxa de lembrete de 50 NOK", "pagamento parcial de 5000 NOK"
- ES: "factura vencida", "cargo por recordatorio de 50 NOK", "pago parcial de 5000 NOK", "débito cuentas por cobrar (1500), crédito ingresos por recordatorio (3400)"
- Account numbers 1500 + 3400 mentioned

**Red-flag trap (25 vs 17)**
- Task 25 prompts always state the exact fee amount (50 NOK) and the exact partial payment amount (5000 NOK). Task 17 does not mention reminder fees or specific partial amounts. If both a reminder fee AND a partial payment amount appear → 25.

### 27 — Register Foreign-Currency Payment with Exchange Gain
Trigger when: existing invoice in a **non-NOK currency** (EUR, USD, etc.); prompt gives both the invoice rate and the settlement rate; agio (exchange gain/loss) must be booked.

**Positive cues**
- Non-NOK currency mentioned: EUR, USD, GBP, etc.
- Two exchange rates given: "when the rate was X NOK/EUR" and "the current rate is Y NOK/EUR"
- EN: "exchange gain", "exchange rate difference", "agio", "book the FX difference"
- NO: "valutagevinst", "valutadifferanse", "agio"
- DE: "Kursgewinn", "Wechselkursdifferenz", "Agio"
- FR: "gain de change", "différence de change", "agio"
- PT: "ganho cambial", "diferença cambial", "agio"
- ES: "ganancia cambiaria", "diferencia de cambio", "agio"
- Invoice amount in foreign currency units (e.g., "18687 EUR")

**Negative cues (rule out 27)**
- Invoice in NOK only → lean 17
- No exchange rate → lean 17
- Reminder fee → lean 25

**Multilingual anchor (real corpus samples)**
- PT: "Enviámos uma fatura de 13986 EUR ao X (org. nº N) quando a taxa de câmbio era 10.37 NOK/EUR. O cliente pagou agora, mas a taxa é 11.31 NOK/EUR. Registe o pagamento e lance a diferença cambial."
- ES: "Enviamos una factura por 18687 EUR a X (org. nº N) cuando el tipo de cambio era 10.33 NOK/EUR. El cliente ha pagado ahora, pero el tipo es 10.87 NOK/EUR. Registre el pago y contabilice la diferencia de cambio."

---

## Cluster 21 vs 24 vs 28 — Ledger analysis family

### 21 — Correct Ledger Errors (variant A — Nynorsk / audit-first)
Trigger when: prompt asks to audit Jan-Feb 2026 ledger and find/correct four known errors, **without listing the specific error values in the prompt text**; most commonly Nynorsk language.

**Positive cues**
- Nynorsk phrasing: "revisér alle bilaga", "finn dei fire feila", "korrektionsbilaget"
- OR prompt says "audit the ledger" / "find and correct four errors" with NO specific account/amount details in the prompt
- Jan-Feb 2026 date range
- Four error types implied but not enumerated with exact values

**Negative cues (rule out 21)**
- Specific account numbers and amounts listed in the prompt → lean 24
- "largest increase" / "top 3 accounts" → lean 28

### 24 — Correct Ledger Errors (variant B — error details specified)
Trigger when: same ledger-error correction task but **the prompt explicitly lists the specific 4 error values** (wrong account, duplicate voucher, missing VAT, incorrect amount) with exact account numbers and amounts.

**Positive cues**
- English: "find the 4 errors: a posting to the wrong account (account X used instead of Y, amount Z NOK), a duplicate voucher on account A with B NOK, a missing VAT line on account C with D NOK, and an incorrect amount on account E: F instead of G NOK"
- German: "die 4 Fehler: eine Buchung auf dem falschen Konto (Konto X statt Y, Betrag Z NOK), ein doppelter Beleg auf Konto A..."
- Portuguese: "os 4 erros: um lançamento na conta errada (conta X usada em vez de Y, valor Z NOK), um voucher duplicado em A com B NOK..."
- Specific account numbers (e.g., 7300, 7000, 6500, 6540, 6290, 4600) and amounts in the prompt text

**CRITICAL: 21 vs 24 disambiguation rule**
The AGENTS.md states: "choose the exact task id from the prompt wording." The operative discriminator:
- If the prompt gives SPECIFIC account numbers + amounts for each of the 4 errors → **24**
- If the prompt says "audit the ledger" with errors implied but not enumerated → **21** (or ambiguous: return unresolved with `ambiguous-task`)
- Known miss (2026-03-21): a German prompt explicitly listing 7300→7000, duplicate on 7000/4600, missing VAT on 6540/15600, wrong amount 15200→13400 was misclassified as 21. That prompt should have routed to 24.

### 28 — Analyze Expense Increase and Create Internal Projects
Trigger when: compare January vs. February expenses; identify top 3 accounts by **increase**; create internal projects.

**Positive cues**
- EN: "costs increased significantly from January to February", "identify the three expense accounts with the largest increase", "create an internal project for each"
- NO: "kostnadene økte fra januar til februar", "de tre utgiftskontoene med størst økning", "opprett et internt prosjekt"
- DE: "Kosten stark gestiegen", "drei Ausgabenkonten mit dem größten Anstieg", "internes Projekt erstellen"
- FR: "coûts ont augmenté de janvier à février", "trois comptes de charges avec la plus forte augmentation", "créer un projet interne"
- PT: "custos aumentaram de janeiro a fevereiro", "três contas de despesa com o maior aumento", "crie um projeto interno"
- ES: "costos aumentaron de enero a febrero", "tres cuentas de gastos con el mayor aumento", "crear un proyecto interno"

**Negative cues (rule out 28)**
- "find the errors" / "wrong account" → lean 21 or 24
- "correct" / "corrective voucher" → lean 21 or 24
- No "increase" / "comparison" language

---

## Cluster 23 vs 26 vs 30 — Unknown / Placeholder

All three tasks have **no checked-in prompt evidence** and **no implemented strategy**. Always return `unresolved` with `code: "unsupported-request"`. Include the recognized `taskId` in the response if context clues suggest one of these IDs.

| Task | Leaderboard Score | Status |
|------|-------------------|--------|
| 23 | 0.6 | No evidence |
| 26 | 6.0 | No evidence (unexpectedly high) |
| 30 | 1.8 | No evidence |

Task 26 scores surprisingly well (6.0) despite no evidence. Do not route anything to 26 without production prompt evidence. The score may come from fallback behavior, not correct routing.

---

## Minor clusters (quick reference)

| Task | One-line discriminator |
|------|------------------------|
| 01 | Create customer: name + org nr + email + address |
| 02 | Create supplier: name + org nr + email (often invoice email) |
| 03 | Create department(s): just names, no financial data |
| 04 | Create product: product number + price + VAT rate |
| 07 | Create accounting dimension + post voucher: "free dimension" / "fri regnskapsdimensjon" + dimension value names + account + amount |
| 12 | Run payroll: email + base salary + bonus amount + month |
| 16 | Supplier invoice text-only: supplier name/org/invoice number/gross/account/VAT in text, no attachment |
| 20 | Supplier invoice + PDF: all of 16 + "see attached PDF" |
| 21 | Correct ledger errors variant A: Nynorsk or audit-only phrasing |
| 24 | Correct ledger errors variant B: specific error values listed |
| 25 | Overdue + 50 NOK fee + 5000 NOK partial payment |

---

## Cross-cluster signal summary

| Signal | Points to |
|--------|-----------|
| "send" + one service line | 08 |
| Multiple products with (numbers) + mixed VAT | 09 |
| "create order" + "convert" + "payment" | 11 |
| "credit note" / "kreditnota" / "Gutschrift" / "avoir" | 10 |
| "bank returned the payment" / "annuler le PAIEMENT" | 18 |
| Supplier + org nr + invoice nr + no PDF | 16 |
| Supplier + org nr + invoice nr + "see attached PDF" | 20 |
| Receipt + department + no invoice nr | 22 |
| Employee: birth date + email + start date only | 06 |
| Employee: salary + bonus + month | 12 |
| Employee: travel + per-diem + departure/return dates | 13 |
| Employee: attached contract PDF + occupation code | 19 |
| Project: no billing/hours | 05 |
| Project: fixed price + milestone % | 14 |
| Project: hours + hourly rate + activity + invoice | 15 |
| Project: multiple employees + supplier + full lifecycle | 29 |
| Invoice payment: unpaid invoice + full amount | 17 |
| Invoice payment: overdue + 50 NOK fee + 5000 partial | 25 |
| Invoice payment: foreign currency + two exchange rates | 27 |
| Ledger: "find 4 errors" with specific values listed | 24 |
| Ledger: "audit" without specific values / Nynorsk | 21 |
| Ledger: "largest increase" + "create internal projects" | 28 |
| No evidence whatsoever | 23, 26, 30 |
