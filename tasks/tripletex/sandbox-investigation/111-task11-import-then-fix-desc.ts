/**
 * Task 11 — Test if we can:
 * 1. Import via EHF XML (creates supplierInvoice)
 * 2. PUT the voucher description to match the prompt
 * 3. Set correct postings
 * 4. Book the voucher
 *
 * Company org: 514295328 (NM i AI Beastmodegutta AS)
 * Supplier: fresh supplier with valid org number
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
  if (!ok) console.log(`    ${JSON.stringify(data).slice(0, 400)}`);
  return { status: res.status, data };
}

async function main() {
  const date = "2026-03-22";
  const gross = 50000;
  const net = 40000;
  const invoiceNumber = "INV-DESC-FIX-001";
  const promptDescription = "kontortjenester";
  const supplierName = "DescFix Test AS";
  const supplierOrg = "984527318"; // valid mod11
  const companyOrg = "514295328";
  const companyName = "NM i AI Beastmodegutta f675e571";

  // ── Setup ──
  const acctRes = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=id");
  const expenseAccountId = acctRes.data.values[0].id;

  // Get or create supplier
  let supplierId: number, supplierLedgerAccountId: number;
  const supLookup = await api("GET", `/supplier?organizationNumber=${supplierOrg}&fields=id,name,ledgerAccount(id)`);
  if (supLookup.data.values?.length > 0) {
    supplierId = supLookup.data.values[0].id;
    supplierLedgerAccountId = supLookup.data.values[0].ledgerAccount.id;
    console.log(`  Using existing supplier: ${supplierId}`);
  } else {
    const supRes = await api("POST", "/supplier", { name: supplierName, organizationNumber: supplierOrg });
    supplierId = supRes.data.value.id;
    supplierLedgerAccountId = supRes.data.value.ledgerAccount.id;
  }

  // ══════════════════════════════════════════
  // Step 1: importDocument (creates supplierInvoice)
  // ══════════════════════════════════════════
  console.log("\n══════════════════════════════════════════");
  console.log("  Step 1: importDocument (EHF XML)");
  console.log("══════════════════════════════════════════");

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
    <cbc:EndpointID schemeID="0192">${companyOrg}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>${companyName}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Dreggsallmenningen 7</cbc:StreetName><cbc:CityName>Bergen</cbc:CityName><cbc:PostalZone>5003</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${companyOrg}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${companyName}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${companyOrg}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">10000.00</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${net}.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">10000.00</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
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
  console.log(`  Voucher: id=${voucherId} version=${version} number=${v.number} desc="${v.description}"`);
  console.log(`  Auto-description: "${v.description}"`);
  console.log(`  Wanted description: "${promptDescription}"`);

  // ══════════════════════════════════════════
  // Step 2: Try to change voucher description via PUT
  // ══════════════════════════════════════════
  console.log("\n══════════════════════════════════════════");
  console.log("  Step 2: PUT to change description + set postings");
  console.log("══════════════════════════════════════════");

  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version,
    description: promptDescription,  // TRY TO CHANGE THE DESCRIPTION
    postings: [
      {
        row: 1, date, description: promptDescription,
        account: { id: expenseAccountId },
        vatType: { id: 1 },
        currency: { id: 1 },
        amount: net, amountCurrency: net,
        amountGross: gross, amountGrossCurrency: gross,
      },
      {
        row: 2, date, description: promptDescription,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        currency: { id: 1 },
        amount: -gross, amountCurrency: -gross,
        amountGross: -gross, amountGrossCurrency: -gross,
        invoiceNumber,
        termOfPayment: date,
      },
    ],
  });

  if (putRes.status < 400) {
    const pv = putRes.data.value;
    version = pv.version;
    console.log(`  After PUT: desc="${pv.description}" version=${version}`);
    console.log(`  Description changed: ${pv.description === promptDescription ? "YES ✓" : "NO ✗ (still: " + pv.description + ")"}`);
  }

  // ══════════════════════════════════════════
  // Step 3: Book the voucher
  // ══════════════════════════════════════════
  console.log("\n══════════════════════════════════════════");
  console.log("  Step 3: Book (sendToLedger=true)");
  console.log("══════════════════════════════════════════");

  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, { version });
  if (bookRes.status < 400) {
    const bv = bookRes.data.value;
    version = bv.version;
    console.log(`  Booked: number=${bv.number} desc="${bv.description}"`);
  }

  // ══════════════════════════════════════════
  // Verification: Full readback
  // ══════════════════════════════════════════
  console.log("\n══════════════════════════════════════════");
  console.log("  VERIFICATION: Full readback");
  console.log("══════════════════════════════════════════");

  // Read the supplierInvoice
  const siSearch = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&invoiceNumber=${invoiceNumber}&fields=*,voucher(*,postings(*,account(*),vatType(*))),supplier(*)&count=50`);
  if (siSearch.data.values?.length > 0) {
    const si = siSearch.data.values[0];
    console.log(`\n  SupplierInvoice:`);
    console.log(`    id: ${si.id}`);
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
    if (si.voucher?.postings) {
      console.log(`    postings (${si.voucher.postings.length}):`);
      for (const p of si.voucher.postings) {
        console.log(`      row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}/${p.vatType?.name} desc="${p.description}"`);
      }
    }
  } else {
    console.log("  NO supplierInvoice found!");
  }

  // Read the voucher directly too
  const vReadback = await api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*,account(*),vatType(*),supplier(*))`);
  if (vReadback.status < 400) {
    const rv = vReadback.data.value;
    console.log(`\n  Voucher readback:`);
    console.log(`    description: "${rv.description}"`);
    console.log(`    number: ${rv.number}`);
    console.log(`    date: ${rv.date}`);
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
