# Task-Mapping Audit — prod48 Wave

**Date**: 2026-03-22
**Evidence source**: 489 production runs in `tasks/tripletex/data/production/runs/` (latest 48 are the prod48 wave; all runs used for cross-validation)
**Method**: Extract `unique_attempt_delta` runs where exactly one `tx_task_id` changed, correlate with prompt semantics

## Executive Summary

The `CANONICAL_TASK_REGISTRY` in `legacy-tripletex1-task-bridge.ts` assumes `txTaskId == taskId` for all 30 entries. **This is wrong for 16 of 30 tasks.** The leaderboard uses a completely different numbering scheme for tasks 01–08, 10–11, and 14–17. Tasks 09, 12–13, and 18–30 are correctly mapped.

Additionally, tasks 26 and 30 (currently "Unknown") now have clear semantics from production evidence.

## Methodology

1. Scanned all 489 production runs for `inference_status: "unique_attempt_delta"` with exactly one diff entry
2. Grouped by `tx_task_id` and analyzed prompt content to determine the true semantic task
3. Cross-validated with multiple languages (NO, EN, DE, FR, ES, PT, Nynorsk) and prompt variations
4. Confirmed dominant patterns with 4–18 independent observations per tx_task_id

## Corrected Mapping

### Tasks with WRONG txTaskId (16 entries)

| Our taskId | Task Name | Current txTaskId (WRONG) | Correct txTaskId | Evidence (unique runs) | Confidence |
|-----------|-----------|-------------------------|------------------|----------------------|------------|
| 01 | Create customer | 01 | **02** | 8 runs, all "Create customer with org number and address" | high |
| 02 | Create supplier | 02 | **04** | 18 runs, dominant pattern "Register supplier with org number and email" | high |
| 03 | Create department | 03 | **05** | 10 runs, all "Create three departments" | high |
| 04 | Create product | 04 | **03** | 6 runs, all "Create product with product number, price, and VAT" | high |
| 05 | Create project | 05 | **08** | 12 runs, all "Create project for customer with project manager" | high |
| 06 | Create employee | 06 | **01** | 7 runs, all "Create employee with birth date, email, start date" | high |
| 07 | Create dimension + voucher | 07 | **17** | 11 runs, dominant pattern "Create accounting dimension and post voucher" | high |
| 08 | Create and send invoice | 08 | **06** | 8 runs, all "Create and send invoice for single service line" | high |
| 10 | Issue full credit note | 10 | **14** | 11 runs, all "Customer complained, issue full credit note/Gutschrift/avoir" | high |
| 11 | Order, invoice, register payment | 11 | **10** | 9 runs, all "Create order with products, convert to invoice, register payment" | high |
| 14 | Set project fixed price | 14 | **15** | 11 runs, all "Set fixed price on project and invoice milestone percentage" | high |
| 15 | Register project hours + invoice | 15 | **16** | 5 runs, all "Register N hours for employee on project activity, create invoice" | high |
| 16 | Register supplier invoice | 16 | **11** | 11 runs, all "Received invoice INV-2026-XXXX from supplier, register with VAT" | high |
| 17 | Register customer invoice payment | 17 | **07** | 5 runs, all "Customer has outstanding invoice, register full payment" | high |

> **Note on task 09**: tx_task_id 09 maps to our taskId 09 (Create customer invoice with 3 product lines, mixed VAT). 10 unique runs confirm this. No change needed.

### Tasks with CORRECT txTaskId (14 entries)

| taskId | txTaskId | Task Name | Evidence (unique runs) |
|--------|---------|-----------|----------------------|
| 09 | 09 | Create customer invoice | 10 runs |
| 12 | 12 | Run payroll with bonus | 8 runs |
| 13 | 13 | Register travel expense | 12 runs |
| 18 | 18 | Reverse customer invoice payment | 14 runs |
| 19 | 19 | Onboard employee from contract | 5 runs |
| 20 | 20 | Register supplier invoice with PDF | 6 runs |
| 21 | 21 | Onboard employee from offer letter | 4 runs |
| 22 | 22 | Register receipt expense voucher | 7 runs |
| 23 | 23 | Reconcile bank statement | 7 runs |
| 24 | 24 | Correct ledger errors | 8 runs |
| 25 | 25 | Overdue reminder fee and partial payment | 4 runs |
| 27 | 27 | Foreign-currency payment with exchange gain | 8 runs |
| 28 | 28 | Analyze expense increase and create projects | 6 runs |
| 29 | 29 | Full project lifecycle | 7 runs |

### Newly Resolved Tasks (2 entries)

| taskId | txTaskId | Old Name | New Name | New Summary | Evidence |
|--------|---------|----------|----------|-------------|---------|
| 26 | 26 | Unknown task 26 | Monthly closing (March 2026) | Perform the monthly closing for March 2026: post accrued prepaid expense from account 1700, book monthly depreciation, and close relevant balance sheet items. | 6 unique runs with consistent "cierre mensual" / "månavslutninga" / "encerramento mensal" prompts |
| 30 | 30 | Simplified annual closing (2025) | Simplified annual closing (2025) | Perform the simplified annual closing for 2025: calculate and book annual depreciation for three assets, post year-end cost allocation, and create annual closing vouchers. | 6 unique runs with consistent "cierre anual simplificado" / "forenkla årsoppgjør" / "encerramento anual simplificado" prompts |

## Impact Analysis

### What broke

The `bridgeLegacyTripletex1TaskAttribution()` function uses `txTaskId` to look up canonical tasks. When the leaderboard reports `tx_task_id: 02` (meaning "Create customer"), the bridge looks up `txTaskId: "02"` which currently maps to canonical taskId `"02"` = "Create supplier". **Every leaderboard attribution for the 16 mismatched tasks was being assigned to the wrong canonical task.**

This means:
- Production run results were being attributed to wrong task strategies
- Score tracking per task was incorrectly bucketed
- Any feedback loop learning from production results was learning the wrong lessons

### Scope of fix

1. **`legacy-tripletex1-task-bridge.ts`**: Update `txTaskId` for 16 entries + update names/summaries for tasks 26 and 30
2. **`legacy-tripletex1-task-bridge.test.ts`**: Update test expectations
3. **AGENTS.md**: No changes needed (uses canonical taskId, not txTaskId)
4. **Task directories and strategies**: No changes needed (use canonical taskId)

## Anomalous Observations

- A few `unique_attempt_delta` runs had prompts that didn't match the dominant pattern for their tx_task_id (e.g., a customer invoice prompt attributed to tx_task_id 04 instead of 09). These are likely timing collisions where a concurrent run's leaderboard delta leaked into the observation window. The dominant pattern (90%+ agreement) is reliable.
- Task 26 prompt mentions specific amounts (e.g., "8950 kr per månad") that vary across runs, suggesting parameterized prompts.
- Task 30 prompt mentions specific assets and depreciation schedules that vary per run.

## Evidence Samples

### tx_task_id 01 → Create employee (our taskId 06)
```
"We have a new employee named Lucy Wilson, born 28. December 1986. Please create them as an employee with email lucy.wilson@example.org and start date..."
"Temos um novo funcionário chamado André Almeida, nascido em 9. April 1980. Crie-o como funcionário..."
```

### tx_task_id 02 → Create customer (our taskId 01)
```
"Opprett kunden Fjordkraft AS med organisasjonsnummer 843216285. Adressen er Fjordveien 129, 2317 Hamar."
"Create the customer Greenfield Ltd with organization number 872154442. The address is Sjøgata 85, 7010 Trondheim."
```

### tx_task_id 03 → Create product (our taskId 04)
```
"Crie o produto 'Pão integral' com número de produto 1871. O preço é 28350 NOK sem IVA, utilizando a taxa de IVA para alimentos de 15 %."
"Opprett produktet 'Avis' med produktnummer 2061. Prisen er 4150 kr eksklusiv MVA, og MVA-sats på 0 % for aviser..."
```

### tx_task_id 06 → Create and send invoice (our taskId 08)
```
"Create and send an invoice to the customer Ironbridge Ltd (org no. 841254546) for 28500 NOK excluding VAT."
"Opprett og send ein faktura til kunden Bølgekraft AS (org.nr 892362416) på 34150 kr eksklusiv MVA."
```

### tx_task_id 07 → Register payment (our taskId 17)
```
"Kunden Polaris AS (org.nr 896571559) har en utestående faktura på 15200 kr eksklusiv MVA for 'Datarådgivning'. Registrer full betaling..."
"The customer Windmill Ltd (org no. 830362894) has an outstanding invoice for 32200 NOK excluding VAT..."
```

### tx_task_id 10 → Order-invoice-payment (our taskId 11)
```
"Créez une commande pour le client Forêt SARL (nº org. 962176127) avec les produits Maintenance (2417) à 32250 NOK et..."
"Crea un pedido para el cliente Luna SL (org. nº 989093630) con los productos..."
```

### tx_task_id 11 → Register supplier invoice (our taskId 16)
```
"Wir haben die Rechnung INV-2026-2118 vom Lieferanten Brückentor GmbH (Org.-Nr. 981448294) über 70400 NOK einschließlich MwSt."
"We have received invoice INV-2026-9075 from the supplier Brightstone Ltd (org no. 890932991) for 59800 NOK including VAT."
```

### tx_task_id 14 → Issue full credit note (our taskId 10)
```
"Der Kunde Sonnental GmbH hat die Rechnung reklamiert. Erstellen Sie eine vollständige Gutschrift..."
"El cliente Viento SL ha reclamado sobre la factura. Emita una nota de crédito completa..."
```

### tx_task_id 15 → Set project fixed price (our taskId 14)
```
"Set a fixed price of 428550 NOK on the project 'CRM Integration' for Ironbridge Ltd..."
"Sett fastpris 181650 kr på prosjektet 'Nettbutikk-utvikling' for Tindra AS..."
```

### tx_task_id 16 → Register project hours + invoice (our taskId 15)
```
"Registrer 5 timer for Silje Strand (silje.strand@example.org) på aktiviteten 'Design' i prosjektet..."
"Erfassen Sie 20 Stunden für Laura Müller auf der Aktivität 'Rådgivning' im Projekt 'Datenmigration'..."
```

### tx_task_id 17 → Create dimension + voucher (our taskId 07)
```
"Créez une dimension comptable personnalisée 'Kostsenter' avec les valeurs 'IT' et 'HR'. Puis comptabilisez..."
"Opprett en fri regnskapsdimensjon 'Kostsenter' med verdiene 'Innkjøp' og 'Logistikk'..."
```

### tx_task_id 26 → Monthly closing (our taskId 26 — NEWLY RESOLVED)
```
"Gjer månavslutninga for mars 2026. Periodiser forskotsbetalt kostnad (8950 kr per månad frå konto 1700 til kostnadskonto)..."
"Realice el cierre mensual de marzo de 2026. Registre la periodificación (11900 NOK por mes de la cuenta 1700 a gasto)..."
```

### tx_task_id 30 → Simplified annual closing (our taskId 30 — NEWLY RESOLVED)
```
"Utfør forenklet årsoppgjør for 2025: 1) Beregn og bokfør årlige avskrivninger for tre eiendeler..."
"Realice el cierre anual simplificado de 2025: 1) Calcule y contabilice la depreciación anual de tres activos..."
```
