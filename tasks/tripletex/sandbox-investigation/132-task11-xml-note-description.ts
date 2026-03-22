/**
 * Test if EHF XML fields can control the resulting voucher description.
 * Try: <cbc:Note>, different <cbc:Name>, and different filename.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any, isFormData = false) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (body && !isFormData) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: isFormData ? body : body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

function makeXml(invoiceId: string, orgNumber: string, supplierName: string, net: number, gross: number, date: string, note?: string) {
  const vat = gross - net;
  const noteEl = note ? `<cbc:Note>${note}</cbc:Note>` : '';
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
  ${noteEl}
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
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount><cac:Item><cbc:Name>kontortjenester</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="NOK">${net}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;
}

async function main() {
  const date = "2026-03-22";

  // Test A: With <cbc:Note> containing the description
  console.log("=== Test A: XML with <cbc:Note>kontortjenester</cbc:Note> ===");
  const xmlA = makeXml("INV-NOTE-1", "823456786", "NoteTest AS", 10000, 12500, date, "kontortjenester");
  const formA = new FormData();
  formA.append("file", new Blob([xmlA], { type: "application/xml" }), "INV-NOTE-1.xml");
  const impA = await api("POST", "/ledger/voucher/importDocument", formA, true);
  if (!impA.ok) { console.error("A FAIL:", impA.data); return; }
  const vIdA = impA.data.values[0].id;
  const vA = await api("GET", `/ledger/voucher/${vIdA}?fields=id,number,description,date`);
  console.log(`  A voucher desc: "${vA.data.value?.description}"`);

  // Test B: With description form field set to "kontortjenester" (not import-prefix)
  console.log("\n=== Test B: description form field = 'kontortjenester' ===");
  const xmlB = makeXml("INV-FDESC-1", "823456786", "FormDescTest AS", 10000, 12500, date);
  const formB = new FormData();
  formB.append("description", "kontortjenester");
  formB.append("file", new Blob([xmlB], { type: "application/xml" }), "INV-FDESC-1.xml");
  const impB = await api("POST", "/ledger/voucher/importDocument", formB, true);
  if (!impB.ok) { console.error("B FAIL:", impB.data); return; }
  const vIdB = impB.data.values[0].id;
  const vB = await api("GET", `/ledger/voucher/${vIdB}?fields=id,number,description,date`);
  console.log(`  B voucher desc: "${vB.data.value?.description}"`);

  // Test C: Different filename (kontortjenester.xml)
  console.log("\n=== Test C: filename = 'kontortjenester.xml' ===");
  const xmlC = makeXml("INV-FNAME-1", "823456786", "FilenameTest AS", 10000, 12500, date);
  const formC = new FormData();
  formC.append("file", new Blob([xmlC], { type: "application/xml" }), "kontortjenester.xml");
  const impC = await api("POST", "/ledger/voucher/importDocument", formC, true);
  if (!impC.ok) { console.error("C FAIL:", impC.data); return; }
  const vIdC = impC.data.values[0].id;
  const vC = await api("GET", `/ledger/voucher/${vIdC}?fields=id,number,description,date`);
  console.log(`  C voucher desc: "${vC.data.value?.description}"`);

  // Test D: Both Note AND description form field
  console.log("\n=== Test D: XML Note + description form field ===");
  const xmlD = makeXml("INV-BOTH-1", "823456786", "BothTest AS", 10000, 12500, date, "kontortjenester");
  const formD = new FormData();
  formD.append("description", "kontortjenester");
  formD.append("file", new Blob([xmlD], { type: "application/xml" }), "kontortjenester.xml");
  const impD = await api("POST", "/ledger/voucher/importDocument", formD, true);
  if (!impD.ok) { console.error("D FAIL:", impD.data); return; }
  const vIdD = impD.data.values[0].id;
  const vD = await api("GET", `/ledger/voucher/${vIdD}?fields=id,number,description,date`);
  console.log(`  D voucher desc: "${vD.data.value?.description}"`);

  // Summary
  console.log("\n=== SUMMARY ===");
  console.log(`A (XML Note):      "${vA.data.value?.description}"`);
  console.log(`B (form desc):     "${vB.data.value?.description}"`);
  console.log(`C (filename):      "${vC.data.value?.description}"`);
  console.log(`D (Note+form+fn):  "${vD.data.value?.description}"`);
}

main().catch(console.error);
