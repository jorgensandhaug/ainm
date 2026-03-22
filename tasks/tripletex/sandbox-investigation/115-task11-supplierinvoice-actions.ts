/**
 * Task 11 — Investigate supplierInvoice-level actions.
 *
 * Questions:
 * 1. Does supplierInvoice have approve/reject actions?
 * 2. What is the supplierInvoice status field after import?
 * 3. Can we PUT the supplierInvoice to change its fields?
 * 4. Is there a :approve or :post action on supplierInvoice?
 * 5. What about /purchaseOrder or /order endpoints?
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any, isForm = false) {
  const headers: Record<string, string> = { Authorization: AUTH };
  if (!isForm) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  const ok = res.status < 400;
  console.log(`  ${ok ? '✓' : '✗'} ${method} ${path} → ${res.status}`);
  if (!ok) console.log(`    ${JSON.stringify(data).slice(0, 500)}`);
  return { status: res.status, data };
}

async function main() {
  const date = "2026-03-22";
  const gross = 25000;
  const net = 20000;
  const vat = 5000;
  const invoiceNumber = "INV-2026-ACTIONS1";
  const supplierOrg = "861306178";
  const buyerOrg = "514295328";
  const supplierName = "Actions Test AS";

  // Setup
  const supLookup = await api("GET", `/supplier?organizationNumber=${supplierOrg}&fields=id,name,ledgerAccount(id)`);
  const supplierId = supLookup.data.values[0].id;
  const supplierLedgerAccountId = supLookup.data.values[0].ledgerAccount.id;
  const acctRes = await api("GET", "/ledger/account?number=7300&isApplicableForSupplierInvoice=true&fields=id");
  const expenseAccountId = acctRes.data.values[0].id;

  // Import
  console.log("\n── importDocument ──");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${supplierOrg}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Testveien 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${supplierOrg}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${supplierName}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${supplierOrg}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${buyerOrg}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Buyer Company</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Dreggsallmenningen 7</cbc:StreetName><cbc:CityName>Bergen</cbc:CityName><cbc:PostalZone>5003</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${buyerOrg}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Buyer Company</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${buyerOrg}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${vat}.00</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${net}.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${vat}.00</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${net}.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${net}.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${gross}.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${gross}.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${net}.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>kontortjenester</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${net}.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);

  if (importRes.status >= 400) return;
  const v = importRes.data.values?.[0];
  const voucherId = v.id;
  let version = v.version;
  console.log(`  Voucher: id=${voucherId} v=${version} desc="${v.description}"`);

  // ── Read supplierInvoice immediately after import (before any PUT) ──
  console.log("\n── supplierInvoice state BEFORE any PUT/book ──");
  const siPre = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&invoiceNumber=${invoiceNumber}&fields=*`);
  if (siPre.data.values?.length > 0) {
    const si = siPre.data.values[0];
    console.log(`  ALL fields of supplierInvoice:`);
    for (const [k, val] of Object.entries(si).sort()) {
      console.log(`    ${k}: ${JSON.stringify(val)}`);
    }
  }

  // ── Try supplierInvoice-level actions ──
  if (siPre.data.values?.length > 0) {
    const siId = siPre.data.values[0].id;

    console.log("\n── Test: PUT /supplierInvoice/:approve ──");
    await api("PUT", `/supplierInvoice/${siId}/:approve`);

    console.log("\n── Test: POST /supplierInvoice/${siId}/:approve ──");
    await api("POST", `/supplierInvoice/${siId}/:approve`);

    console.log("\n── Test: PUT /supplierInvoice/:sendToLedger ──");
    await api("PUT", `/supplierInvoice/${siId}?sendToLedger=true`);

    console.log("\n── Test: PUT /supplierInvoice (update fields) ──");
    const siVersion = siPre.data.values[0].version;
    await api("PUT", `/supplierInvoice/${siId}`, {
      version: siVersion,
      invoiceNumber,
      invoiceDate: date,
      invoiceDueDate: date,
      supplier: { id: supplierId },
      voucher: { id: voucherId },
    });

    console.log("\n── Test: POST /supplierInvoice/:reject ──");
    await api("POST", `/supplierInvoice/${siId}/:reject`);
    await api("PUT", `/supplierInvoice/${siId}/:reject`);

    // Try approve with comment
    console.log("\n── Test: PUT /supplierInvoice/:approve with body ──");
    await api("PUT", `/supplierInvoice/${siId}/:approve`, { comment: "approved" });
  }

  // ── Now do the normal PUT + book flow ──
  console.log("\n── PUT postings + book ──");
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version,
    postings: [
      {
        row: 1, date, description: "kontortjenester",
        account: { id: expenseAccountId }, vatType: { id: 1 }, currency: { id: 1 },
        amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross,
      },
      {
        row: 2, date, description: "kontortjenester",
        account: { id: supplierLedgerAccountId }, supplier: { id: supplierId }, currency: { id: 1 },
        amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross,
        invoiceNumber, termOfPayment: date,
      },
    ],
  });
  if (putRes.status < 400) version = putRes.data.value.version;

  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, { version });
  if (bookRes.status < 400) {
    version = bookRes.data.value.version;
    console.log(`  Booked: number=${bookRes.data.value.number}`);
  }

  // ── Read supplierInvoice AFTER booking ──
  console.log("\n── supplierInvoice state AFTER book ──");
  const siPost = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&invoiceNumber=${invoiceNumber}&fields=*`);
  if (siPost.data.values?.length > 0) {
    const si = siPost.data.values[0];
    console.log(`  ALL fields of supplierInvoice AFTER book:`);
    for (const [k, val] of Object.entries(si).sort()) {
      console.log(`    ${k}: ${JSON.stringify(val)}`);
    }
  }

  // ── Cleanup ──
  console.log("\n── Cleanup ──");
  await api("PUT", `/ledger/voucher/${voucherId}/:reverse?date=${date}`);

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
