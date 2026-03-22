/**
 * Query supplierInvoice endpoint with correct required params.
 * Test if direct POST /ledger/voucher creates a supplierInvoice entity.
 * Also do importDocument with valid mod11 org for comparison.
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

  // Get account
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;

  // ====== METHOD A: Direct voucher ======
  console.log("=== METHOD A: Direct POST /ledger/voucher ===\n");
  const sA = await api("POST", "/supplier", { name: "SupInvQueryA AS", organizationNumber: "912345675" });
  const supIdA = sA.data.value.id;
  const supLedgerA = sA.data.value.ledgerAccount.id;

  const vA = await api("POST", "/ledger/voucher", {
    date, description: "test query A",
    voucherType: { name: "Leverandørfaktura" },
    postings: [
      { row: 1, date, description: "test query A", account: { id: expAcctId }, vatType: { id: 1 }, currency: { id: 1 }, amount: 10000, amountCurrency: 10000, amountGross: 12500, amountGrossCurrency: 12500 },
      { row: 2, date, description: "test query A", account: { id: supLedgerA }, supplier: { id: supIdA }, currency: { id: 1 }, amount: -12500, amountCurrency: -12500, amountGross: -12500, amountGrossCurrency: -12500, invoiceNumber: "INV-Q-A", termOfPayment: date },
    ],
  });
  const vIdA = vA.data.value.id;
  console.log(`Voucher A: id=${vIdA}, number=${vA.data.value.number}\n`);

  // ====== METHOD B: importDocument with valid mod11 org ======
  console.log("=== METHOD B: POST /ledger/voucher/importDocument ===\n");
  const sB = await api("POST", "/supplier", { name: "SupInvQueryB AS", organizationNumber: "874563218" });
  const supIdB = sB.data.value.id;
  const supLedgerB = sB.data.value.ledgerAccount.id;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>INV-Q-B</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">874563218</cbc:EndpointID>
      <cac:PartyName><cbc:Name>SupInvQueryB AS</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO874563218MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>SupInvQueryB AS</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">874563218</cbc:CompanyID>
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
      <cac:PartyLegalEntity><cbc:RegistrationName>My Company</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">2500</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">10000</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">2500</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
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
    <cac:Item><cbc:Name>test import</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">10000</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), "INV-Q-B.xml");
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);
  if (!importRes.ok) { console.error("Import FAIL:", JSON.stringify(importRes.data).substring(0, 500)); return; }
  const vIdB = importRes.data.values[0].id;
  const vVerB = importRes.data.values[0].version;
  console.log(`Voucher B: id=${vIdB}, version=${vVerB}`);

  // PUT postings (omit description to avoid immutable field error)
  const putB = await api("PUT", `/ledger/voucher/${vIdB}?sendToLedger=false`, {
    version: vVerB,
    postings: [
      { row: 1, account: { id: expAcctId }, vatType: { id: 1 }, amount: 10000, amountCurrency: 10000, amountGross: 12500, amountGrossCurrency: 12500 },
      { row: 2, account: { id: supLedgerB }, supplier: { id: supIdB }, amount: -12500, amountCurrency: -12500, amountGross: -12500, amountGrossCurrency: -12500, invoiceNumber: "INV-Q-B", termOfPayment: date },
    ],
  });
  if (!putB.ok) { console.error("PUT B FAIL:", JSON.stringify(putB.data).substring(0, 500)); return; }
  const bookB = await api("PUT", `/ledger/voucher/${vIdB}?sendToLedger=true`, { version: putB.data.value.version });
  if (!bookB.ok) { console.error("Book B FAIL:", JSON.stringify(bookB.data).substring(0, 500)); return; }
  console.log(`Voucher B booked: number=${bookB.data.value.number}\n`);

  // ====== QUERY SUPPLIER INVOICES ======
  console.log("╔══════════════════════════════════════════╗");
  console.log("║     QUERY supplierInvoice endpoint       ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const siAll = await api("GET", `/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
  console.log(`GET /supplierInvoice (2026 full year): status=${siAll.status}, count=${siAll.ok ? siAll.data.count : 'N/A'}`);

  if (siAll.ok && siAll.data.values) {
    for (const si of siAll.data.values) {
      console.log(`\n  supplierInvoice id=${si.id}`);
      console.log(`    invoiceNumber: ${si.invoiceNumber}`);
      console.log(`    amount: ${si.amount}`);
      console.log(`    amountCurrency: ${si.amountCurrency}`);
      console.log(`    voucher.id: ${si.voucher?.id}`);
      console.log(`    supplier.id: ${si.supplier?.id}`);
      console.log(`    invoiceDate: ${si.invoiceDate}`);
      console.log(`    dueDate: ${si.dueDate}`);
      console.log(`    description: ${si.description}`);
      console.log(`    currency: ${si.currency?.id}`);
      console.log(`    isCreditNote: ${si.isCreditNote}`);
      console.log(`    isApproved: ${si.isApproved}`);
      // Log all fields
      const allKeys = Object.keys(si);
      const importantKeys = allKeys.filter(k => si[k] !== null && si[k] !== undefined && si[k] !== 0 && si[k] !== false && si[k] !== '');
      console.log(`    non-null fields: ${importantKeys.join(', ')}`);
    }
  }

  console.log("\n\n=== Direct voucher A (id=${vIdA}) creates supplierInvoice? ===");
  const found = siAll.ok && siAll.data.values?.some((si: any) => si.voucher?.id === vIdA);
  console.log(`Answer: ${found ? 'YES' : 'NO'}`);

  console.log(`\n=== importDocument B (id=${vIdB}) creates supplierInvoice? ===`);
  const foundB = siAll.ok && siAll.data.values?.some((si: any) => si.voucher?.id === vIdB);
  console.log(`Answer: ${foundB ? 'YES' : 'NO'}`);

  console.log("\n=== DONE ===");
}

main().catch(console.error);
