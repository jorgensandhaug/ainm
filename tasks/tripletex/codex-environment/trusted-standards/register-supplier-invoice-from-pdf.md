# Register Supplier Invoice from PDF

> **NEVER use `/incomingInvoice*` or any `(BETA)` endpoint — ALL return `403`.**
> **NEVER use direct `POST /ledger/voucher` — it does NOT create the required `supplierInvoice` entity (scored 2/10).**
> **USE `POST /ledger/voucher/importDocument` with EHF XML.**
> **After reading this standard, IMMEDIATELY write the script and run it. Do NOT read AGENTS.md, playbooks, or openapi.json. Two production runs (prod-4c255d98, prod-de228487) scored 0% by timing out after reading without ever writing a script.**

## Match
- prompt mentions "supplier invoice" + "PDF" (any language) + has a PDF attachment
- if prompt has all data inline (no PDF) → use `./register-supplier-invoice.md` instead

## Flow (4 writes + 1 required GET + free verification GETs, 25% VAT)
1. `POST /supplier` — with postalAddress + physicalAddress + country + bankAccountPresentation → **extract `supplierId` AND `ledgerAccount.id`** (the supplier ledger account, always 2400)
2. `GET /ledger/account?number=<expense-acct-from-PDF>&isApplicableForSupplierInvoice=true&fields=id,number` → `.values[0].id` (free GET)
3. `POST /ledger/voucher/importDocument` — FormData with EHF XML (MUST include PaymentMeans) → **`.values[0].id`** and **`.values[0].version`** (NOT `.value`). **importDocument auto-generates BOTH a PDF attachment and an XML ediDocument on the voucher — do NOT upload the PDF separately.**
4. `PUT /ledger/voucher/{id}?sendToLedger=false` — set postings → `.value.version`
5. `PUT /ledger/voucher/{id}?sendToLedger=true` — book with `{ version, voucherType: { name: "Leverandørfaktura" } }`
6. Verification GETs (free): GET supplier, GET voucher, GET supplierInvoice, GET postings — log all fields

**Do NOT add a separate GET for account 2400** — the supplier POST response always includes `ledgerAccount: { id: <2400-id> }`.

**Do NOT upload the original PDF** — `importDocument` auto-generates a PDF attachment from the EHF XML. Sandbox-verified 2026-03-22: voucher.attachment is already populated (mimeType=application/pdf) after importDocument alone. The separate `POST /attachment` wastes 1 write for no scoring benefit. Run 210edee3 included this extra step and it had no impact — all scoring-relevant fields were already set by importDocument.

For non-25% VAT, add `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<date>&fields=*` between steps 2–3.

## Step 1: Supplier (CRITICAL — both addresses + country)
```json
{
  "name": "<from PDF>", "organizationNumber": "<from PDF>",
  "postalAddress": {
    "addressLine1": "<street>", "postalCode": "<code>", "city": "<city>",
    "country": { "id": 161 }
  },
  "physicalAddress": {
    "addressLine1": "<street>", "postalCode": "<code>", "city": "<city>",
    "country": { "id": 161 }
  },
  "bankAccountPresentation": [{ "bban": "<bank account>" }]
}
```
MUST set BOTH `postalAddress` AND `physicalAddress` with `country: { id: 161 }`. All 6 production runs that omitted physicalAddress failed.

## Step 3: importDocument (EHF XML)

**CRITICAL: PaymentMeans section is REQUIRED.** Without it, `kidOrReceiverReference` on the SI entity stays empty — Check 5 failed across all 11 T20 production runs that omitted this section. Sandbox-verified 2026-03-22: adding PaymentMeans with `PaymentID=${invoiceNumber}` correctly populates `kidOrReceiverReference`. Run 210edee3 is the FIRST production run to include PaymentMeans and confirmed `kidOrReceiverReference` populated in verification GET.

```typescript
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${invoiceDate}</cbc:IssueDate>
  <cbc:DueDate>${dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
    <cac:PostalAddress>
      <cbc:StreetName>${street}</cbc:StreetName><cbc:CityName>${city}</cbc:CityName>
      <cbc:PostalZone>${postalCode}</cbc:PostalZone>
      <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
    </cac:PostalAddress>
    <cac:PartyTaxScheme>
      <cbc:CompanyID>NO${orgNumber}MVA</cbc:CompanyID>
      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
    </cac:PartyTaxScheme>
    <cac:PartyLegalEntity>
      <cbc:RegistrationName>${supplierName}</cbc:RegistrationName>
      <cbc:CompanyID schemeID="0192">${orgNumber}</cbc:CompanyID>
    </cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Ditt firma</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>Ditt firma</cbc:RegistrationName>
      <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${invoiceNumber}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${bankAccount}</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${vatAmount}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${net}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${vatAmount}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${net}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${gross}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${gross}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${description}</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${net}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
const formData = new FormData();
formData.append("file", new Blob([xml], { type: "text/xml" }), `${invoiceNumber}.xml`);
const impRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
  method: "POST", headers: { Authorization: AUTH }, body: formData,
});
const imp = await impRes.json();
const voucherId = imp.values[0].id;   // NOT .value — CRITICAL
const version1 = imp.values[0].version;
```

## Step 4: Set Postings (sendToLedger=false)
```json
{
  "version": "<version1 from step 3>",
  "postings": [
    {
      "row": 1, "account": { "id": "<expense-acct-id-from-step-2>" },
      "description": "<from PDF>", "vatType": { "id": 1 },
      "amount": "<net>", "amountCurrency": "<net>",
      "amountGross": "<gross>", "amountGrossCurrency": "<gross>"
    },
    {
      "row": 2, "account": { "id": "<step-1-response.value.ledgerAccount.id>" },
      "supplier": { "id": "<supplier-id-from-step-1>" }, "description": "<from PDF>",
      "amount": "<-gross>", "amountCurrency": "<-gross>",
      "amountGross": "<-gross>", "amountGrossCurrency": "<-gross>",
      "invoiceNumber": "<from PDF>", "termOfPayment": "<due date>"
    }
  ]
}
```
**Row 2 credit account**: use `response.value.ledgerAccount.id` from the POST /supplier response (step 1). This is always account 2400. Do NOT make a separate GET for it.

## Step 5: Book (sendToLedger=true)
Body: `{ "version": <version-from-step-4-response>, "voucherType": { "name": "Leverandørfaktura" } }`
Do NOT include postings — causes 422. Use version from step 4 response, not step 3.

## Step 6: Verification GETs (free — do not count against score)
After booking, run verification GETs to confirm all entities and log key fields:
```typescript
// Verify supplier
const vs = await fetch(`${BASE}/supplier/${supplierId}?fields=id,name,organizationNumber,postalAddress(addressLine1,postalCode,city,country(id)),physicalAddress(addressLine1,postalCode,city,country(id)),bankAccountPresentation`, { headers: { Authorization: AUTH } });
console.log("Supplier:", JSON.stringify((await vs.json()).value));

// Verify voucher
const vv = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=id,number,description,date,vendorInvoiceNumber,document,attachment,ediDocument,voucherType(id,name)`, { headers: { Authorization: AUTH } });
console.log("Voucher:", JSON.stringify((await vv.json()).value));

// Verify supplierInvoice (search by invoiceNumber — supplierId filter may lag)
const si = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-12-31&invoiceNumber=${invoiceNumber}&fields=id,invoiceNumber,invoiceDate,invoiceDueDate,amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,outstandingAmount,kidOrReceiverReference,isCreditNote,supplier(id,name),voucher(id,number),orderLines(id,description)`, { headers: { Authorization: AUTH } });
const siData = await si.json();
console.log("SupplierInvoice:", JSON.stringify(siData.values?.[0]));
console.log("kidOrReceiverReference:", siData.values?.[0]?.kidOrReceiverReference);
```
**IMPORTANT**: Search supplierInvoice by `invoiceNumber`, NOT by `supplierId` — the supplierId filter has a timing issue and may return 0 results immediately after booking.

## Pitfalls
- **TIMEOUT KILLS**: Two production runs (prod-4c255d98, prod-de228487) scored 0% with 0 API calls because the agent read the standard then stalled in thinking for 5 minutes. After reading this file, IMMEDIATELY write the script and execute it. Do not read any other files.
- **PaymentMeans is REQUIRED in the XML** — without it, `kidOrReceiverReference` on the SI entity stays empty and Check 5 fails. This was the ONLY failing check across 11 T20 runs that all scored 8/10 or less. Add `<cac:PaymentMeans>` with `<cbc:PaymentID>${invoiceNumber}</cbc:PaymentID>` and `<cac:PayeeFinancialAccount><cbc:ID>${bankAccount}</cbc:ID></cac:PayeeFinancialAccount>`. Sandbox-verified 2026-03-22. Run 210edee3 is the first production run to include PaymentMeans — verification GET confirmed `kidOrReceiverReference` populated.
- **Do NOT upload the original PDF** — `importDocument` auto-generates a PDF attachment from the EHF XML (sandbox-verified: `attachment.mimeType=application/pdf` is populated after importDocument alone). The separate `POST /attachment` wastes 1 write for zero scoring benefit.
- `importDocument` response is `.values[0]` (plural) — `.value` crashes and creates orphaned SI entity
- Row 0 is reserved — use row 1 and 2
- `account: { number: N }` → 422; MUST use `account: { id }` from GET
- Do NOT combine postings + sendToLedger=true in one PUT — 422
- `bankAccounts` string array is deprecated — use `bankAccountPresentation: [{ bban }]`
- Preserve exact description casing from PDF
- Do NOT make a separate GET for account 2400 — extract `ledgerAccount.id` from POST /supplier response
- **4 writes is the proven optimal flow** — sandbox-verified 2026-03-22: combining steps 4+5 → 422; using `account:{number}` without id → 422. GETs are free and do not count.
