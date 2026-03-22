/**
 * Test if the `description` field on importDocument form affects the resulting state.
 * The best-scoring run (4/8) included form.append("description", `import-${invoiceNumber}`).
 * All failing runs (0/8) did NOT include this field.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any, isFormData = false) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (body && !isFormData) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method, headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

function makeXml(invoiceId: string, orgNumber: string, supplierName: string, net: number, gross: number, date: string) {
  const vat = gross - net;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceId}</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Test 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${orgNumber}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${supplierName}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${orgNumber}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
    <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>S 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>My Company</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${vat}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${net}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${vat}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="NOK">${net}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="NOK">${gross}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="NOK">${gross}</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount><cac:Item><cbc:Name>test item</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="NOK">${net}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;
}

async function main() {
  const date = "2026-03-22";

  // --- Test A: WITHOUT description field ---
  console.log("=== Test A: WITHOUT description form field ===");
  const xmlA = makeXml("INV-NODESC-1", "823456786", "NoDesc Test AS", 10000, 12500, date);
  const formA = new FormData();
  formA.append("file", new Blob([xmlA], { type: "application/xml" }), "INV-NODESC-1.xml");
  // NO description field
  const importA = await api("POST", "/ledger/voucher/importDocument", formA, true);
  if (!importA.ok) { console.error("A FAIL:", importA.data); return; }
  const vIdA = importA.data.values[0].id;
  console.log(`  Voucher A: id=${vIdA}`);

  // --- Test B: WITH description field (like best-scoring run) ---
  console.log("\n=== Test B: WITH description form field ===");
  const xmlB = makeXml("INV-DESC-1", "874563218", "WithDesc Test AS", 10000, 12500, date);
  const formB = new FormData();
  formB.append("description", "import-INV-DESC-1"); // THIS IS THE KEY DIFFERENCE
  formB.append("file", new Blob([xmlB], { type: "application/xml" }), "INV-DESC-1.xml");
  const importB = await api("POST", "/ledger/voucher/importDocument", formB, true);
  if (!importB.ok) { console.error("B FAIL:", importB.data); return; }
  const vIdB = importB.data.values[0].id;
  console.log(`  Voucher B: id=${vIdB}`);

  // --- Compare voucher descriptions ---
  console.log("\n=== COMPARE VOUCHERS ===");
  const vA = await api("GET", `/ledger/voucher/${vIdA}?fields=id,number,description,date`);
  const vB = await api("GET", `/ledger/voucher/${vIdB}?fields=id,number,description,date`);
  console.log(`A (no desc):  desc="${vA.data.value?.description}"`);
  console.log(`B (with desc): desc="${vB.data.value?.description}"`);

  // --- Compare supplierInvoices ---
  console.log("\n=== COMPARE SUPPLIER INVOICES ===");
  const siAll = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&fields=*,orderLines(*)`);
  if (siAll.ok) {
    const siA = siAll.data.values.find((si: any) => si.voucher?.id === vIdA);
    const siB = siAll.data.values.find((si: any) => si.voucher?.id === vIdB);

    if (siA) {
      console.log(`\nA (no desc) supplierInvoice:`);
      console.log(`  id=${siA.id} invoiceNumber="${siA.invoiceNumber}" amount=${siA.amount}`);
      console.log(`  supplier.id=${siA.supplier?.id}`);
      console.log(`  FULL:`, JSON.stringify(siA, null, 2));
    } else {
      console.log(`A (no desc): NO supplierInvoice found!`);
    }

    if (siB) {
      console.log(`\nB (with desc) supplierInvoice:`);
      console.log(`  id=${siB.id} invoiceNumber="${siB.invoiceNumber}" amount=${siB.amount}`);
      console.log(`  supplier.id=${siB.supplier?.id}`);
      console.log(`  FULL:`, JSON.stringify(siB, null, 2));
    } else {
      console.log(`B (with desc): NO supplierInvoice found!`);
    }
  }
}

main().catch(console.error);
