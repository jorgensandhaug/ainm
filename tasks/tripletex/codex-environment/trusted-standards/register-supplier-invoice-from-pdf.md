# Register Supplier Invoice from PDF

> **NO BETA ENDPOINTS.** NEVER use `/incomingInvoice*` or any `(BETA)` endpoint. They ALL return `403`.
> **USE importDocument.** Direct `POST /ledger/voucher` scored 2/10 — it does NOT create the required `supplierInvoice` entity.

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- prompt says "received a supplier invoice" + "see attached PDF" (or equivalent in any language)
- prompt has an actual PDF attachment with supplier name, org number, invoice number, dates, amounts, account, bank account
- prompt says "create the supplier if it does not exist"
- the supplier data comes from the PDF, NOT from the prompt text

## Do Not Use This Standard If
- prompt provides all invoice data inline (no PDF) — use `./trusted-standards/register-supplier-invoice.md` instead (T11)
- task is reversal, approval, payment, or correction of an existing supplier invoice

## Why importDocument (NOT direct POST /ledger/voucher)

Both T20 and T11 use `importDocument` — direct `POST /ledger/voucher` does NOT create a `supplierInvoice` entity.

| Approach | T20 score | T11 score | Why |
|---|---|---|---|
| importDocument | **7-8/10** | 1/8 | Creates real `supplierInvoice` entity; T11 description mismatch costs 1 check |
| Direct POST /ledger/voucher | **2/10** | best 1/8 | No `supplierInvoice` entity created |

**NEVER use direct `POST /ledger/voucher` for supplier invoice tasks.**

## Standard Flow (25% VAT — most common)
1. `POST /supplier` — with physicalAddress + country + bankAccountPresentation
2. `GET /ledger/account?number=...&isApplicableForSupplierInvoice=true&fields=*`
3. `POST /ledger/voucher/importDocument` — with EHF/UBL XML invoice
4. `PUT /ledger/voucher/{id}?sendToLedger=false` — set postings with `vatType: { id: 1 }` on debit
5. `PUT /ledger/voucher/{id}?sendToLedger=true` — book with `{ version, voucherType: { name: "Leverandørfaktura" } }`

This is **5 calls** total for 25% VAT.

For **non-25% VAT rates**, insert `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<invoice-date>&fields=*` between steps 2 and 3, making it **6 calls**.

## Supplier Creation Rules (CRITICAL for Check 5)

Extract ALL data from the PDF and include in `POST /supplier`:

```json
{
  "name": "<supplier name from PDF>",
  "organizationNumber": "<org number from PDF>",
  "postalAddress": {
    "addressLine1": "<street from PDF>",
    "postalCode": "<postal code from PDF>",
    "city": "<city from PDF>",
    "country": { "id": 161 }
  },
  "physicalAddress": {
    "addressLine1": "<street from PDF>",
    "postalCode": "<postal code from PDF>",
    "city": "<city from PDF>",
    "country": { "id": 161 }
  },
  "bankAccountPresentation": [{ "bban": "<bank account from PDF>" }]
}
```

- **MUST set both `postalAddress` AND `physicalAddress`** to the same address — omitting `physicalAddress` fails Check 5
- **MUST include `country: { id: 161 }`** on both addresses (161 = Norge)
- do NOT use `country: "NO"` (string) — Tripletex rejects with 422
- do NOT use deprecated `bankAccounts` string array — use `bankAccountPresentation` with `bban`
- All 6 production runs that used importDocument but omitted physicalAddress failed Check 5

## importDocument Rules

### EHF/UBL XML Structure
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>{invoiceNumber}</cbc:ID>
  <cbc:IssueDate>{invoiceDate}</cbc:IssueDate>
  <cbc:DueDate>{dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">{orgNumber}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>{supplierName}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>{street}</cbc:StreetName>
        <cbc:CityName>{city}</cbc:CityName>
        <cbc:PostalZone>{postalCode}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO{orgNumber}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>{supplierName}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">{orgNumber}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Ditt firma</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Ditt firma</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">{vatAmount}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">{net}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">{vatAmount}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">{net}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">{net}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">{gross}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">{gross}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">{net}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>{description}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">{net}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>
```

### Response Shape
- `POST /ledger/voucher/importDocument` returns **`{ values: [{ id, version, ... }] }`**, NOT `{ value: { id } }`
- Extract `response.values[0].id` and `response.values[0].version`
- Using `response.value.id` will crash — 2026-03-21 production run wasted 4 calls recovering from this

### FormData Upload
```typescript
const formData = new FormData();
formData.append("file", new Blob([xml], { type: "text/xml" }), `${invoiceNumber}.xml`);
const res = await fetch(`${BASE}/ledger/voucher/importDocument`, {
  method: "POST",
  headers: { Authorization: AUTH },  // NO Content-Type — let FormData set it
  body: formData,
});
```

## Posting Rules (Step 4)

```json
{
  "version": "<from importDocument response>",
  "postings": [
    {
      "row": 1,
      "account": { "id": "<expense-account-id>" },
      "description": "<description from PDF>",
      "vatType": { "id": 1 },
      "amount": "<net>",
      "amountCurrency": "<net>",
      "amountGross": "<gross>",
      "amountGrossCurrency": "<gross>"
    },
    {
      "row": 2,
      "account": { "id": "<supplier-ledger-account-id>" },
      "supplier": { "id": "<supplier-id>" },
      "description": "<description from PDF>",
      "amount": "<-gross>",
      "amountCurrency": "<-gross>",
      "amountGross": "<-gross>",
      "amountGrossCurrency": "<-gross>",
      "invoiceNumber": "<invoice number from PDF>",
      "termOfPayment": "<due date from PDF>"
    }
  ]
}
```

- Row 0 is reserved for system-generated VAT posting — do NOT use row 0
- Use `PUT /ledger/voucher/{id}?sendToLedger=false` — do NOT book yet
- Hard-code `vatType: { id: 1 }` for 25% incoming VAT

## Booking Rules (Step 5 — CRITICAL for Check 6)

- `PUT /ledger/voucher/{id}?sendToLedger=true` with `{ "version": <version-from-step-4>, "voucherType": { "name": "Leverandørfaktura" } }`
- do NOT include `postings` in the booking PUT — it fails with "Bilag uten posteringer kan ikke bli sendt til hovedbok"
- Use the `version` returned by step 4, NOT the original import version
- The voucher starts UNBOOKED (number=0) — the booking step assigns a real number
- **All production runs that omitted the booking step scored 0 on Check 6**
- 2026-03-22 sandbox proof: booking PUT returns voucher with number=748, confirming booked state

## Verification (zero extra calls needed)

The 5 API calls produce all necessary state:
- `POST /supplier` response confirms supplier with all fields
- `POST /ledger/voucher/importDocument` response confirms supplierInvoice entity created
- `PUT sendToLedger=false` response confirms correct postings
- `PUT sendToLedger=true` response confirms voucher booked (number > 0)

Only add verification GETs if a write response contradicts expected state.

## What Gets Created

importDocument creates TWO entities:
1. **Voucher** (`/ledger/voucher/{id}`) — the accounting entry, booked
2. **supplierInvoice** (`/supplierInvoice/{id}`) — the business-level supplier invoice record

The supplierInvoice has:
- `invoiceNumber` = from XML
- `amount` = -gross (negative)
- `amountExcludingVat` = -net
- `outstandingAmount` = gross (positive)
- `supplier.id` = linked to created supplier
- `voucher.id` = linked to the voucher

This is what the T20 scorer checks — direct `POST /ledger/voucher` does NOT create the supplierInvoice entity.

## Known Pitfalls
- do NOT use direct `POST /ledger/voucher` for T20 — it only creates a voucher, not a supplierInvoice entity; scored 2/10
- do NOT access importDocument response as `response.value` — it's `response.values[0]`
- do NOT omit `row` values on PUT postings — causes 422
- do NOT omit `physicalAddress` or `country: { id: 161 }` on supplier — fails Check 5
- do NOT combine postings + sendToLedger=true in one PUT — fails
- do NOT omit the booking step (sendToLedger=true) — fails Check 6
- do NOT use deprecated `bankAccounts` field — use `bankAccountPresentation`
- preserve exact casing of description from PDF

## Check-by-Check Analysis (from 11 production runs)
- **Check 1** (supplier exists): all 11 runs passed — both approaches create the supplier
- **Check 2** (supplierInvoice exists): passed with importDocument, FAILED with direct voucher
- **Check 3** (correct amounts): passed with importDocument, FAILED with direct voucher
- **Check 4** (correct VAT/postings): passed with importDocument, FAILED with direct voucher
- **Check 5** (supplier physicalAddress): FAILED in all 6 importDocument runs (missing physicalAddress+country); **FIX: set both postalAddress AND physicalAddress with country: { id: 161 }**
- **Check 6** (voucher booked): passed in 3 importDocument runs with booking step; FAILED in 3 without

## Sandbox Proof (2026-03-22)
- supplier `Oakwood SBX T20` / `948453436` created with postalAddress + physicalAddress + country + bank
- importDocument created voucher 609294111 + supplierInvoice 2147670828
- postings set: expense 6340 net=45400 gross=56750 vatType=1; supplier -56750
- voucher booked as number 748
- supplierInvoice verified: invoiceNumber="INV-2026-T20-SBX", amount=-56750, amountExcludingVat=-45400, outstandingAmount=56750
- 5 API calls, 0 errors
