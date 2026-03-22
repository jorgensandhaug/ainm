/**
 * Task 11 COMPREHENSIVE FLOW:
 * 1. POST /supplier
 * 2. GET /ledger/account
 * 3. POST /ledger/voucher/importDocument (creates supplierInvoice)
 * 4. GET /supplierInvoice (find the entity)
 * 5. PUT /ledger/voucher/{id}?sendToLedger=false (set postings)
 * 6. PUT /supplierInvoice/{id}/:approve (approve it)
 * 7. PUT /ledger/voucher/{id}?sendToLedger=true (book it)
 * 8. AUDIT everything
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
  console.log(`${method} ${path.substring(0, 60)} → ${res.status}`);
  return { status: res.status, ok: res.ok, data };
}

function makeXml(invoiceId: string, orgNumber: string, supplierName: string, net: number, gross: number, date: string, dueDate: string, description: string) {
  const vat = gross - net;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceId}</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Storgata 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0155</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${orgNumber}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${supplierName}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${orgNumber}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
    <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>S 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>My Company</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${vat}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${net}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${vat}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="NOK">${net}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="NOK">${gross}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="NOK">${gross}</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount><cac:Item><cbc:Name>${description}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="NOK">${net}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;
}

async function main() {
  const date = "2026-03-22";
  const dueDate = "2026-04-21";
  const supplierName = "FullFlow Test AS";
  const orgNumber = "923456783";
  const invoiceNumber = "INV-FULL-001";
  const description = "konsulenttjenester";
  const gross = 12500;
  const net = 10000;

  // 1. POST /supplier
  const sRes = await api("POST", "/supplier", { name: supplierName, organizationNumber: orgNumber });
  if (!sRes.ok) { console.error("Supplier FAIL:", sRes.data); return; }
  const supplierId = sRes.data.value.id;
  const supLedgerId = sRes.data.value.ledgerAccount.id;
  console.log(`  Supplier: id=${supplierId}, ledgerAccount=${supLedgerId}`);

  // 2. GET /ledger/account
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;

  // 3. POST /ledger/voucher/importDocument
  const xml = makeXml(invoiceNumber, orgNumber, supplierName, net, gross, date, dueDate, description);
  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNumber}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);
  if (!importRes.ok) { console.error("Import FAIL:", JSON.stringify(importRes.data).substring(0, 500)); return; }
  const voucherId = importRes.data.values[0].id;
  const version1 = importRes.data.values[0].version;
  console.log(`  Voucher: id=${voucherId}, version=${version1}`);

  // 4. GET /supplierInvoice (find the entity)
  const siSearch = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&fields=*`);
  if (!siSearch.ok) { console.error("SI search FAIL:", siSearch.data); return; }
  const siMatch = siSearch.data.values.find((si: any) => si.voucher?.id === voucherId);
  if (!siMatch) { console.error("No supplierInvoice found for voucher", voucherId); return; }
  const siId = siMatch.id;
  console.log(`  SupplierInvoice: id=${siId}, invoiceNumber="${siMatch.invoiceNumber}", amount=${siMatch.amount}`);
  console.log(`  SI details: isApproved=${siMatch.isApproved}, outstandingAmount=${siMatch.outstandingAmount}`);
  console.log(`  SI all fields:`, JSON.stringify(siMatch, null, 2));

  // 5. PUT /ledger/voucher/{id}?sendToLedger=false (set postings)
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: version1,
    postings: [
      { row: 1, date, description, account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
      { row: 2, date, description, account: { id: supLedgerId }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross, invoiceNumber, termOfPayment: dueDate },
    ],
  });
  if (!putRes.ok) { console.error("PUT FAIL:", JSON.stringify(putRes.data).substring(0, 500)); return; }
  const version2 = putRes.data.value.version;

  // 6. TRY to approve the supplierInvoice
  console.log("\n=== APPROVE ===");
  const approveRes = await api("PUT", `/supplierInvoice/${siId}/:approve`, { invoiceId: siId, comment: "approved" });
  console.log(`  Approve result: status=${approveRes.status}, ok=${approveRes.ok}`);
  if (!approveRes.ok) {
    console.log(`  Approve error: ${JSON.stringify(approveRes.data).substring(0, 500)}`);
  }

  // Also try batch approve
  if (!approveRes.ok) {
    console.log("\n  Trying batch approve...");
    const batchApprove = await api("PUT", `/supplierInvoice/:approve`, { invoiceIds: [siId] });
    console.log(`  Batch approve: status=${batchApprove.status}, ok=${batchApprove.ok}`);
    if (!batchApprove.ok) {
      console.log(`  Batch error: ${JSON.stringify(batchApprove.data).substring(0, 500)}`);
    }
  }

  // 7. Book the voucher
  console.log("\n=== BOOK ===");
  // Re-fetch version since approve might have changed it
  const vRead = await api("GET", `/ledger/voucher/${voucherId}?fields=id,version`);
  const currentVersion = vRead.data.value.version;
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, { version: currentVersion });
  if (!bookRes.ok) { console.error("Book FAIL:", JSON.stringify(bookRes.data).substring(0, 500)); return; }
  console.log(`  Booked: number=${bookRes.data.value.number}`);

  // 8. FULL AUDIT
  console.log("\n\n" + "=".repeat(60));
  console.log("  FULL STATE AUDIT");
  console.log("=".repeat(60));

  // Re-read supplierInvoice after approval+booking
  const siAfter = await api("GET", `/supplierInvoice/${siId}?fields=*`);
  if (siAfter.ok) {
    const si = siAfter.data.value;
    console.log(`\nSupplierInvoice AFTER approval+booking:`);
    console.log(`  id=${si.id} invoiceNumber="${si.invoiceNumber}" amount=${si.amount}`);
    console.log(`  amountExcludingVat=${si.amountExcludingVat} amountCurrency=${si.amountCurrency}`);
    console.log(`  isApproved=${si.isApproved} outstandingAmount=${si.outstandingAmount}`);
    console.log(`  supplier.id=${si.supplier?.id} voucher.id=${si.voucher?.id}`);
    console.log(`  invoiceDate=${si.invoiceDate} dueDate=${si.dueDate}`);
    console.log(`  isCreditNote=${si.isCreditNote} currency=${si.currency?.id}`);
    console.log(`  paymentTypeId=${si.paymentTypeId} kid=${si.kid}`);
    console.log(`  FULL:`, JSON.stringify(si, null, 2));
  }

  // Re-read voucher
  const vAfter = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,description,date,postings(*)`);
  if (vAfter.ok) {
    const v = vAfter.data.value;
    console.log(`\nVoucher AFTER:`);
    console.log(`  id=${v.id} number=${v.number} desc="${v.description}"`);
    for (const p of (v.postings || [])) {
      console.log(`    row=${p.row} acct=${p.account?.id} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id} supplier=${p.supplier?.id||'-'} desc="${p.description}" invoiceNum=${p.invoiceNumber||'-'}`);
    }
  }

  // Check if changeDimension is available
  console.log("\n=== TRY changeDimension ===");
  const cdRes = await api("PUT", `/supplierInvoice/${siId}/:changeDimension`, {
    invoiceId: siId,
    account: { id: expAcctId },
  });
  console.log(`  changeDimension: status=${cdRes.status}, ok=${cdRes.ok}`);
  if (!cdRes.ok) {
    console.log(`  Error: ${JSON.stringify(cdRes.data).substring(0, 300)}`);
  }
}

main().catch(console.error);
