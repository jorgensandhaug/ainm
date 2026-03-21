// VERIFY: Task 11 fix — 5-call path with /:sendToLedger booking
// Compare BOOKED vs UNBOOKED supplierInvoice state side by side
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body && !(body instanceof FormData)) opts.body = JSON.stringify(body);
  if (body instanceof FormData) { opts.body = body; opts.headers = { Authorization: AUTH }; }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 600));
  return { status: res.status, data: json };
}

function buildEHF(invoiceNum: string, supplierName: string, org: string, date: string, net: number, vat: number, gross: number) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNum}</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${org}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Test</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${org}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${supplierName}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${org}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
    <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Gate 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>My Company</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${vat}</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${net}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${vat}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${net}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${gross}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${gross}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Office services</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${net}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

async function runFlow(label: string, book: boolean) {
  const TS = Date.now();
  const SUPPLIER = `Verify_${label}_${TS}`;
  const ORG = "890932991";
  const INV = `INV-${label}-${TS}`;
  const GROSS = 59800, NET = 47840, VAT = 11960, DATE = "2026-03-21";

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label} (book=${book})`);
  console.log(`${"=".repeat(60)}\n`);

  // 1. POST /supplier
  const supRes = await api("POST", "/supplier", { name: SUPPLIER, organizationNumber: ORG });
  const supplierId = supRes.data?.value?.id;
  const supplierLedgerAccountId = supRes.data?.value?.ledgerAccount?.id;

  // 2. GET /ledger/account
  const accRes = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*");
  const expenseAccountId = accRes.data?.values?.[0]?.id;

  // 3. POST /ledger/voucher/importDocument
  const xml = buildEHF(INV, SUPPLIER, ORG, DATE, NET, VAT, GROSS);
  const fd = new FormData();
  fd.append("file", new Blob([xml], { type: "application/xml" }), `${INV}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", fd);
  const voucherId = importRes.data?.values?.[0]?.id;
  const voucherVersion = importRes.data?.values?.[0]?.version;

  // 4. PUT /ledger/voucher/{id}?sendToLedger=false
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      { row: 1, account: { id: expenseAccountId }, description: "Office services", vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, account: { id: supplierLedgerAccountId }, supplier: { id: supplierId }, description: "Office services", amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: INV, termOfPayment: DATE },
    ],
  });

  // 5. (Conditionally) PUT /ledger/voucher/{id}/:sendToLedger
  if (book) {
    const bookRes = await api("PUT", `/ledger/voucher/${voucherId}/:sendToLedger`);
    if (bookRes.status >= 400) {
      console.log("*** BOOKING FAILED ***");
      return;
    }
  }

  // ===== FULL STATE DUMP =====
  console.log("\n--- VOUCHER STATE ---");
  const vRes = await api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*)`);
  const v = vRes.data?.value;
  console.log(`  id=${v?.id} number=${v?.number} numberAsString="${v?.numberAsString}" date=${v?.date}`);
  console.log(`  postings: ${v?.postings?.length}`);
  for (const p of v?.postings || []) {
    console.log(`    row=${p.row} acct=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id} supplier=${p.supplier?.id} sysGen=${p.systemGenerated}`);
  }

  console.log("\n--- SUPPLIER INVOICE STATE ---");
  const siRes = await api("GET", `/supplierInvoice?invoiceDateFrom=2026-03-21&invoiceDateTo=2026-03-22&supplierId=${supplierId}&fields=*`);
  for (const si of (siRes.data?.values || [])) {
    console.log(`  id=${si.id} invoiceNumber="${si.invoiceNumber}"`);
    console.log(`  amount=${si.amount} amountCurrency=${si.amountCurrency}`);
    console.log(`  amountExcludingVat=${si.amountExcludingVat} amountExcludingVatCurrency=${si.amountExcludingVatCurrency}`);
    console.log(`  invoiceDate=${si.invoiceDate} invoiceDueDate=${si.invoiceDueDate}`);
    console.log(`  supplier.id=${si.supplier?.id} voucher.id=${si.voucher?.id}`);
    console.log(`  isCreditNote=${si.isCreditNote} outstandingAmount=${si.outstandingAmount}`);
    console.log(`  orderLines=${si.orderLines?.length} payments=${si.payments?.length}`);
    console.log(`  currency.id=${si.currency?.id}`);

    // Check order lines
    if (si.orderLines?.length > 0) {
      const olRes = await api("GET", `/order/orderline/${si.orderLines[0].id}?fields=*`);
      const ol = olRes.data?.value;
      console.log(`  orderLine[0]: description="${ol?.description}" count=${ol?.count} unitCost=${ol?.unitCostCurrency} unitPrice=${ol?.unitPriceExcludingVatCurrency} vatType=${ol?.vatType?.id}`);
    }
  }

  console.log("\n--- SUPPLIER STATE ---");
  const supCheck = await api("GET", `/supplier/${supplierId}?fields=*`);
  const s = supCheck.data?.value;
  console.log(`  name="${s?.name}" orgNumber="${s?.organizationNumber}" ledgerAccount=${s?.ledgerAccount?.id}`);
}

async function main() {
  // Run both flows and compare
  await runFlow("UNBOOKED", false);
  await runFlow("BOOKED", true);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
