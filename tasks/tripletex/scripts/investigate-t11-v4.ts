// Investigate task 11 - Part 4: Test the dedicated supplier invoice postings endpoint
// PUT /supplierInvoice/voucher/{id}/postings?sendToLedger=true
// AND test POST /supplierInvoice (direct creation without EHF)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const ts = Date.now();

// ============================================================
// APPROACH A: EHF import + dedicated supplierInvoice postings endpoint
// ============================================================
console.log("=== APPROACH A: EHF import + supplierInvoice/voucher/{id}/postings ===");

const SUPPLIER_A_NAME = `ApproachA ${ts}`;
const ORG_NR_A = "987654325";
const INVOICE_A = `INV-A-${ts}`;
const GROSS = 42100;
const NET = 33680;
const VAT_AMT = 8420;
const EXPENSE_ACCT = 6540;
const DESCRIPTION = "kontortjenester";
const DATE = "2026-03-21";

// Create supplier
const supARes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: SUPPLIER_A_NAME, organizationNumber: ORG_NR_A }),
});
const supAData = await supARes.json();
const supAId = supAData.value.id;
const supALedger = supAData.value.ledgerAccount.id;
console.log("Supplier A:", supAId, "LedgerAcct:", supALedger);

// Get expense account
const acctRes = await fetch(`${BASE}/ledger/account?number=${EXPENSE_ACCT}&isApplicableForSupplierInvoice=true&fields=*`, { headers: H });
const acctData = await acctRes.json();
const expAcctId = acctData.values[0].id;
console.log("Expense account:", expAcctId);

// Import EHF
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_A}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NR_A}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_A_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Hovedgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG_NR_A}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${SUPPLIER_A_NAME}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${ORG_NR_A}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>My Company</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${VAT_AMT}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${VAT_AMT}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${DESCRIPTION}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

const formData = new FormData();
formData.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
  method: "POST",
  headers: { Authorization: AUTH },
  body: formData,
});
const importData = await importRes.json();
console.log("Import status:", importRes.status);
const voucherId = importData.values[0].id;
console.log("Voucher ID:", voucherId);

// Now try the DEDICATED supplierInvoice postings endpoint instead of generic voucher PUT
console.log("\n--- Try PUT /supplierInvoice/voucher/{id}/postings?sendToLedger=false ---");
const siPostRes = await fetch(`${BASE}/supplierInvoice/voucher/${voucherId}/postings?sendToLedger=false`, {
  method: "PUT",
  headers: H,
  body: JSON.stringify([
    {
      row: 1,
      account: { id: expAcctId },
      description: DESCRIPTION,
      vatType: { id: 1 },
      amount: NET,
      amountCurrency: NET,
      amountGross: GROSS,
      amountGrossCurrency: GROSS,
    },
    {
      row: 2,
      account: { id: supALedger },
      supplier: { id: supAId },
      description: DESCRIPTION,
      amount: -GROSS,
      amountCurrency: -GROSS,
      amountGross: -GROSS,
      amountGrossCurrency: -GROSS,
      invoiceNumber: INVOICE_A,
      termOfPayment: DATE,
    },
  ]),
});
console.log("Status:", siPostRes.status);
const siPostData = await siPostRes.json();
console.log("Response:", JSON.stringify(siPostData, null, 2));

// If that worked, try sendToLedger=true
if (siPostRes.ok) {
  console.log("\n--- Try PUT /supplierInvoice/voucher/{id}/postings?sendToLedger=true ---");
  const siBookRes = await fetch(`${BASE}/supplierInvoice/voucher/${voucherId}/postings?sendToLedger=true`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify([]),
  });
  console.log("Status:", siBookRes.status);
  const siBookData = await siBookRes.json();
  console.log("Response:", JSON.stringify(siBookData, null, 2));
}

// Check the supplierInvoice after using the dedicated endpoint
console.log("\n--- GET supplierInvoice linked to our voucher ---");
const siCheckRes = await fetch(
  `${BASE}/supplierInvoice?invoiceDateFrom=2026-03-01&invoiceDateTo=2026-12-31&voucherId=${voucherId}&fields=*`,
  { headers: H }
);
console.log("Status:", siCheckRes.status);
const siCheckData = await siCheckRes.json();
console.log("Count:", siCheckData.fullResultSize);
for (const si of (siCheckData.values || [])) {
  console.log(JSON.stringify(si, null, 2));
}

// ============================================================
// APPROACH B: Direct POST /supplierInvoice (no EHF)
// ============================================================
console.log("\n\n=== APPROACH B: Direct POST /supplierInvoice ===");

// Create supplier B
const SUPPLIER_B_NAME = `ApproachB ${ts}`;
const ORG_NR_B = "976098897"; // Different valid org nr
const INVOICE_B = `INV-B-${ts}`;

const supBRes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: SUPPLIER_B_NAME, organizationNumber: ORG_NR_B }),
});
const supBData = await supBRes.json();
console.log("Supplier B creation:", supBRes.status);
if (!supBRes.ok) { console.log(JSON.stringify(supBData)); throw new Error("Supplier B failed"); }
const supBId = supBData.value.id;
const supBLedger = supBData.value.ledgerAccount.id;
console.log("Supplier B ID:", supBId);

// Try POST /supplierInvoice with various field combinations
const postPayloads = [
  {
    name: "minimal",
    body: {
      supplier: { id: supBId },
      invoiceNumber: INVOICE_B,
      invoiceDate: DATE,
      invoiceDueDate: DATE,
      amount: -GROSS,
      amountCurrency: -GROSS,
      currency: { id: 1 },
    },
  },
  {
    name: "with-orderLines",
    body: {
      supplier: { id: supBId },
      invoiceNumber: INVOICE_B + "-2",
      invoiceDate: DATE,
      invoiceDueDate: DATE,
      amount: -GROSS,
      amountCurrency: -GROSS,
      currency: { id: 1 },
      orderLines: [
        {
          description: DESCRIPTION,
          count: 1,
          unitCostCurrency: NET,
          vatType: { id: 1 },
          amountExcludingVatCurrency: NET,
          amountIncludingVatCurrency: GROSS,
        },
      ],
    },
  },
];

for (const payload of postPayloads) {
  console.log(`\n--- POST /supplierInvoice (${payload.name}) ---`);
  const res = await fetch(`${BASE}/supplierInvoice`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(payload.body),
  });
  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Response:", JSON.stringify(data, null, 2));

  if (res.ok) {
    // Check the created supplierInvoice
    const siId = data.value.id;
    const siVoucherId = data.value.voucher?.id;
    console.log("\nCreated supplierInvoice:", siId, "voucher:", siVoucherId);

    if (siVoucherId) {
      // Try to set postings and book via the dedicated endpoint
      console.log("\n--- Set postings via /supplierInvoice/voucher/{id}/postings?sendToLedger=true ---");
      const bookRes = await fetch(`${BASE}/supplierInvoice/voucher/${siVoucherId}/postings?sendToLedger=true`, {
        method: "PUT",
        headers: H,
        body: JSON.stringify([
          {
            row: 1,
            account: { id: expAcctId },
            description: DESCRIPTION,
            vatType: { id: 1 },
            amount: NET,
            amountCurrency: NET,
            amountGross: GROSS,
            amountGrossCurrency: GROSS,
          },
          {
            row: 2,
            account: { id: supBLedger },
            supplier: { id: supBId },
            description: DESCRIPTION,
            amount: -GROSS,
            amountCurrency: -GROSS,
            amountGross: -GROSS,
            amountGrossCurrency: -GROSS,
            invoiceNumber: payload.body.invoiceNumber,
            termOfPayment: DATE,
          },
        ]),
      });
      console.log("Postings+book status:", bookRes.status);
      const bookData = await bookRes.json();
      console.log("Response:", JSON.stringify(bookData, null, 2));

      // Get final state
      const finalRes = await fetch(`${BASE}/supplierInvoice/${siId}?fields=*`, { headers: H });
      const finalData = await finalRes.json();
      console.log("\nFinal supplierInvoice state:");
      console.log(JSON.stringify(finalData.value, null, 2));
    }
  }
}
