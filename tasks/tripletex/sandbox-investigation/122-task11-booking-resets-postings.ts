/**
 * CRITICAL HYPOTHESIS: Does PUT /ledger/voucher/{id}?sendToLedger=true with just { version }
 * RESET the postings that were set in the previous PUT?
 *
 * Test: importDocument → PUT postings (sendToLedger=false) → verify postings →
 *       PUT book (sendToLedger=true) → verify postings again
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

function printPostings(label: string, postings: any[]) {
  console.log(`\n${label} (${postings.length} postings):`);
  for (const p of postings) {
    console.log(`  row=${p.row} acct=${p.account?.id} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id} supplier=${p.supplier?.id || '-'} invoiceNum=${p.invoiceNumber || '-'} desc="${p.description || '-'}" sysGen=${p.systemGenerated}`);
  }
}

async function main() {
  const date = "2026-03-22";
  const orgNumber = "823456786"; // valid mod11

  // Setup
  const sRes = await api("POST", "/supplier", { name: "BookingReset Test AS", organizationNumber: orgNumber });
  const supplierId = sRes.data.value.id;
  const supLedgerId = sRes.data.value.ledgerAccount.id;
  console.log(`Supplier: id=${supplierId}`);

  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;

  // importDocument
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>INV-RESET-001</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>BookingReset Test AS</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Test 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${orgNumber}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>BookingReset Test AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${orgNumber}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
    <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>S 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>My Company</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">2500.00</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">10000.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">2500.00</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="NOK">10000.00</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="NOK">10000.00</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="NOK">12500.00</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="NOK">12500.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">10000.00</cbc:LineExtensionAmount><cac:Item><cbc:Name>test</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="NOK">10000.00</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;

  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), "INV-RESET-001.xml");
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);
  if (!importRes.ok) { console.error("Import FAIL:", JSON.stringify(importRes.data).substring(0, 300)); return; }
  const voucherId = importRes.data.values[0].id;
  const version1 = importRes.data.values[0].version;
  console.log(`\nImported voucher: id=${voucherId}, version=${version1}`);

  // GET voucher BEFORE any PUT
  const vBefore = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  printPostings("AFTER IMPORT (before PUT)", vBefore.data.value?.postings || []);

  // PUT postings (sendToLedger=false)
  console.log("\n=== PUT postings (sendToLedger=false) ===");
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: version1,
    postings: [
      { row: 1, date, description: "test booking reset", account: { id: expAcctId }, vatType: { id: 1 }, amount: 10000, amountCurrency: 10000, amountGross: 12500, amountGrossCurrency: 12500 },
      { row: 2, date, description: "test booking reset", account: { id: supLedgerId }, supplier: { id: supplierId }, amount: -12500, amountCurrency: -12500, amountGross: -12500, amountGrossCurrency: -12500, invoiceNumber: "INV-RESET-001", termOfPayment: date },
    ],
  });
  if (!putRes.ok) { console.error("PUT FAIL:", JSON.stringify(putRes.data).substring(0, 300)); return; }
  const version2 = putRes.data.value.version;
  printPostings("AFTER PUT (sendToLedger=false)", putRes.data.value?.postings || []);

  // GET voucher after PUT but before booking
  const vAfterPut = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  console.log(`\nVoucher after PUT: number=${vAfterPut.data.value?.number} (0=unbooked)`);
  printPostings("GET readback AFTER PUT", vAfterPut.data.value?.postings || []);

  // NOW BOOK: PUT with just { version } and sendToLedger=true
  console.log("\n\n=== BOOKING: PUT (sendToLedger=true) with JUST { version } ===");
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: version2,
  });
  if (!bookRes.ok) { console.error("BOOK FAIL:", JSON.stringify(bookRes.data).substring(0, 300)); return; }
  console.log(`Booked: number=${bookRes.data.value?.number}`);
  printPostings("AFTER BOOKING (from response)", bookRes.data.value?.postings || []);

  // Final GET readback
  const vFinal = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  console.log(`\nFinal voucher: number=${vFinal.data.value?.number}`);
  printPostings("FINAL GET readback", vFinal.data.value?.postings || []);

  // Compare posting counts
  const postingsAfterPut = putRes.data.value?.postings?.length || 0;
  const postingsAfterBook = bookRes.data.value?.postings?.length || 0;
  const postingsFinal = vFinal.data.value?.postings?.length || 0;

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║ Postings after PUT:  ${postingsAfterPut}`);
  console.log(`║ Postings after BOOK: ${postingsAfterBook}`);
  console.log(`║ Postings final GET:  ${postingsFinal}`);
  console.log(`║ BOOKING RESET POSTINGS? ${postingsAfterPut !== postingsFinal ? 'YES!!!' : 'NO'}`);
  console.log(`╚══════════════════════════════════════════╝`);
}

main().catch(console.error);
