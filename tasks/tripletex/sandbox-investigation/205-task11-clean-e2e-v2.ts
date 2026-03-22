/**
 * Clean T11 E2E test v2 — simulates a real production run
 *
 * Fixes from v1:
 * 1. Uses IBAN format for BBAN (NO9386011117947) instead of dummy NO0000000000000
 * 2. DueDate = invoice date + 30 days
 * 3. physicalAddress on supplier
 * 4. NO BOOKING (sendToLedger=false only)
 * 5. Proper field expansions on verification GETs
 * 6. Uses .values[0] not .value for importDocument response
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

// Simulate a production prompt
const PROMPT = {
  invoiceNumber: "INV-2026-9075",
  supplierName: "Brightstone Ltd",
  supplierOrg: "890932991",
  grossAmount: 59800,
  expenseAccount: 6300,
  vatRate: 25,
};

const NET = PROMPT.grossAmount / (1 + PROMPT.vatRate / 100); // 47840
const VAT = PROMPT.grossAmount - NET; // 11960
const DATE = "2026-03-22";
const DUE = "2026-04-21"; // +30 days

const TS = Date.now();
// Use unique identifiers to avoid collision
const SUPPLIER_NAME = `${PROMPT.supplierName} ${TS}`;
const INV_NUM = `${PROMPT.invoiceNumber}-${TS}`;

let errors = 0;
let writes = 0;
let reads = 0;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body && !(body instanceof FormData)) opts.body = JSON.stringify(body);
  if (body instanceof FormData) { opts.body = body; opts.headers = { Authorization: AUTH }; }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }

  const isWrite = method !== "GET";
  if (isWrite) writes++;
  else reads++;

  if (res.status >= 400) {
    errors++;
    console.log(`❌ ${method} ${path} => ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
  } else {
    console.log(`✅ ${method} ${path} => ${res.status}`);
  }
  return { status: res.status, data };
}

async function main() {
  console.log("=== T11 CLEAN E2E TEST v2 ===");
  console.log(`Prompt: ${PROMPT.supplierName} / ${PROMPT.supplierOrg} / ${PROMPT.invoiceNumber} / ${PROMPT.grossAmount} / acct ${PROMPT.expenseAccount} / ${PROMPT.vatRate}%`);
  console.log(`Using: INV=${INV_NUM}, supplier=${SUPPLIER_NAME}`);
  console.log();

  // ==========================================
  // STEP 1: POST /supplier (with physicalAddress)
  // ==========================================
  console.log("=== STEP 1: POST /supplier ===");
  const supRes = await api("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: PROMPT.supplierOrg,
    postalAddress: { addressLine1: "Test Street 1", postalCode: "0155", city: "Oslo", country: { id: 161 } },
    physicalAddress: { addressLine1: "Test Street 1", postalCode: "0155", city: "Oslo", country: { id: 161 } },
  });
  const suppId = supRes.data?.value?.id;
  const suppLedgerId = supRes.data?.value?.ledgerAccount?.id;
  console.log(`  suppId=${suppId} suppLedgerId=${suppLedgerId}`);

  // ==========================================
  // STEP 2: GET /ledger/account (expense account)
  // ==========================================
  console.log("\n=== STEP 2: GET /ledger/account ===");
  const acctRes = await api("GET", `/ledger/account?number=${PROMPT.expenseAccount}&fields=*`);
  const acct = acctRes.data?.values?.[0];
  const acctId = acct?.id;
  const vatLocked = acct?.vatLocked;
  console.log(`  acctId=${acctId} vatLocked=${vatLocked}`);

  // If vatLocked, we'd need account 2710 too (not needed for 6300)
  let vat2710Id: number | null = null;
  if (vatLocked) {
    console.log("  Account is vatLocked! Getting 2710...");
    const vat2710Res = await api("GET", "/ledger/account?number=2710&fields=*");
    vat2710Id = vat2710Res.data?.values?.[0]?.id;
    console.log(`  vat2710Id=${vat2710Id}`);
  }

  // ==========================================
  // STEP 3: POST /ledger/voucher/importDocument (EHF XML)
  // ==========================================
  console.log("\n=== STEP 3: POST importDocument ===");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INV_NUM}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DUE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${PROMPT.supplierOrg}</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID schemeID="0192">${PROMPT.supplierOrg}</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Test Street 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0155</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${PROMPT.supplierOrg}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${PROMPT.supplierOrg}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">987654325</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID schemeID="0192">987654325</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>Buyer AS</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Gate 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>Buyer AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">987654325</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${INV_NUM}</cbc:PaymentID>
    <cac:PayeeFinancialAccount><cbc:ID>NO9386011117947</cbc:ID></cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${VAT.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${NET.toFixed(2)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${VAT.toFixed(2)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${PROMPT.grossAmount.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${PROMPT.grossAmount.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${NET.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>office services</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET.toFixed(2)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), `${INV_NUM}.xml`);
  const impRes = await api("POST", "/ledger/voucher/importDocument", form);

  // CRITICAL: importDocument returns .values[0] not .value
  const vId = impRes.data?.values?.[0]?.id;
  const vVer = impRes.data?.values?.[0]?.version;
  console.log(`  voucherId=${vId} version=${vVer}`);
  if (!vId) {
    console.error("FATAL: no voucher id from importDocument");
    return;
  }

  // ==========================================
  // VERIFICATION: GET supplierInvoice (after import, before PUT)
  // ==========================================
  console.log("\n=== VERIFY: GET supplierInvoice (after import) ===");
  const siRes1 = await api("GET", `/supplierInvoice?voucherId=${vId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
  const si1 = siRes1.data?.values?.[0];
  console.log(`  SI id=${si1?.id}`);
  console.log(`  invoiceNumber="${si1?.invoiceNumber}"`);
  console.log(`  amount=${si1?.amount} (expected: -${PROMPT.grossAmount})`);
  console.log(`  amountExcludingVat=${si1?.amountExcludingVat} (expected: -${NET})`);
  console.log(`  outstandingAmount=${si1?.outstandingAmount} (expected: ${PROMPT.grossAmount})`);
  console.log(`  kidOrReceiverReference="${si1?.kidOrReceiverReference}" (expected: "${INV_NUM}")`);
  console.log(`  invoiceDueDate="${si1?.invoiceDueDate}" (expected: "${DUE}")`);
  console.log(`  isCreditNote=${si1?.isCreditNote}`);

  // ==========================================
  // STEP 4: PUT postings (sendToLedger=false) — DO NOT BOOK
  // ==========================================
  console.log("\n=== STEP 4: PUT postings (sendToLedger=false) ===");

  let postings: any[];
  if (vatLocked && vat2710Id) {
    // VatLocked: 3-posting manual VAT split
    postings = [
      { row: 1, date: DATE, description: "office services", account: { id: acctId }, amount: NET, amountCurrency: NET, amountGross: NET, amountGrossCurrency: NET },
      { row: 2, date: DATE, description: "office services", account: { id: vat2710Id }, amount: VAT, amountCurrency: VAT, amountGross: VAT, amountGrossCurrency: VAT },
      { row: 3, date: DATE, description: "office services", account: { id: suppLedgerId }, supplier: { id: suppId }, amount: -PROMPT.grossAmount, amountCurrency: -PROMPT.grossAmount, amountGross: -PROMPT.grossAmount, amountGrossCurrency: -PROMPT.grossAmount, invoiceNumber: INV_NUM, termOfPayment: DUE },
    ];
  } else {
    // Standard: 2-posting with auto VAT
    postings = [
      { row: 1, date: DATE, description: "office services", account: { id: acctId }, vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: PROMPT.grossAmount, amountGrossCurrency: PROMPT.grossAmount },
      { row: 2, date: DATE, description: "office services", account: { id: suppLedgerId }, supplier: { id: suppId }, amount: -PROMPT.grossAmount, amountCurrency: -PROMPT.grossAmount, amountGross: -PROMPT.grossAmount, amountGrossCurrency: -PROMPT.grossAmount, invoiceNumber: INV_NUM, termOfPayment: DUE },
    ];
  }

  const putRes = await api("PUT", `/ledger/voucher/${vId}?sendToLedger=false`, {
    version: vVer,
    postings,
  });
  const newVer = putRes.data?.value?.version;
  const voucherNum = putRes.data?.value?.number;
  console.log(`  version=${newVer} number=${voucherNum} (0=unbooked=CORRECT)`);

  // ==========================================
  // VERIFICATION: Full state checks
  // ==========================================

  // GET voucher with expanded postings
  console.log("\n=== VERIFY: GET voucher with postings ===");
  const vRes = await api("GET", `/ledger/voucher/${vId}?fields=id,number,date,description,voucherType(*),postings(*,account(*),vatType(*),supplier(*))`);
  const voucher = vRes.data?.value;
  console.log(`  number=${voucher?.number} date=${voucher?.date} description="${voucher?.description}"`);
  console.log(`  voucherType=${voucher?.voucherType?.name}`);
  if (voucher?.postings) {
    for (const p of voucher.postings) {
      console.log(`  posting row=${p.row} acct=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.number} supplier=${p.supplier?.name || ''}`);
    }
  }

  // GET supplier with expanded addresses
  console.log("\n=== VERIFY: GET supplier ===");
  const supVerify = await api("GET", `/supplier/${suppId}?fields=*,postalAddress(*),physicalAddress(*)`);
  const sup = supVerify.data?.value;
  console.log(`  name="${sup?.name}" org=${sup?.organizationNumber}`);
  console.log(`  postalAddress: ${JSON.stringify(sup?.postalAddress)}`);
  console.log(`  physicalAddress: ${JSON.stringify(sup?.physicalAddress)}`);

  // GET supplierInvoice with orderLines (final state)
  console.log("\n=== VERIFY: GET supplierInvoice with orderLines ===");
  const siRes2 = await api("GET", `/supplierInvoice/${si1?.id}?fields=*,orderLines(*)`);
  const si2 = siRes2.data?.value;
  console.log(`  invoiceNumber="${si2?.invoiceNumber}"`);
  console.log(`  amount=${si2?.amount}`);
  console.log(`  amountExcludingVat=${si2?.amountExcludingVat}`);
  console.log(`  outstandingAmount=${si2?.outstandingAmount}`);
  console.log(`  kidOrReceiverReference="${si2?.kidOrReceiverReference}"`);
  console.log(`  invoiceDueDate="${si2?.invoiceDueDate}"`);
  console.log(`  isCreditNote=${si2?.isCreditNote}`);
  console.log(`  supplier.id=${si2?.supplier?.id}`);
  if (si2?.orderLines) {
    for (const ol of si2.orderLines) {
      console.log(`  orderLine: desc="${ol.description}" amount=${ol.amountExcludingVatCurrency} vatType=${ol.vatType?.id}`);
    }
  }

  // ==========================================
  // SUMMARY: Check simulation
  // ==========================================
  console.log("\n" + "=".repeat(70));
  console.log("  T11 CHECK SIMULATION");
  console.log("=".repeat(70));

  const checks = [
    { name: "supplierInvoice exists with correct amounts", pass: si2 && si2.amount !== 0 && si2.amountExcludingVat !== 0 },
    { name: "invoiceNumber matches", pass: si2?.invoiceNumber === INV_NUM },
    { name: "kidOrReceiverReference populated", pass: !!si2?.kidOrReceiverReference && si2.kidOrReceiverReference.trim() !== "" },
    { name: "invoiceDueDate = +30 days", pass: si2?.invoiceDueDate === DUE },
    { name: "voucher is UNBOOKED (number=0)", pass: voucher?.number === 0 },
    { name: "expense posting correct", pass: voucher?.postings?.some((p: any) => p.account?.number === PROMPT.expenseAccount && Math.abs(p.amountGross) === PROMPT.grossAmount) },
    { name: "supplier posting correct", pass: voucher?.postings?.some((p: any) => p.supplier?.id === suppId && p.amount === -PROMPT.grossAmount) },
    { name: "supplier has physicalAddress", pass: !!sup?.physicalAddress?.addressLine1 },
    { name: "supplier has postalAddress", pass: !!sup?.postalAddress?.addressLine1 },
    { name: "orderLines exist", pass: si2?.orderLines && si2.orderLines.length > 0 },
  ];

  let passed = 0;
  for (const c of checks) {
    const emoji = c.pass ? "✅" : "❌";
    console.log(`  ${emoji} ${c.name}`);
    if (c.pass) passed++;
  }

  console.log(`\n  RESULT: ${passed}/${checks.length} checks passed`);
  console.log(`  WRITES: ${writes} | READS: ${reads} | ERRORS: ${errors}`);
  console.log(`  Target: 3 writes, 0 errors (POST supplier + POST importDocument + PUT postings)`);
}

main().catch(e => { console.error(e); process.exit(1); });
