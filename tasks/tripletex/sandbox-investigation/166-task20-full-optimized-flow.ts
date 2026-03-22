// Full optimized T20 flow with:
// 1. PaymentMeans in XML (populate kidOrReceiverReference)
// 2. PDF attachment upload
// 3. Verification GETs to confirm all entities

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const supplierName = "FullFlow Optimized AS";
const orgNumber = "914778271";
const street = "Storgata 42";
const postalCode = "7030";
const city = "Trondheim";
const bankAccount = "86011117947";
const invoiceNumber = "INV-2026-FULL";
const invoiceDate = "2026-01-15";
const dueDate = "2026-02-14";
const description = "Kontorutstyr";
const net = 20000;
const vatAmount = 5000;
const gross = 25000;
const expenseAccount = 6500;

// Use the real production PDF as attachment source
const fs = require("fs");
const pdfPath = "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-091213690Z-7c4183ab/attachments/01-leverandorfaktura_pt_08.pdf";

// ===== WRITE 1: POST /supplier =====
console.log("=== WRITE 1: POST /supplier ===");
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
console.log("Status:", suppRes.status);
if (!suppRes.ok) { console.error(JSON.stringify(supp)); process.exit(1); }
const supplierId = supp.value.id;
const creditAccountId = supp.value.ledgerAccount.id;
console.log("supplierId:", supplierId, "creditAccountId:", creditAccountId);

// ===== FREE GET: expense account =====
console.log("\n=== FREE GET: /ledger/account ===");
const acctRes = await fetch(`${BASE}/ledger/account?number=${expenseAccount}&isApplicableForSupplierInvoice=true&fields=id,number`, {
  headers: { Authorization: AUTH }
});
const acct = await acctRes.json();
const expenseAccountId = acct.values[0].id;
console.log("expenseAccountId:", expenseAccountId);

// ===== WRITE 2: POST /ledger/voucher/importDocument (XML with PaymentMeans) =====
console.log("\n=== WRITE 2: POST /ledger/voucher/importDocument ===");
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
console.log("Status:", impRes.status);
if (!impRes.ok) { console.error(JSON.stringify(imp)); process.exit(1); }
const voucherId = imp.values[0].id;
const version1 = imp.values[0].version;
console.log("voucherId:", voucherId, "version:", version1);

// ===== WRITE 3: POST /ledger/voucher/{id}/attachment (PDF) =====
console.log("\n=== WRITE 3: POST /ledger/voucher/{id}/attachment (PDF) ===");
if (fs.existsSync(pdfPath)) {
  const pdfData = fs.readFileSync(pdfPath);
  const pdfForm = new FormData();
  pdfForm.append("file", new Blob([pdfData], { type: "application/pdf" }), "leverandorfaktura.pdf");
  const attRes = await fetch(`${BASE}/ledger/voucher/${voucherId}/attachment`, {
    method: "POST", headers: { Authorization: AUTH }, body: pdfForm,
  });
  console.log("Attachment upload status:", attRes.status);
  if (!attRes.ok) { console.error(await attRes.text()); }
} else {
  console.log("PDF not found, skipping attachment");
}

// ===== WRITE 4: PUT postings =====
console.log("\n=== WRITE 4: PUT postings (sendToLedger=false) ===");
const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
  method: "PUT", headers: H,
  body: JSON.stringify({
    version: version1,
    postings: [
      {
        row: 1, account: { id: expenseAccountId },
        description, vatType: { id: 1 },
        amount: net, amountCurrency: net,
        amountGross: gross, amountGrossCurrency: gross
      },
      {
        row: 2, account: { id: creditAccountId },
        supplier: { id: supplierId }, description,
        amount: -gross, amountCurrency: -gross,
        amountGross: -gross, amountGrossCurrency: -gross,
        invoiceNumber, termOfPayment: dueDate
      }
    ]
  })
});
const putData = await putRes.json();
console.log("Status:", putRes.status);
if (!putRes.ok) { console.error(JSON.stringify(putData)); process.exit(1); }
const version2 = putData.value.version;

// ===== WRITE 5: PUT book =====
console.log("\n=== WRITE 5: PUT book (sendToLedger=true) ===");
const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
  method: "PUT", headers: H,
  body: JSON.stringify({
    version: version2,
    voucherType: { name: "Leverandørfaktura" }
  })
});
const bookData = await bookRes.json();
console.log("Status:", bookRes.status);
if (!bookRes.ok) { console.error(JSON.stringify(bookData)); process.exit(1); }
console.log("Voucher booked as number:", bookData.value.number);

// ===== FREE VERIFICATION GETs =====
console.log("\n\n========================================");
console.log("=== VERIFICATION (free GETs) ===");
console.log("========================================\n");

// Verify supplier
console.log("=== VERIFY: Supplier ===");
const vsRes = await fetch(`${BASE}/supplier/${supplierId}?fields=id,name,organizationNumber,postalAddress(addressLine1,postalCode,city,country(id)),physicalAddress(addressLine1,postalCode,city,country(id)),bankAccountPresentation`, {
  headers: { Authorization: AUTH }
});
const vs = await vsRes.json();
console.log("name:", vs.value.name);
console.log("org:", vs.value.organizationNumber);
console.log("postalAddress:", JSON.stringify(vs.value.postalAddress));
console.log("physicalAddress:", JSON.stringify(vs.value.physicalAddress));
console.log("bank:", JSON.stringify(vs.value.bankAccountPresentation));

// Verify voucher
console.log("\n=== VERIFY: Voucher ===");
const vvRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=id,number,description,date,vendorInvoiceNumber,document,attachment,ediDocument,voucherType(id,name)`, {
  headers: { Authorization: AUTH }
});
const vv = await vvRes.json();
console.log("number:", vv.value.number, "(should be > 0 = booked)");
console.log("description:", vv.value.description);
console.log("vendorInvoiceNumber:", vv.value.vendorInvoiceNumber);
console.log("date:", vv.value.date);
console.log("voucherType:", JSON.stringify(vv.value.voucherType));
console.log("document:", JSON.stringify(vv.value.document));
console.log("attachment:", JSON.stringify(vv.value.attachment));
console.log("ediDocument:", JSON.stringify(vv.value.ediDocument));

// Verify supplierInvoice
console.log("\n=== VERIFY: SupplierInvoice ===");
const siRes = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-12-31&supplierId=${supplierId}&fields=id,invoiceNumber,invoiceDate,invoiceDueDate,amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,outstandingAmount,kidOrReceiverReference,isCreditNote,supplier(id,name),voucher(id,number),orderLines(id,description,amount,amountExcludingVat,vatType(id,percentage))`, {
  headers: { Authorization: AUTH }
});
const si = await siRes.json();
if (si.values?.length > 0) {
  const s = si.values[0];
  console.log("invoiceNumber:", s.invoiceNumber);
  console.log("invoiceDate:", s.invoiceDate);
  console.log("invoiceDueDate:", s.invoiceDueDate);
  console.log("amount:", s.amount, "(should be -gross)");
  console.log("amountExcludingVat:", s.amountExcludingVat, "(should be -net)");
  console.log("outstandingAmount:", s.outstandingAmount, "(should be gross)");
  console.log("kidOrReceiverReference:", JSON.stringify(s.kidOrReceiverReference), "(CHECK 5 TARGET - should NOT be empty)");
  console.log("isCreditNote:", s.isCreditNote);
  console.log("supplier:", JSON.stringify(s.supplier));
  console.log("voucher:", JSON.stringify(s.voucher));
  console.log("orderLines:", JSON.stringify(s.orderLines));
} else {
  console.log("NO supplierInvoice found!");
}

// Verify postings
console.log("\n=== VERIFY: Postings ===");
const postingIds = bookData.value.postings?.map((p: any) => p.id) || [];
for (const pid of postingIds) {
  const pr = await fetch(`${BASE}/ledger/posting/${pid}?fields=id,row,description,account(id,number,name),amount,amountGross,vatType(id,number,percentage),supplier(id,name),invoiceNumber,termOfPayment,systemGenerated`, {
    headers: { Authorization: AUTH }
  });
  const pd = await pr.json();
  const p = pd.value;
  console.log(`Row ${p.row}: acct=${p.account?.number}/${p.account?.name} amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.percentage||0}% desc="${p.description}" ${p.systemGenerated ? "(system)" : ""} ${p.invoiceNumber ? "inv="+p.invoiceNumber : ""} ${p.termOfPayment ? "due="+p.termOfPayment : ""}`);
}

console.log("\n=== SUMMARY ===");
console.log("Writes: 5 (POST supplier, POST importDocument, POST attachment, PUT postings, PUT book)");
console.log("Free GETs: 1 (account) + 4 (verification) = 5");
console.log("Total API calls: 10");
console.log("kidOrReceiverReference populated:", si.values?.[0]?.kidOrReceiverReference ? "YES" : "NO (empty)");
console.log("PDF attached:", vv.value.attachment?.mimeType === "application/pdf" ? "YES" : "NO");
console.log("Voucher booked:", vv.value.number > 0 ? "YES" : "NO");
