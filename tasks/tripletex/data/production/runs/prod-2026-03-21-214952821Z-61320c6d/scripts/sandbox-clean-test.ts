// Clean end-to-end test mimicking the production flow for Fjelltopp AS
// Using the real org number 804872205 from the PDF
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const ORG = "804872205";
const uniqueId = Date.now().toString().slice(-6);
const SUPPLIER_NAME = `Fjelltopp-Test-${uniqueId} AS`;
const INV_ID = `INV-TEST-${uniqueId}`;

async function apiJson(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH } };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log("ERROR:", JSON.stringify(json).slice(0, 500));
  return { ok: r.ok, data: json };
}

async function main() {
  // Count suppliers BEFORE
  console.log("=== BEFORE: suppliers with org 804872205 ===");
  const before = await apiJson("GET", `/supplier?organizationNumber=${ORG}&fields=id,name,organizationNumber`);
  console.log(`Count: ${before.data.fullResultSize}`);
  for (const s of (before.data.values || [])) {
    console.log(`  id=${s.id} name="${s.name}"`);
  }
  const beforeCount = before.data.fullResultSize;

  // Step 1: Create supplier with address + bank (mimicking the PDF)
  console.log("\n=== Step 1: Create supplier ===");
  const create = await apiJson("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: ORG,
    postalAddress: { addressLine1: "Solveien 92", postalCode: "8006", city: "Bodø" },
    bankAccountPresentation: [{ bban: "53239317029" }]
  });
  const supplierId = create.data.value?.id;
  const supplierLedgerAccountId = create.data.value?.ledgerAccount?.id;
  console.log(`  id=${supplierId} ledgerAccount=${supplierLedgerAccountId}`);

  // Step 2: Resolve account
  console.log("\n=== Step 2: Resolve account 6300 ===");
  const acct = await apiJson("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=id");
  const acctId = acct.data.values?.[0]?.id;
  console.log(`  accountId=${acctId}`);

  // Step 3: Import EHF
  console.log("\n=== Step 3: Import EHF ===");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INV_ID}</cbc:ID>
  <cbc:IssueDate>2026-06-10</cbc:IssueDate>
  <cbc:DueDate>2026-07-10</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG}</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Solveien 92</cbc:StreetName>
        <cbc:CityName>Bodø</cbc:CityName>
        <cbc:PostalZone>8006</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${ORG}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Ditt firma</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">12100.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">48400.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">12100.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">48400.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">48400.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">60500.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">60500.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">48400.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Nettverkstjenester</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">48400.00</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
  const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData
  });
  const importData = await importRes.json();
  console.log(`POST /ledger/voucher/importDocument → ${importRes.status}`);
  if (!importRes.ok) {
    console.log("ERROR:", JSON.stringify(importData).slice(0, 500));
    return;
  }
  const voucherId = importData.values[0].id;
  let version = importData.values[0].version;
  console.log(`  voucherId=${voucherId} version=${version}`);

  // Check for duplicate suppliers AFTER import
  console.log("\n=== AFTER IMPORT: suppliers with org 804872205 ===");
  const afterImport = await apiJson("GET", `/supplier?organizationNumber=${ORG}&fields=id,name,organizationNumber`);
  console.log(`Count: ${afterImport.data.fullResultSize} (before: ${beforeCount})`);
  for (const s of (afterImport.data.values || [])) {
    console.log(`  id=${s.id} name="${s.name}"`);
  }

  // Check which supplier the supplierInvoice is linked to BEFORE postings
  console.log("\n=== supplierInvoice BEFORE postings ===");
  const siBefore = await apiJson("GET", `/supplierInvoice?invoiceDateFrom=2026-06-01&invoiceDateTo=2026-07-31&voucherId=${voucherId}&fields=id,invoiceNumber,supplier(id,name),amount`);
  if (siBefore.data.values?.length > 0) {
    const si = siBefore.data.values[0];
    console.log(`  supplier.id=${si.supplier?.id} supplier.name="${si.supplier?.name}"`);
    if (si.supplier?.id === supplierId) {
      console.log(`  ** Linked to OUR supplier **`);
    } else {
      console.log(`  ** Linked to DIFFERENT supplier (not ${supplierId}) **`);
    }
  }

  // Step 4: PUT postings
  console.log("\n=== Step 4: PUT postings ===");
  const put = await apiJson("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version,
    postings: [
      { row: 1, account: { id: acctId }, description: "Nettverkstjenester", vatType: { id: 1 }, amount: 48400, amountCurrency: 48400, amountGross: 60500, amountGrossCurrency: 60500 },
      { row: 2, account: { id: supplierLedgerAccountId }, supplier: { id: supplierId }, description: "Nettverkstjenester", amount: -60500, amountCurrency: -60500, amountGross: -60500, amountGrossCurrency: -60500, invoiceNumber: INV_ID, termOfPayment: "2026-07-10" }
    ]
  });
  version = put.data.value?.version;
  console.log(`  version=${version}`);

  // Step 5: Book
  console.log("\n=== Step 5: Book ===");
  const book = await apiJson("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, { version });
  console.log(`  number=${book.data.value?.number} version=${book.data.value?.version}`);

  // Check supplierInvoice AFTER postings + booking
  console.log("\n=== supplierInvoice AFTER booking ===");
  const siAfter = await apiJson("GET", `/supplierInvoice?invoiceDateFrom=2026-06-01&invoiceDateTo=2026-07-31&voucherId=${voucherId}&fields=*,supplier(id,name,organizationNumber,postalAddress(*),bankAccountPresentation(*))`);
  if (siAfter.data.values?.length > 0) {
    const si = siAfter.data.values[0];
    console.log(`  invoiceNumber: ${si.invoiceNumber}`);
    console.log(`  invoiceDate: ${si.invoiceDate}`);
    console.log(`  invoiceDueDate: ${si.invoiceDueDate}`);
    console.log(`  amount: ${si.amount}`);
    console.log(`  amountExcludingVat: ${si.amountExcludingVat}`);
    console.log(`  outstandingAmount: ${si.outstandingAmount}`);
    console.log(`  kidOrReceiverReference: "${si.kidOrReceiverReference}"`);
    console.log(`  supplier.id: ${si.supplier?.id}`);
    console.log(`  supplier.name: ${si.supplier?.name}`);
    console.log(`  supplier.organizationNumber: ${si.supplier?.organizationNumber}`);
    console.log(`  supplier.postalAddress.addressLine1: ${si.supplier?.postalAddress?.addressLine1 || '(empty)'}`);
    console.log(`  supplier.postalAddress.postalCode: ${si.supplier?.postalAddress?.postalCode || '(empty)'}`);
    console.log(`  supplier.postalAddress.city: ${si.supplier?.postalAddress?.city || '(empty)'}`);
    console.log(`  supplier.bank: ${JSON.stringify(si.supplier?.bankAccountPresentation?.map((b: any) => b.bban) || [])}`);

    if (si.supplier?.id === supplierId) {
      console.log(`\n  *** LINKED TO OUR SUPPLIER (${supplierId}) ***`);
    } else {
      console.log(`\n  *** LINKED TO DIFFERENT SUPPLIER ${si.supplier?.id} (ours was ${supplierId}) ***`);
    }

    // Check ALL fields on the supplierInvoice that might be scored
    console.log("\n=== ALL supplierInvoice fields ===");
    for (const [key, value] of Object.entries(si)) {
      if (key !== 'supplier' && key !== 'voucher' && key !== 'orderLines' && key !== 'approvalListElements' && key !== 'payments') {
        console.log(`  ${key}: ${JSON.stringify(value)}`);
      }
    }
  }

  // Final supplier count
  console.log("\n=== FINAL: suppliers with org 804872205 ===");
  const final = await apiJson("GET", `/supplier?organizationNumber=${ORG}&fields=id,name`);
  console.log(`Count: ${final.data.fullResultSize} (was ${beforeCount} before, ${afterImport.data.fullResultSize} after import)`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
