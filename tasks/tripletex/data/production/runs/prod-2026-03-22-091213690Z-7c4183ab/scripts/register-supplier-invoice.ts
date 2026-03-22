const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "IEXicrE9vxN8WiDitW_raP_nECqW-zqUpqfwMYGG_U4";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// PDF data
const supplierName = "Luz do Sol Lda";
const orgNumber = "964942366";
const street = "Kirkegata 135";
const postalCode = "5003";
const city = "Bergen";
const bankAccount = "53342237408";
const invoiceNumber = "INV-2026-8987";
const invoiceDate = "2026-01-06";
const dueDate = "2026-02-05";
const description = "Kontorrekvisita";
const net = 24750;
const vatAmount = 6187;
const gross = 30937;
const expenseAccount = 6500;

// Step 1: Create supplier
console.log("=== Step 1: POST /supplier ===");
const suppRes = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    name: supplierName,
    organizationNumber: orgNumber,
    postalAddress: {
      addressLine1: street, postalCode, city,
      country: { id: 161 }
    },
    physicalAddress: {
      addressLine1: street, postalCode, city,
      country: { id: 161 }
    },
    bankAccountPresentation: [{ bban: bankAccount }]
  })
});
const supp = await suppRes.json();
console.log("Supplier status:", suppRes.status);
if (!suppRes.ok) { console.error(JSON.stringify(supp)); process.exit(1); }
const supplierId = supp.value.id;
const creditAccountId = supp.value.ledgerAccount.id;
console.log("supplierId:", supplierId, "creditAccountId (2400):", creditAccountId);

// Step 2: GET expense account id
console.log("=== Step 2: GET /ledger/account ===");
const acctRes = await fetch(`${BASE}/ledger/account?number=${expenseAccount}&isApplicableForSupplierInvoice=true&fields=id,number`, {
  headers: { Authorization: AUTH }
});
const acct = await acctRes.json();
console.log("Account status:", acctRes.status);
if (!acctRes.ok) { console.error(JSON.stringify(acct)); process.exit(1); }
const expenseAccountId = acct.values[0].id;
console.log("expenseAccountId:", expenseAccountId);

// Step 3: importDocument with EHF XML
console.log("=== Step 3: POST /ledger/voucher/importDocument ===");
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
console.log("Import status:", impRes.status);
if (!impRes.ok) { console.error(JSON.stringify(imp)); process.exit(1); }
const voucherId = imp.values[0].id;
const version1 = imp.values[0].version;
console.log("voucherId:", voucherId, "version:", version1);

// Step 4: PUT postings (sendToLedger=false)
console.log("=== Step 4: PUT postings ===");
const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
  method: "PUT",
  headers: H,
  body: JSON.stringify({
    version: version1,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description,
        vatType: { id: 1 },
        amount: net,
        amountCurrency: net,
        amountGross: gross,
        amountGrossCurrency: gross
      },
      {
        row: 2,
        account: { id: creditAccountId },
        supplier: { id: supplierId },
        description,
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
console.log("PUT postings status:", putRes.status);
if (!putRes.ok) { console.error(JSON.stringify(putData)); process.exit(1); }
const version2 = putData.value.version;
console.log("version after postings:", version2);

// Step 5: Book (sendToLedger=true)
console.log("=== Step 5: PUT book ===");
const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
  method: "PUT",
  headers: H,
  body: JSON.stringify({
    version: version2,
    voucherType: { name: "Leverandørfaktura" }
  })
});
const bookData = await bookRes.json();
console.log("Book status:", bookRes.status);
if (!bookRes.ok) { console.error(JSON.stringify(bookData)); process.exit(1); }
console.log("=== DONE === voucherId:", voucherId, "booked successfully");
