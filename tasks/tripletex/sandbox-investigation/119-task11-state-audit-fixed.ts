/**
 * Task 11 state audit - FIXED queries.
 * Create via direct POST /ledger/voucher, then query supplierInvoice with required date params.
 * Also create via importDocument to compare.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any, isFormData = false) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (body && !isFormData) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const date = "2026-03-22";

  // ====== METHOD A: Direct POST /ledger/voucher ======
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  METHOD A: Direct POST /ledger/voucher   ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const sA = await api("POST", "/supplier", {
    name: "DirectVoucher Test AS",
    organizationNumber: "999888779",
  });
  const supIdA = sA.data.value.id;
  const supLedgerA = sA.data.value.ledgerAccount.id;

  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;

  const vA = await api("POST", "/ledger/voucher", {
    date,
    description: "test direct voucher",
    voucherType: { name: "Leverandørfaktura" },
    postings: [
      { row: 1, date, description: "test direct voucher", account: { id: expAcctId }, vatType: { id: 1 }, currency: { id: 1 }, amount: 10000, amountCurrency: 10000, amountGross: 12500, amountGrossCurrency: 12500 },
      { row: 2, date, description: "test direct voucher", account: { id: supLedgerA }, supplier: { id: supIdA }, currency: { id: 1 }, amount: -12500, amountCurrency: -12500, amountGross: -12500, amountGrossCurrency: -12500, invoiceNumber: "INV-A-001", termOfPayment: date },
    ],
  });
  const vIdA = vA.data.value.id;
  console.log(`Voucher A: id=${vIdA}, number=${vA.data.value.number}`);

  // ====== METHOD B: importDocument ======
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║  METHOD B: POST /ledger/voucher/importDocument ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const sB = await api("POST", "/supplier", {
    name: "ImportDoc Test AS",
    organizationNumber: "999888787",
  });
  const supIdB = sB.data.value.id;
  const supLedgerB = sB.data.value.ledgerAccount.id;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>INV-B-001</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999888787</cbc:EndpointID>
      <cac:PartyName><cbc:Name>ImportDoc Test AS</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO999888787MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>ImportDoc Test AS</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999888787</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
      <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Storgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>My Company</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">2500</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">10000</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">2500</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">10000</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">10000</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">12500</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">12500</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">10000</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>test import doc</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">10000</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), "INV-B-001.xml");
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);
  if (!importRes.ok) { console.error("Import FAIL:", importRes.data); return; }
  const vIdB = importRes.data.values[0].id;
  console.log(`Voucher B: id=${vIdB}`);

  // Book voucher B
  const putRes = await api("PUT", `/ledger/voucher/${vIdB}?sendToLedger=false`, {
    version: importRes.data.values[0].version,
    postings: [
      { row: 1, account: { id: expAcctId }, description: "test import doc", vatType: { id: 1 }, amount: 10000, amountCurrency: 10000, amountGross: 12500, amountGrossCurrency: 12500 },
      { row: 2, account: { id: supLedgerB }, supplier: { id: supIdB }, description: "test import doc", amount: -12500, amountCurrency: -12500, amountGross: -12500, amountGrossCurrency: -12500, invoiceNumber: "INV-B-001", termOfPayment: date },
    ],
  });
  const bookRes = await api("PUT", `/ledger/voucher/${vIdB}?sendToLedger=true`, {
    version: putRes.data.value.version,
  });
  console.log(`Voucher B booked: number=${bookRes.data.value.number}`);

  // ====== NOW COMPARE STATES ======
  console.log("\n\n╔══════════════════════════════════════════╗");
  console.log("║     COMPARING supplierInvoice STATES     ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // Query supplierInvoice with required date params
  const siAll = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=${date}&fields=*`);
  console.log(`GET /supplierInvoice (date range): status=${siAll.status}, count=${siAll.data.count}`);

  if (siAll.ok && siAll.data.values) {
    for (const si of siAll.data.values) {
      console.log(`\n--- SupplierInvoice id=${si.id} ---`);
      console.log(JSON.stringify(si, null, 2));
    }
  }

  // Also try query with just voucherId but with date params
  console.log(`\n--- GET /supplierInvoice for voucher A (direct) ---`);
  const siA = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=${date}&voucherId=${vIdA}&fields=*`);
  console.log(`Status: ${siA.status}, count=${siA.ok ? siA.data.count : 'error'}`);
  if (siA.ok) {
    console.log("Values:", JSON.stringify(siA.data.values, null, 2));
  }

  console.log(`\n--- GET /supplierInvoice for voucher B (import) ---`);
  const siB = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=${date}&voucherId=${vIdB}&fields=*`);
  console.log(`Status: ${siB.status}, count=${siB.ok ? siB.data.count : 'error'}`);
  if (siB.ok) {
    console.log("Values:", JSON.stringify(siB.data.values, null, 2));
  }

  // Compare voucher readback
  console.log("\n\n╔══════════════════════════════════════════╗");
  console.log("║     COMPARING voucher readback           ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const vReadA = await api("GET", `/ledger/voucher/${vIdA}?fields=*`);
  const vReadB = await api("GET", `/ledger/voucher/${vIdB}?fields=*`);

  console.log("Voucher A (direct):", JSON.stringify({
    id: vReadA.data.value.id,
    number: vReadA.data.value.number,
    description: vReadA.data.value.description,
    voucherType: vReadA.data.value.voucherType,
    tempNumber: vReadA.data.value.tempNumber,
    document: vReadA.data.value.document,
    ediDocument: vReadA.data.value.ediDocument,
  }, null, 2));

  console.log("\nVoucher B (import):", JSON.stringify({
    id: vReadB.data.value.id,
    number: vReadB.data.value.number,
    description: vReadB.data.value.description,
    voucherType: vReadB.data.value.voucherType,
    tempNumber: vReadB.data.value.tempNumber,
    document: vReadB.data.value.document,
    ediDocument: vReadB.data.value.ediDocument,
  }, null, 2));

  console.log("\n=== DONE ===");
}

main().catch(console.error);
