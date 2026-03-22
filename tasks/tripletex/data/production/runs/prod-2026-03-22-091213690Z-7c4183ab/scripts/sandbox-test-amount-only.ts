const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const supplierId = 108568022;
const creditAccountId = 424190921;
const expenseAccountId = 424191128;
const orgNumber = "964942366";
const supplierName = "Luz do Sol Lda";
const street = "Kirkegata 135";
const postalCode = "5003";
const city = "Bergen";
const invoiceNumber = "INV-2026-8987-SBX5";
const invoiceDate = "2026-01-06";
const dueDate = "2026-02-05";
const description = "Kontorrekvisita";
const net = 24750;
const vatAmount = 6187;
const gross = 30937;

// importDocument
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
if (!impRes.ok) { console.error("Import failed:", JSON.stringify(imp)); process.exit(1); }
const voucherId = imp.values[0].id;
const version1 = imp.values[0].version;
console.log("voucherId:", voucherId, "version:", version1);

// Test multiple posting approaches
const approaches = [
  {
    name: "A: amount-only (no amountGross)",
    postings: [
      {
        row: 1, account: { id: expenseAccountId }, description,
        vatType: { id: 1 },
        amount: net, amountCurrency: net
        // NO amountGross
      },
      {
        row: 2, account: { id: creditAccountId },
        supplier: { id: supplierId }, description,
        amount: -gross, amountCurrency: -gross,
        amountGross: -gross, amountGrossCurrency: -gross,
        invoiceNumber, termOfPayment: dueDate
      }
    ]
  },
  {
    name: "B: amountGross=gross, let Tripletex compute net",
    postings: [
      {
        row: 1, account: { id: expenseAccountId }, description,
        vatType: { id: 1 },
        amountGross: gross, amountGrossCurrency: gross
        // NO amount
      },
      {
        row: 2, account: { id: creditAccountId },
        supplier: { id: supplierId }, description,
        amount: -gross, amountCurrency: -gross,
        amountGross: -gross, amountGrossCurrency: -gross,
        invoiceNumber, termOfPayment: dueDate
      }
    ]
  }
];

// Run approach A first
console.log("\n=== Approach A ===");
const putA = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
  method: "PUT", headers: H,
  body: JSON.stringify({ version: version1, postings: approaches[0].postings })
});
const putAData = await putA.json();
console.log("Status:", putA.status);
if (!putA.ok) { console.error(JSON.stringify(putAData, null, 2)); }
else {
  // Read back the postings
  const v = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=id,version,postings(id,row,account(number),amount,amountGross,amountCurrency,amountGrossCurrency,vatType(id,percentage))`, {
    headers: { Authorization: AUTH }
  });
  const vd = await v.json();
  for (const p of vd.value.postings) {
    console.log(`Row ${p.row}: acct ${p.account.number} | amt=${p.amount} | gross=${p.amountGross} | amtCcy=${p.amountCurrency} | grossCcy=${p.amountGrossCurrency} | vat=${p.vatType?.percentage}%`);
  }

  // Now try approach B
  console.log("\n=== Approach B ===");
  const putB = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
    method: "PUT", headers: H,
    body: JSON.stringify({ version: vd.value.version, postings: approaches[1].postings })
  });
  const putBData = await putB.json();
  console.log("Status:", putB.status);
  if (!putB.ok) { console.error(JSON.stringify(putBData, null, 2)); }
  else {
    const v2 = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=id,version,postings(id,row,account(number),amount,amountGross,amountCurrency,amountGrossCurrency,vatType(id,percentage))`, {
      headers: { Authorization: AUTH }
    });
    const v2d = await v2.json();
    for (const p of v2d.value.postings) {
      console.log(`Row ${p.row}: acct ${p.account.number} | amt=${p.amount} | gross=${p.amountGross} | amtCcy=${p.amountCurrency} | grossCcy=${p.amountGrossCurrency} | vat=${p.vatType?.percentage}%`);
    }
  }
}
