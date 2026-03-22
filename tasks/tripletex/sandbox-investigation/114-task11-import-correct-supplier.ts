/**
 * Task 11 — importDocument with fresh supplier (so org lookup matches),
 * then PUT postings (no description), then book.
 *
 * Also test: does the supplierInvoice entity get correct supplier linkage
 * when importDocument uses a supplier org number that already exists?
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
  const gross = 32650;
  const net = 26120;
  const vat = 6530;
  const invoiceNumber = "INV-2026-CORRSUP1";
  const promptDescription = "kontortjenester";
  const supplierName = "CorrSup Fresh AS";
  const supplierOrg = "861306178"; // valid mod11, likely fresh
  const buyerOrg = "514295328";

  // ── Step 1: Create supplier (so it exists for import matching) ──
  console.log("── Step 1: Create/lookup supplier ──");
  let supplierId: number, supplierLedgerAccountId: number;
  const supLookup = await api("GET", `/supplier?organizationNumber=${supplierOrg}&fields=id,name,ledgerAccount(id)`);
  if (supLookup.data.values?.length > 0) {
    supplierId = supLookup.data.values[0].id;
    supplierLedgerAccountId = supLookup.data.values[0].ledgerAccount.id;
    console.log(`  Existing supplier: id=${supplierId} name="${supLookup.data.values[0].name}"`);
  } else {
    const supRes = await api("POST", "/supplier", { name: supplierName, organizationNumber: supplierOrg });
    supplierId = supRes.data.value.id;
    supplierLedgerAccountId = supRes.data.value.ledgerAccount.id;
    console.log(`  Created supplier: id=${supplierId}`);
  }

  const acctRes = await api("GET", "/ledger/account?number=7300&isApplicableForSupplierInvoice=true&fields=id");
  const expenseAccountId = acctRes.data.values[0].id;

  // ── Step 2: importDocument ──
  console.log("\n── Step 2: importDocument ──");
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
    <cac:Item><cbc:Name>${promptDescription}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${net}.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);

  if (importRes.status >= 400) {
    console.log("FATAL: importDocument failed");
    return;
  }

  const v = importRes.data.values?.[0];
  const voucherId = v.id;
  let version = v.version;
  console.log(`  Voucher: id=${voucherId} v=${version} desc="${v.description}" number=${v.number}`);

  // ── Step 3: PUT postings (NO description field) ──
  console.log("\n── Step 3: PUT postings ──");
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version,
    postings: [
      {
        row: 1, date, description: promptDescription,
        account: { id: expenseAccountId }, vatType: { id: 1 }, currency: { id: 1 },
        amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross,
      },
      {
        row: 2, date, description: promptDescription,
        account: { id: supplierLedgerAccountId }, supplier: { id: supplierId }, currency: { id: 1 },
        amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross,
        invoiceNumber, termOfPayment: date,
      },
    ],
  });

  if (putRes.status < 400) {
    version = putRes.data.value.version;
    console.log(`  version=${version}`);
  } else {
    console.log("FATAL: PUT postings failed");
    return;
  }

  // ── Step 4: Book ──
  console.log("\n── Step 4: Book ──");
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, { version });
  if (bookRes.status < 400) {
    version = bookRes.data.value.version;
    console.log(`  Booked: number=${bookRes.data.value.number}`);
  }

  // ── Full readback ──
  console.log("\n═══════════════════════════════════");
  console.log("  FULL READBACK");
  console.log("═══════════════════════════════════");

  // supplierInvoice
  const siRes = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&invoiceNumber=${invoiceNumber}&fields=*,voucher(*,postings(*,account(*),vatType(*))),supplier(*)`);
  if (siRes.data.values?.length > 0) {
    const si = siRes.data.values[0];
    console.log(`\n  SupplierInvoice id=${si.id}:`);
    console.log(`    invoiceNumber: "${si.invoiceNumber}"`);
    console.log(`    invoiceDate: ${si.invoiceDate}`);
    console.log(`    invoiceDueDate: ${si.invoiceDueDate}`);
    console.log(`    amount: ${si.amount}`);
    console.log(`    amountCurrency: ${si.amountCurrency}`);
    console.log(`    amountExcludingVat: ${si.amountExcludingVat}`);
    console.log(`    outstandingAmount: ${si.outstandingAmount}`);
    console.log(`    supplier: id=${si.supplier?.id} name="${si.supplier?.name}" org="${si.supplier?.organizationNumber}"`);
    console.log(`    voucher: id=${si.voucher?.id} number=${si.voucher?.number}`);
    console.log(`    voucher.description: "${si.voucher?.description}"`);
    for (const p of si.voucher?.postings || []) {
      console.log(`    row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}/${p.vatType?.name}`);
    }
  } else {
    console.log("  NO supplierInvoice found!");
  }

  // voucher
  const vRead = await api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*,account(*),vatType(*),supplier(*))`);
  if (vRead.status < 400) {
    const rv = vRead.data.value;
    console.log(`\n  Voucher: desc="${rv.description}" number=${rv.number}`);
    for (const p of rv.postings || []) {
      console.log(`    row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}/${p.vatType?.name} supp=${p.supplier?.id||'-'} inv=${p.invoiceNumber||'-'}`);
    }
  }

  // ── Cleanup ──
  console.log("\n── Cleanup ──");
  await api("PUT", `/ledger/voucher/${voucherId}/:reverse?date=${date}`);

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
