/**
 * Test if creating a supplier BEFORE importDocument auto-links the supplier
 * to the resulting supplierInvoice entity.
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

  // TEST A: Import WITHOUT any pre-existing supplier (use random org that doesn't exist)
  console.log("=== TEST A: Import WITHOUT pre-existing supplier ===");
  const xmlA = makeXml("INV-NOLINK-2", "823456786", "NoLink AS", 10000, 12500, date);
  const formA = new FormData();
  formA.append("file", new Blob([xmlA], { type: "application/xml" }), "INV-NOLINK-2.xml");
  const importA = await api("POST", "/ledger/voucher/importDocument", formA, true);
  if (!importA.ok) { console.error("A IMPORT FAIL:", importA.data); return; }
  const vIdA = importA.data.values[0].id;
  console.log(`  Voucher A: id=${vIdA}`);

  // Find supplierInvoice for A
  const siAllA = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&fields=*`);
  const siA = siAllA.data.values?.find((si: any) => si.voucher?.id === vIdA);
  console.log(`  A supplierInvoice: supplier=${JSON.stringify(siA?.supplier)}`);

  // TEST B: Create supplier FIRST, then import with matching orgNumber
  console.log("\n=== TEST B: Create supplier FIRST, then import with MATCHING org ===");
  const orgB = "845678901";
  const nameB = "AutoLink Test AS";
  const sResB = await api("POST", "/supplier", { name: nameB, organizationNumber: orgB });
  if (!sResB.ok) { console.error("B SUPPLIER FAIL:", sResB.data); return; }
  const supplierIdB = sResB.data.value.id;
  console.log(`  Created supplier: id=${supplierIdB}, org=${orgB}`);

  const xmlB = makeXml("INV-LINKED-2", orgB, nameB, 10000, 12500, date);
  const formB = new FormData();
  formB.append("file", new Blob([xmlB], { type: "application/xml" }), "INV-LINKED-2.xml");
  const importB = await api("POST", "/ledger/voucher/importDocument", formB, true);
  if (!importB.ok) { console.error("B IMPORT FAIL:", importB.data); return; }
  const vIdB = importB.data.values[0].id;
  console.log(`  Voucher B: id=${vIdB}`);

  // Find supplierInvoice for B
  const siAllB = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&fields=*`);
  const siB = siAllB.data.values?.find((si: any) => si.voucher?.id === vIdB);
  console.log(`  B supplierInvoice: supplier=${JSON.stringify(siB?.supplier)}`);

  // TEST C: Full flow (supplier first, import, PUT postings with supplier link)
  console.log("\n=== TEST C: Full flow with postings ===");
  const orgC = "856789012";
  const nameC = "FullFlow Test AS";
  const sResC = await api("POST", "/supplier", { name: nameC, organizationNumber: orgC });
  if (!sResC.ok) { console.error("C SUPPLIER FAIL:", sResC.data); return; }
  const supplierIdC = sResC.data.value.id;
  const supplierLedgerC = sResC.data.value.ledgerAccount.id;
  console.log(`  Created supplier: id=${supplierIdC}, org=${orgC}`);

  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;

  const xmlC = makeXml("INV-FULL-C2", orgC, nameC, 10000, 12500, date);
  const formC = new FormData();
  formC.append("file", new Blob([xmlC], { type: "application/xml" }), "INV-FULL-C2.xml");
  const importC = await api("POST", "/ledger/voucher/importDocument", formC, true);
  if (!importC.ok) { console.error("C IMPORT FAIL:", importC.data); return; }
  const vIdC = importC.data.values[0].id;
  const vVerC = importC.data.values[0].version;

  // PUT postings with supplier link on row 2
  const putC = await api("PUT", `/ledger/voucher/${vIdC}?sendToLedger=false`, {
    version: vVerC,
    postings: [
      { row: 1, date, description: "test service", account: { id: expAcctId }, vatType: { id: 1 }, amount: 10000, amountCurrency: 10000, amountGross: 12500, amountGrossCurrency: 12500 },
      { row: 2, date, description: "test service", account: { id: supplierLedgerC }, supplier: { id: supplierIdC }, amount: -12500, amountCurrency: -12500, amountGross: -12500, amountGrossCurrency: -12500, invoiceNumber: "INV-FULL-C2", termOfPayment: date },
    ],
  });
  if (!putC.ok) { console.error("C PUT FAIL:", putC.data); return; }

  // Check supplierInvoice for C AFTER postings
  const siAllC = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&fields=*`);
  const siC = siAllC.data.values?.find((si: any) => si.voucher?.id === vIdC);
  console.log(`  C supplierInvoice: supplier=${JSON.stringify(siC?.supplier)}`);

  // SUMMARY
  console.log("\n=== SUMMARY ===");
  console.log(`A (no supplier created):     supplier=${siA?.supplier ? `id=${siA.supplier.id}` : 'NULL'}`);
  console.log(`B (supplier created, match):  supplier=${siB?.supplier ? `id=${siB.supplier.id}` : 'NULL'}`);
  console.log(`C (full flow with postings): supplier=${siC?.supplier ? `id=${siC.supplier.id}` : 'NULL'}`);
}

main().catch(console.error);
