// Test whether importDocument creates a duplicate supplier when one already exists with the same org number
// Using a fresh org number that passes mod11 validation
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const uniqueSuffix = Date.now().toString().slice(-8);
// Use org number 889157917 which we know passes mod11 (used in trusted standard proofs)
const ORG_NUMBER = "889157917";
const SUPPLIER_NAME = `DupTest-${uniqueSuffix} AS`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH } };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) { console.log("ERROR:", JSON.stringify(json).slice(0, 800)); }
  return { ok: r.ok, status: r.status, data: json };
}

function makeXml(orgNumber: string, supplierName: string, invoiceId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceId}</cbc:ID>
  <cbc:IssueDate>2026-03-21</cbc:IssueDate>
  <cbc:DueDate>2026-04-21</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Testgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
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
    <cbc:TaxAmount currencyID="NOK">5000.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">20000.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">5000.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">20000.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">20000.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">25000.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">25000.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">20000.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Testtjenester</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">20000.00</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

async function main() {
  console.log("=== STEP 1: Check existing suppliers with org number ===");
  const beforeRes = await api("GET", `/supplier?organizationNumber=${ORG_NUMBER}&fields=id,name,organizationNumber`);
  const beforeCount = beforeRes.data?.fullResultSize ?? 0;
  console.log("Suppliers BEFORE:", beforeCount);
  if (beforeRes.data?.values) {
    for (const s of beforeRes.data.values) {
      console.log(`  id=${s.id} name="${s.name}" org=${s.organizationNumber}`);
    }
  }

  console.log("\n=== STEP 2: Create supplier manually with address + bank ===");
  const supplierRes = await api("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: ORG_NUMBER,
    postalAddress: { addressLine1: "Testgata 99", postalCode: "0001", city: "Oslo" },
    bankAccountPresentation: [{ bban: "12345678903" }]
  });
  const supplierId = supplierRes.data?.value?.id;
  const supplierLedgerAccountId = supplierRes.data?.value?.ledgerAccount?.id;
  console.log("Created supplier:", supplierId, "ledgerAccount:", supplierLedgerAccountId);

  console.log("\n=== STEP 3: Check suppliers AFTER create, BEFORE import ===");
  const afterCreateRes = await api("GET", `/supplier?organizationNumber=${ORG_NUMBER}&fields=id,name,organizationNumber`);
  const afterCreateCount = afterCreateRes.data?.fullResultSize ?? 0;
  console.log("Suppliers after create:", afterCreateCount);
  for (const s of (afterCreateRes.data?.values || [])) {
    console.log(`  id=${s.id} name="${s.name}" org=${s.organizationNumber}`);
  }

  console.log("\n=== STEP 4: Import EHF XML with SAME org number ===");
  const invoiceId = `INV-DUP-TEST-${uniqueSuffix}`;
  const xml = makeXml(ORG_NUMBER, SUPPLIER_NAME, invoiceId);
  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
  const importRes = await api("POST", "/ledger/voucher/importDocument", formData);
  if (!importRes.ok) {
    console.log("Import failed! Cannot continue test.");
    return;
  }
  const voucherId = importRes.data.values[0].id;
  const voucherVersion = importRes.data.values[0].version;
  console.log("Imported voucher:", voucherId, "version:", voucherVersion);

  console.log("\n=== STEP 5: Check suppliers AFTER import ===");
  const afterImportRes = await api("GET", `/supplier?organizationNumber=${ORG_NUMBER}&fields=id,name,organizationNumber,postalAddress(*),bankAccountPresentation(*)`);
  const afterImportCount = afterImportRes.data?.fullResultSize ?? 0;
  console.log("Suppliers after import:", afterImportCount);
  for (const s of (afterImportRes.data?.values || [])) {
    console.log(`  id=${s.id} name="${s.name}" org=${s.organizationNumber}`);
    console.log(`    addr: ${s.postalAddress?.addressLine1 || '(empty)'}, ${s.postalAddress?.postalCode || ''} ${s.postalAddress?.city || ''}`);
    console.log(`    bank: ${JSON.stringify(s.bankAccountPresentation?.map((b: any) => b.bban) || [])}`);
  }

  if (afterImportCount > afterCreateCount) {
    console.log("\n*** DUPLICATE SUPPLIER DETECTED! importDocument created an extra supplier ***");
  } else {
    console.log("\n*** NO duplicate supplier. importDocument reused the existing one. ***");
  }

  console.log("\n=== STEP 6: Check supplierInvoice — which supplier is linked? ===");
  // Search by invoice number first
  const siRes = await api("GET", `/supplierInvoice?invoiceNumber=${invoiceId}&fields=*,supplier(id,name,organizationNumber,postalAddress(*),bankAccountPresentation(*))`);
  if (siRes.data?.values?.length > 0) {
    for (const si of siRes.data.values) {
      console.log(`\nMATCHING supplierInvoice id=${si.id}:`);
      console.log(`  invoiceNumber: ${si.invoiceNumber}`);
      console.log(`  voucher.id: ${si.voucher?.id}`);
      console.log(`  supplier.id: ${si.supplier?.id}`);
      console.log(`  supplier.name: ${si.supplier?.name}`);
      console.log(`  supplier.organizationNumber: ${si.supplier?.organizationNumber}`);
      console.log(`  supplier.postalAddress.addressLine1: ${si.supplier?.postalAddress?.addressLine1 || '(empty)'}`);
      console.log(`  supplier.bankAccountPresentation: ${JSON.stringify(si.supplier?.bankAccountPresentation?.map((b: any) => b.bban) || [])}`);
      console.log(`  amount: ${si.amount}`);
      console.log(`  outstandingAmount: ${si.outstandingAmount}`);

      if (si.supplier?.id !== supplierId) {
        console.log(`\n*** SUPPLIER MISMATCH! Invoice linked to supplier ${si.supplier?.id}, but we created ${supplierId} ***`);
        console.log(`*** importDocument linked the invoice to a DIFFERENT supplier (auto-created or pre-existing) ***`);
      } else {
        console.log(`\n*** Supplier matches our created one (${supplierId}). No mismatch. ***`);
      }
    }
  } else {
    console.log("No supplierInvoice found by invoice number. Trying broader search...");
    const siRes2 = await api("GET", `/supplierInvoice?count=5&sorting=id&sortDirection=desc&fields=id,invoiceNumber,voucher(id),supplier(id,name,organizationNumber)`);
    if (siRes2.data?.values) {
      for (const si of siRes2.data.values) {
        console.log(`  SI id=${si.id} inv=${si.invoiceNumber} voucher=${si.voucher?.id} supplier=${si.supplier?.id}/${si.supplier?.name}`);
      }
    }
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
