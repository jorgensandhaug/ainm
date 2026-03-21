// Investigate task 11 - Part 12:
// Test a COMPLETELY DIFFERENT approach: POST /supplierInvoice/:addRecipient + approve workflow
// Also test: what if we use POST /ledger/voucher with voucherType=Leverandørfaktura
// and then try to CREATE a supplierInvoice linking to that voucher?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const ts = Date.now();
const DATE = "2026-03-21";
const GROSS = 42100;
const NET = 33680;
const VAT_AMT = 8420;
const ORG_NR = "976098897";
const SUPPLIER_NAME = `Test12 ${ts}`;
const INVOICE_NR = `INV-T12-${ts}`;
const DESCRIPTION = "kontortjenester";

// ============================================================
// Step 1: Create supplier
// ============================================================
console.log("=== Step 1: POST /supplier ===");
const supRes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: SUPPLIER_NAME, organizationNumber: ORG_NR }),
});
const supData = await supRes.json();
const supId = supData.value.id;
const supLedger = supData.value.ledgerAccount.id;
console.log("Supplier:", supId, "Ledger:", supLedger);

// ============================================================
// Step 2: GET account
// ============================================================
console.log("\n=== Step 2: GET /ledger/account ===");
const acctRes = await fetch(`${BASE}/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*`, { headers: H });
const acctData = await acctRes.json();
const expAcctId = acctData.values[0].id;
console.log("Account:", expAcctId);

// ============================================================
// Step 3: Try POST /supplierInvoice with JSON body directly
// ============================================================
console.log("\n=== Step 3: POST /supplierInvoice (JSON body) ===");

// First, let's check what endpoints are available for supplierInvoice
const endpoints = [
  "/supplierInvoice",
  "/supplierInvoice/:addRecipient",
];

// Try POST /supplierInvoice with multipart form (the documented way)
const siFormData = new FormData();
const siBody = {
  supplier: { id: supId },
  invoiceNumber: INVOICE_NR,
  invoiceDate: DATE,
  invoiceDueDate: DATE,
  amount: GROSS,
  amountCurrency: GROSS,
  currency: { id: 1 },
};
siFormData.append("body", new Blob([JSON.stringify(siBody)], { type: "application/json" }));
// Add a minimal "invoice" file
const dummyPdf = new Blob(["dummy invoice"], { type: "application/pdf" });
siFormData.append("file", dummyPdf, "invoice.pdf");

const siRes = await fetch(`${BASE}/supplierInvoice`, {
  method: "POST",
  headers: { Authorization: AUTH },
  body: siFormData,
});
console.log("Multipart POST /supplierInvoice status:", siRes.status);
const siText = await siRes.text();
console.log("Response:", siText.substring(0, 500));

// ============================================================
// Step 4: Try the "body" approach without file
// ============================================================
console.log("\n=== Step 4: POST /supplierInvoice (no file, just form body) ===");
const siFormData2 = new FormData();
siFormData2.append("body", new Blob([JSON.stringify(siBody)], { type: "application/json" }));

const siRes2 = await fetch(`${BASE}/supplierInvoice`, {
  method: "POST",
  headers: { Authorization: AUTH },
  body: siFormData2,
});
console.log("POST /supplierInvoice (no file) status:", siRes2.status);
const siText2 = await siRes2.text();
console.log("Response:", siText2.substring(0, 500));

// ============================================================
// Step 5: Check what APIs are available on supplierInvoice
// ============================================================
console.log("\n=== Step 5: Check API discovery ===");

// Check if the OpenAPI spec lists the supplierInvoice POST
const swaggerRes = await fetch(`${BASE}/../swagger.json`, { headers: H });
if (swaggerRes.ok) {
  const swagger = await swaggerRes.json();
  const siPaths = Object.keys(swagger.paths || {}).filter(p => p.includes('supplierInvoice'));
  console.log("SupplierInvoice paths:", siPaths);
} else {
  console.log("No swagger at ../swagger.json, status:", swaggerRes.status);
}

// Try /help endpoint
const helpRes = await fetch(`${BASE}/supplierInvoice/help`, { headers: H });
console.log("GET /supplierInvoice/help:", helpRes.status);

// ============================================================
// Step 6: Try PATCH on a supplierInvoice created by EHF
// to understand what fields the scorer might check
// ============================================================
console.log("\n=== Step 6: EHF import + check SI fields ===");

const sup2Name = `Test12b ${ts}`;
const sup2Res = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: sup2Name, organizationNumber: "810079468" }),
});
const sup2Data = await sup2Res.json();
const sup2Id = sup2Data.value.id;
const sup2Ledger = sup2Data.value.ledgerAccount.id;
console.log("Supplier2:", sup2Id);

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NR}-B</cbc:ID><cbc:IssueDate>${DATE}</cbc:IssueDate><cbc:DueDate>${DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cbc:EndpointID schemeID="0192">810079468</cbc:EndpointID><cac:PartyName><cbc:Name>${sup2Name}</cbc:Name></cac:PartyName><cac:PostalAddress><cbc:StreetName>G 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyTaxScheme><cbc:CompanyID>NO810079468MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme><cac:PartyLegalEntity><cbc:RegistrationName>${sup2Name}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">810079468</cbc:CompanyID></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID><cac:PartyName><cbc:Name>My Co</cbc:Name></cac:PartyName><cac:PostalAddress><cbc:StreetName>T 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyLegalEntity><cbc:RegistrationName>My Co</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${VAT_AMT}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${VAT_AMT}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="NOK">${NET}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="NOK">${GROSS}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="NOK">${GROSS}</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount><cac:Item><cbc:Name>${DESCRIPTION}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
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

if (!importRes.ok) {
  console.log("Import failed:", JSON.stringify(importData));
} else {
  const voucherId = importData.values[0].id;
  const vVersion = importData.values[0].version;
  console.log("Voucher:", voucherId);

  // Set postings + book
  const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
    method: "PUT", headers: H,
    body: JSON.stringify({
      version: vVersion,
      postings: [
        { row: 1, account: { id: expAcctId }, description: DESCRIPTION, vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
        { row: 2, account: { id: sup2Ledger }, supplier: { id: sup2Id }, description: DESCRIPTION, amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: `${INVOICE_NR}-B`, termOfPayment: DATE },
      ],
    }),
  });
  const putData = await putRes.json();
  console.log("PUT postings:", putRes.status);

  const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
    method: "PUT", headers: H,
    body: JSON.stringify({ version: putData.value.version }),
  });
  const bookData = await bookRes.json();
  console.log("Booked, number:", bookData.value?.number);

  // Now check the supplierInvoice
  console.log("\n--- SupplierInvoice state ---");
  const siCheckRes = await fetch(
    `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${voucherId}&fields=*,supplier(*),voucher(id,number,description),orderLines(*),payments(*)`,
    { headers: H }
  );
  const siCheckData = await siCheckRes.json();
  console.log("SI count:", siCheckData.fullResultSize);

  if (siCheckData.values?.length) {
    const si = siCheckData.values[0];
    console.log("\nSupplierInvoice fields:");
    console.log("  id:", si.id);
    console.log("  invoiceNumber:", si.invoiceNumber);
    console.log("  invoiceDate:", si.invoiceDate);
    console.log("  invoiceDueDate:", si.invoiceDueDate);
    console.log("  amount:", si.amount);
    console.log("  amountCurrency:", si.amountCurrency);
    console.log("  isCreditNote:", si.isCreditNote);
    console.log("  supplier:", si.supplier?.name, "id:", si.supplier?.id, "org:", si.supplier?.organizationNumber);
    console.log("  voucher:", si.voucher?.id, "number:", si.voucher?.number, "desc:", si.voucher?.description);
    console.log("  orderLines count:", si.orderLines?.length);
    console.log("  payments count:", si.payments?.length);
    console.log("  amountExcludingVat:", si.amountExcludingVat);
    console.log("  amountExcludingVatCurrency:", si.amountExcludingVatCurrency);
    console.log("  currency:", si.currency);

    // Check ALL fields by dumping the whole object
    console.log("\n--- Full SI JSON ---");
    console.log(JSON.stringify(si, null, 2));
  }

  // ALSO check: what does the voucher look like?
  console.log("\n--- Voucher state ---");
  const vRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=*,postings(*)`, { headers: H });
  const vData = await vRes.json();
  const v = vData.value;
  console.log("  number:", v?.number);
  console.log("  description:", v?.description);
  console.log("  vendorInvoiceNumber:", v?.vendorInvoiceNumber);
  console.log("  voucherType:", v?.voucherType?.id);
  console.log("  Postings:");
  for (const p of (v?.postings || [])) {
    console.log(`    row=${p.row} acct=${p.account?.id} amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id} sup=${p.supplier?.id} inv=${p.invoiceNumber} sysGen=${p.systemGenerated}`);
  }
}

// ============================================================
// Step 7: Try direct POST /ledger/voucher approach
// and check what state it creates
// ============================================================
console.log("\n\n=== Step 7: Direct POST /ledger/voucher ===");

// Get voucherType
const vtRes = await fetch(`${BASE}/ledger/voucherType?name=Leverandørfaktura&fields=*`, { headers: H });
const vtData = await vtRes.json();
const vtId = vtData.values[0].id;

const sup3Name = `Test12c ${ts}`;
const sup3Res = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: sup3Name, organizationNumber: "976098897" }),
});
const sup3Data = await sup3Res.json();
const sup3Id = sup3Data.value.id;
const sup3Ledger = sup3Data.value.ledgerAccount.id;

const vDirectRes = await fetch(`${BASE}/ledger/voucher`, {
  method: "POST", headers: H,
  body: JSON.stringify({
    date: DATE,
    description: DESCRIPTION,
    voucherType: { id: vtId },
    postings: [
      { row: 1, account: { id: expAcctId }, description: DESCRIPTION, vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, account: { id: sup3Ledger }, supplier: { id: sup3Id }, description: DESCRIPTION, amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: `${INVOICE_NR}-C`, termOfPayment: DATE },
    ],
  }),
});
const vDirectData = await vDirectRes.json();
console.log("Direct voucher status:", vDirectRes.status);

if (vDirectRes.ok) {
  const dv = vDirectData.value;
  console.log("  id:", dv.id, "number:", dv.number);
  console.log("  description:", dv.description);
  console.log("  vendorInvoiceNumber:", dv.vendorInvoiceNumber);

  // Check if supplierInvoice was created
  const siDirRes = await fetch(
    `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${dv.id}&fields=*`,
    { headers: H }
  );
  const siDirData = await siDirRes.json();
  console.log("  SI count for direct voucher:", siDirData.fullResultSize);

  // Check postings
  const vpRes = await fetch(`${BASE}/ledger/voucher/${dv.id}?fields=*,postings(*)`, { headers: H });
  const vpData = await vpRes.json();
  console.log("  Postings:");
  for (const p of (vpData.value?.postings || [])) {
    console.log(`    row=${p.row} acct=${p.account?.id} amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id} sup=${p.supplier?.id} inv=${p.invoiceNumber} sysGen=${p.systemGenerated}`);
  }

  // Key question: what does the scorer check?
  // Check if there's a way to SEARCH for the voucher by supplier/invoice number
  console.log("\n--- Search for voucher by supplier ---");
  const searchRes = await fetch(
    `${BASE}/ledger/voucher?supplierName=${encodeURIComponent(sup3Name)}&fields=*`,
    { headers: H }
  );
  console.log("Search by supplier:", searchRes.status);
  if (searchRes.ok) {
    const searchData = await searchRes.json();
    console.log("  count:", searchData.fullResultSize);
  } else {
    const searchText = await searchRes.text();
    console.log("  error:", searchText.substring(0, 200));
  }
}

// ============================================================
// Step 8: Check posting search
// ============================================================
console.log("\n\n=== Step 8: Search ledger postings ===");
// The scorer might check /ledger/posting to find the right postings
const postingRes = await fetch(
  `${BASE}/ledger/posting?dateFrom=${DATE}&dateTo=${DATE}&supplierId=${supId}&fields=*,account(*),supplier(*)&count=50`,
  { headers: H }
);
console.log("Search postings by supplier:", postingRes.status);
if (postingRes.ok) {
  const postingData = await postingRes.json();
  console.log("  count:", postingData.fullResultSize);
  for (const p of (postingData.values || []).slice(0, 5)) {
    console.log(`    id=${p.id} acct=${p.account?.number} amt=${p.amount} inv=${p.invoiceNumber} sup=${p.supplier?.id}`);
  }
}

// ============================================================
// Step 9: Check if there's a /purchaseOrder or /incomingInvoice endpoint
// ============================================================
console.log("\n\n=== Step 9: Check alternative endpoints ===");
const altEndpoints = [
  "/purchaseOrder",
  "/incomingInvoice",
  "/invoice/supplierInvoice",
  "/supplierInvoice/forApproval",
];
for (const ep of altEndpoints) {
  const res = await fetch(`${BASE}${ep}?count=1&fields=id`, { headers: H });
  console.log(`  GET ${ep}: ${res.status}`);
  if (res.ok) {
    const data = await res.json();
    console.log(`    count: ${data.fullResultSize}`);
  }
}
