const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const supplierName = "Luz do Sol Test2 Lda";
const orgNumber = "964942367"; // different org to avoid duplicate
const street = "Kirkegata 135";
const postalCode = "5003";
const city = "Bergen";
const bankAccount = "53342237408";
const invoiceNumber = "INV-2026-8987-SBX2";
const invoiceDate = "2026-01-06";
const dueDate = "2026-02-05";
const description = "Kontorrekvisita";
const net = 24750;
const vatAmount = 6187;
const gross = 30937;

// Step 1: Create supplier
const suppRes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({
    name: supplierName, organizationNumber: orgNumber,
    postalAddress: { addressLine1: street, postalCode, city, country: { id: 161 } },
    physicalAddress: { addressLine1: street, postalCode, city, country: { id: 161 } },
    bankAccountPresentation: [{ bban: bankAccount }]
  })
});
const supp = await suppRes.json();
if (!suppRes.ok) { console.error("Supplier create failed:", JSON.stringify(supp)); process.exit(1); }
const supplierId = supp.value.id;
const creditAccountId = supp.value.ledgerAccount.id;
console.log("Supplier:", supplierId, "creditAcct:", creditAccountId);

// Step 2: GET expense account + VAT account
const acctRes = await fetch(`${BASE}/ledger/account?number=6500&isApplicableForSupplierInvoice=true&fields=id,number`, { headers: { Authorization: AUTH } });
const acct = await acctRes.json();
const expenseAccountId = acct.values[0].id;

// Get account 2710 (incoming VAT high rate)
const vatAcctRes = await fetch(`${BASE}/ledger/account?number=2710&fields=id,number`, { headers: { Authorization: AUTH } });
const vatAcct = await vatAcctRes.json();
const vatAccountId = vatAcct.values[0].id;
console.log("expenseAcct:", expenseAccountId, "vatAcct:", vatAccountId);

// Step 3: importDocument
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

// Step 4: Try 3 manual postings (no vatType auto-generation)
console.log("\n=== Step 4: PUT 3 manual postings (no auto-VAT) ===");
const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
  method: "PUT", headers: H,
  body: JSON.stringify({
    version: version1,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description,
        vatType: { id: 0 },
        amount: net,
        amountCurrency: net,
        amountGross: net,
        amountGrossCurrency: net
      },
      {
        row: 2,
        account: { id: vatAccountId },
        description,
        vatType: { id: 0 },
        amount: vatAmount,
        amountCurrency: vatAmount,
        amountGross: vatAmount,
        amountGrossCurrency: vatAmount
      },
      {
        row: 3,
        account: { id: creditAccountId },
        supplier: { id: supplierId },
        description,
        vatType: { id: 0 },
        amount: -gross,
        amountCurrency: -gross,
        amountGross: -gross,
        amountGrossCurrency: -gross,
        invoiceNumber,
        termOfPayment: dueDate
      }
    ]
  })
});
const putData = await putRes.json();
console.log("PUT status:", putRes.status);
if (!putRes.ok) { console.error("PUT failed:", JSON.stringify(putData, null, 2)); process.exit(1); }
const version2 = putData.value.version;

// Step 5: Book
const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
  method: "PUT", headers: H,
  body: JSON.stringify({
    version: version2,
    voucherType: { name: "Leverandørfaktura" }
  })
});
const bookData = await bookRes.json();
console.log("Book status:", bookRes.status);
if (!bookRes.ok) { console.error("Book failed:", JSON.stringify(bookData, null, 2)); process.exit(1); }
console.log("BOOKED");

// Verify postings
console.log("\n=== Verify postings ===");
const vRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=id,postings(id,row,account(id,number,name),amount,amountGross,amountCurrency,amountGrossCurrency,vatType(id,name,percentage),description,supplier(id),invoiceNumber,termOfPayment)`, {
  headers: { Authorization: AUTH }
});
const vData = await vRes.json();
for (const p of vData.value.postings) {
  console.log(JSON.stringify(p, null, 2));
  console.log("---");
}

// Verify SI
console.log("\n=== Verify SI ===");
const siRes = await fetch(`${BASE}/supplierInvoice?supplierId=${supplierId}&invoiceDateFrom=2025-01-01&invoiceDateTo=2027-01-01&fields=*`, {
  headers: { Authorization: AUTH }
});
const siData = await siRes.json();
console.log(JSON.stringify(siData.values[0], null, 2));
