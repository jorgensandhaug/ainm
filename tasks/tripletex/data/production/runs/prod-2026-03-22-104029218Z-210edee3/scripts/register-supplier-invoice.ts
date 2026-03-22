const fs = require("fs");

const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "UNpaJRw1WsY-hu9mL4iQtrsGvbUDjrmJBCvkRxT8myI";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const PDF_PATH = "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-104029218Z-210edee3/attachments/01-leverandorfaktura_nn_03.pdf";

// Invoice data from PDF
const supplierName = "Fjelltopp AS";
const orgNumber = "804872205";
const street = "Solveien 92";
const postalCode = "8006";
const city = "Bodø";
const invoiceNumber = "INV-2026-8221";
const invoiceDate = "2026-06-10";
const dueDate = "2026-07-10";
const description = "Nettverkstjenester";
const net = 48400;
const vatAmount = 12100;
const gross = 60500;
const bankAccount = "53239317029";
const expenseAccountNumber = 6300;

async function run() {
  // Step 1: Create supplier
  console.log("=== Step 1: POST /supplier ===");
  const supplierRes = await fetch(`${BASE}/supplier`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
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
  const supplier = await supplierRes.json();
  console.log("Supplier response status:", supplierRes.status);
  console.log("Supplier:", JSON.stringify(supplier.value));
  const supplierId = supplier.value.id;
  const ledgerAccountId = supplier.value.ledgerAccount.id;
  console.log("supplierId:", supplierId, "ledgerAccountId (2400):", ledgerAccountId);

  // Step 2: GET expense account ID
  console.log("\n=== Step 2: GET /ledger/account ===");
  const acctRes = await fetch(`${BASE}/ledger/account?number=${expenseAccountNumber}&isApplicableForSupplierInvoice=true&fields=id,number`, {
    headers: { Authorization: AUTH }
  });
  const acctData = await acctRes.json();
  console.log("Account response:", JSON.stringify(acctData));
  const expenseAccountId = acctData.values[0].id;
  console.log("expenseAccountId:", expenseAccountId);

  // Step 3: importDocument with EHF XML (includes PaymentMeans)
  console.log("\n=== Step 3: POST /ledger/voucher/importDocument ===");
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
  console.log("importDocument status:", impRes.status);
  console.log("importDocument response:", JSON.stringify(imp));
  const voucherId = imp.values[0].id;
  const version1 = imp.values[0].version;
  console.log("voucherId:", voucherId, "version1:", version1);

  // Step 4: Upload PDF attachment
  console.log("\n=== Step 4: POST /ledger/voucher/{id}/attachment ===");
  const pdfData = fs.readFileSync(PDF_PATH);
  const pdfForm = new FormData();
  pdfForm.append("file", new Blob([pdfData], { type: "application/pdf" }), "leverandorfaktura.pdf");
  const attRes = await fetch(`${BASE}/ledger/voucher/${voucherId}/attachment`, {
    method: "POST", headers: { Authorization: AUTH }, body: pdfForm,
  });
  console.log("Attachment upload status:", attRes.status);
  if (attRes.status !== 201) {
    console.log("Attachment response:", await attRes.text());
  }

  // Step 5: PUT postings (sendToLedger=false)
  console.log("\n=== Step 5: PUT /ledger/voucher (postings, sendToLedger=false) ===");
  const postingsBody = {
    version: version1,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description: description,
        vatType: { id: 1 },
        amount: net,
        amountCurrency: net,
        amountGross: gross,
        amountGrossCurrency: gross
      },
      {
        row: 2,
        account: { id: ledgerAccountId },
        supplier: { id: supplierId },
        description: description,
        amount: -gross,
        amountCurrency: -gross,
        amountGross: -gross,
        amountGrossCurrency: -gross,
        invoiceNumber: invoiceNumber,
        termOfPayment: dueDate
      }
    ]
  };
  const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
    method: "PUT",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(postingsBody)
  });
  const putData = await putRes.json();
  console.log("PUT postings status:", putRes.status);
  console.log("PUT postings response:", JSON.stringify(putData));
  const version2 = putData.value.version;
  console.log("version2:", version2);

  // Step 6: Book (sendToLedger=true)
  console.log("\n=== Step 6: PUT /ledger/voucher (book, sendToLedger=true) ===");
  const bookBody = {
    version: version2,
    voucherType: { name: "Leverandørfaktura" }
  };
  const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
    method: "PUT",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(bookBody)
  });
  const bookData = await bookRes.json();
  console.log("Book status:", bookRes.status);
  console.log("Book response:", JSON.stringify(bookData));

  // Step 7: Verification GETs
  console.log("\n=== Step 7: Verification GETs ===");

  // Verify supplier
  const vs = await fetch(`${BASE}/supplier/${supplierId}?fields=id,name,organizationNumber,postalAddress(addressLine1,postalCode,city,country(id)),physicalAddress(addressLine1,postalCode,city,country(id)),bankAccountPresentation`, { headers: { Authorization: AUTH } });
  console.log("Supplier:", JSON.stringify((await vs.json()).value));

  // Verify voucher
  const vv = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=id,number,description,date,vendorInvoiceNumber,document,attachment,ediDocument,voucherType(id,name)`, { headers: { Authorization: AUTH } });
  console.log("Voucher:", JSON.stringify((await vv.json()).value));

  // Verify supplierInvoice
  const si = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-12-31&invoiceNumber=${invoiceNumber}&fields=id,invoiceNumber,invoiceDate,invoiceDueDate,amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,outstandingAmount,kidOrReceiverReference,isCreditNote,supplier(id,name),voucher(id,number),orderLines(id,description)`, { headers: { Authorization: AUTH } });
  const siData = await si.json();
  console.log("SupplierInvoice:", JSON.stringify(siData.values?.[0]));
  console.log("kidOrReceiverReference:", siData.values?.[0]?.kidOrReceiverReference);

  console.log("\n=== DONE ===");
}

run().catch(e => { console.error("FATAL:", e); process.exit(1); });
