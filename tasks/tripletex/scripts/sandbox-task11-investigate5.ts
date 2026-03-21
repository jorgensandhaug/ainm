// Task 11 investigation part 5: Verify the two-step approach and check final state
// The winning pattern: import → PUT sendToLedger=false → PUT sendToLedger=true (no postings)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = "2026-03-21";
const SUFFIX = `T11e-${Date.now()}`;
const GROSS = 59800, NET = 47840, VAT_AMT = 11960;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) {
    console.log(`${method} ${path} → ${r.status}: ${text.slice(0, 400)}`);
    return { ok: false, status: r.status, error: text };
  }
  return { ok: true, status: r.status, data: JSON.parse(text) };
}

async function apiForm(path: string, formData: FormData) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method: "POST", headers: { Authorization: AUTH }, body: formData });
  const text = await r.text();
  if (!r.ok) { console.log(`POST ${path} → ${r.status}: ${text.slice(0, 500)}`); return { ok: false, status: r.status, error: text }; }
  return { ok: true, status: r.status, data: JSON.parse(text) };
}

async function main() {
  // === FULL CORRECT FLOW ===
  console.log("========== FULL CORRECT FLOW ==========\n");

  // Step 1: Create supplier
  const sup = await api("POST", "/supplier", { name: `Brightstone-${SUFFIX}`, organizationNumber: "890932991", isSupplier: true });
  const supplierId = sup.data?.value?.id;
  const supLedger = sup.data?.value?.ledgerAccount?.id;
  console.log(`1. Supplier: id=${supplierId}, ledger=${supLedger}`);

  // Step 2: Get expense account
  const acctR = await api("GET", `/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccountId = acctR.data?.values?.[0]?.id;
  console.log(`2. Expense account 6300: id=${expenseAccountId}`);

  // Step 3: Import EHF XML
  const INV_NR = `INV-${SUFFIX}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INV_NR}</cbc:ID><cbc:IssueDate>${TODAY}</cbc:IssueDate><cbc:DueDate>2026-04-20</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">890932991</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Brightstone-${SUFFIX}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>T</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO890932991MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Brightstone-${SUFFIX}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">890932991</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Co</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>Co</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${VAT_AMT}</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${VAT_AMT}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Office services</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), `${INV_NR}.xml`);
  const imp = await apiForm("/ledger/voucher/importDocument", form);
  const voucherId = imp.data?.values?.[0]?.id;
  const voucherVer = imp.data?.values?.[0]?.version;
  console.log(`3. Import: voucherId=${voucherId}, version=${voucherVer}`);

  // Step 4: PUT postings with sendToLedger=false
  const put1 = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVer,
    postings: [
      { row: 1, account: { id: expenseAccountId }, description: "Office services", vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, account: { id: supLedger }, supplier: { id: supplierId }, description: "Office services", amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: INV_NR, termOfPayment: "2026-04-20" },
    ],
  });
  console.log(`4. PUT postings (sendToLedger=false): ${put1.ok ? 'OK' : 'FAILED'}`);
  const ver2 = put1.data?.value?.version;

  // Step 5: PUT sendToLedger=true (book the voucher, no postings needed)
  const put2 = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: ver2,
  });
  console.log(`5. PUT sendToLedger=true: ${put2.ok ? 'OK' : 'FAILED'}`);

  // === FINAL STATE INSPECTION ===
  console.log("\n\n========== FINAL STATE ==========\n");

  // Voucher
  const vr = await api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*,account(*),vatType(*),supplier(*))`);
  const v = vr.data?.value;
  console.log(`Voucher:`);
  console.log(`  id: ${v?.id}`);
  console.log(`  number: ${v?.number}`);
  console.log(`  numberAsString: ${v?.numberAsString}`);
  console.log(`  date: ${v?.date}`);
  console.log(`  description: ${v?.description}`);
  console.log(`  voucherType: ${JSON.stringify(v?.voucherType)}`);
  for (const p of v?.postings || []) {
    console.log(`  posting: row=${p.row} acct=${p.account?.number}(${p.account?.id}) amount=${p.amount} amountGross=${p.amountGross} vat=${p.vatType?.number}(pct=${p.vatType?.percentage}) supplier=${p.supplier?.id} invoiceNr="${p.invoiceNumber}"`);
  }

  // SupplierInvoice
  const siR = await api("GET", `/supplierInvoice?supplierId=${supplierId}&invoiceDateFrom=2000-01-01&invoiceDateTo=2027-12-31&fields=*`);
  console.log(`\nSupplierInvoice:`);
  for (const si of siR.data?.values || []) {
    console.log(`  id: ${si.id}`);
    console.log(`  invoiceNumber: ${si.invoiceNumber}`);
    console.log(`  invoiceDate: ${si.invoiceDate}`);
    console.log(`  invoiceDueDate: ${si.invoiceDueDate}`);
    console.log(`  amount: ${si.amount}`);
    console.log(`  amountCurrency: ${si.amountCurrency}`);
    console.log(`  amountExcludingVat: ${si.amountExcludingVat}`);
    console.log(`  amountExcludingVatCurrency: ${si.amountExcludingVatCurrency}`);
    console.log(`  outstandingAmount: ${si.outstandingAmount}`);
    console.log(`  isCreditNote: ${si.isCreditNote}`);
    console.log(`  voucher: ${si.voucher?.id}`);
    console.log(`  supplier: ${si.supplier?.id}`);
    console.log(`  currency: ${JSON.stringify(si.currency)}`);
  }

  // Supplier
  const supR = await api("GET", `/supplier/${supplierId}?fields=*`);
  console.log(`\nSupplier:`);
  console.log(`  id: ${supR.data?.value?.id}`);
  console.log(`  name: ${supR.data?.value?.name}`);
  console.log(`  organizationNumber: ${supR.data?.value?.organizationNumber}`);

  // Compare with the UNBOOKED approach (from earlier tests)
  // The BOOKED voucher should have number > 0
  console.log(`\n\n========== COMPARISON ==========`);
  console.log(`Voucher number (booked): ${v?.number} (expected: > 0)`);
  console.log(`If number=0 → NOT booked, scorer may reject`);
  console.log(`If number>0 → BOOKED, scorer should accept`);

  console.log(`\nAPI call count: 5 (supplier, account, import, PUT postings, PUT book)`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
