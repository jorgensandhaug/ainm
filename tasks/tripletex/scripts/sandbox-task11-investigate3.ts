// Task 11 investigation part 3:
// 1. Read orderLines on supplierInvoice to understand its structure
// 2. Try PUT /supplierInvoice/{id} to fix amounts
// 3. Try approve flow
// 4. Try import WITHOUT PUT — just the raw import

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = "2026-03-21";
const SUFFIX = `T11c-${Date.now()}`;

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
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const text = await r.text();
  if (!r.ok) {
    console.log(`POST ${path} → ${r.status}: ${text.slice(0, 500)}`);
    return { ok: false, status: r.status, error: text };
  }
  return { ok: true, status: r.status, data: JSON.parse(text) };
}

async function main() {
  // Setup: create supplier, import XML, add postings (sendToLedger=false)
  const sup = await api("POST", "/supplier", { name: `BrightT11c-${SUFFIX}`, organizationNumber: "890932991", isSupplier: true });
  const supplierId = sup.data?.value?.id;
  const supLedger = sup.data?.value?.ledgerAccount?.id;

  const acctR = await api("GET", `/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccountId = acctR.data?.values?.[0]?.id;

  const GROSS = 59800, NET = 47840, VAT = 11960;
  const INV_NR = `INV-${SUFFIX}`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INV_NR}</cbc:ID>
  <cbc:IssueDate>${TODAY}</cbc:IssueDate>
  <cbc:DueDate>2026-04-20</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">890932991</cbc:EndpointID>
    <cac:PartyName><cbc:Name>BrightT11c-${SUFFIX}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Test</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO890932991MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>BrightT11c-${SUFFIX}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">890932991</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Our Company</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>Our Company</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${VAT}</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${VAT}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Office services</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), `${INV_NR}.xml`);
  const importR = await apiForm("/ledger/voucher/importDocument", form);
  const voucherId = importR.data?.values?.[0]?.id;
  const voucherVer = importR.data?.values?.[0]?.version;
  console.log(`Import: voucherId=${voucherId}, version=${voucherVer}`);

  // PUT postings
  const putR = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVer,
    postings: [
      { row: 1, account: { id: expenseAccountId }, description: "Office services", vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, account: { id: supLedger }, supplier: { id: supplierId }, description: "Office services", amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: INV_NR, termOfPayment: "2026-04-20" },
    ],
  });
  console.log(`PUT postings: ${putR.ok ? 'OK' : 'FAILED'}`);

  // Find the supplierInvoice
  const siR = await api("GET", `/supplierInvoice?supplierId=${supplierId}&fields=*`);
  const si = siR.data?.values?.[0];
  console.log(`\nSupplierInvoice: id=${si?.id}`);
  console.log(`  invoiceNumber: ${si?.invoiceNumber}`);
  console.log(`  amount: ${si?.amount}`);
  console.log(`  amountCurrency: ${si?.amountCurrency}`);
  console.log(`  amountExcludingVat: ${si?.amountExcludingVat}`);
  console.log(`  outstandingAmount: ${si?.outstandingAmount}`);

  // Read orderLines on the supplierInvoice
  if (si?.orderLines?.length > 0) {
    console.log(`\n  orderLines (${si.orderLines.length}):`);
    for (const olRef of si.orderLines) {
      const olR = await api("GET", `/order/orderline/${olRef.id}?fields=*`);
      if (olR.ok) {
        const ol = olR.data?.value;
        console.log(`    orderLine id=${ol?.id}:`);
        for (const [k, v] of Object.entries(ol || {}).sort()) {
          if (v !== null && v !== undefined && v !== "" && v !== 0 && v !== false && !['url', 'changes'].includes(k)) {
            console.log(`      ${k}: ${JSON.stringify(v)}`);
          }
        }
      }
    }
  }

  // Try: PUT /supplierInvoice/{id} to see which fields are writable
  console.log("\n\n=== Try PUT /supplierInvoice ===");
  const siPut = await api("PUT", `/supplierInvoice/${si?.id}`, {
    id: si?.id,
    version: si?.version,
    invoiceNumber: INV_NR,
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-20",
    supplier: { id: supplierId },
  });
  console.log(`PUT supplierInvoice: ${siPut.ok ? 'OK' : 'FAILED'}`);
  if (siPut.ok) {
    const updated = siPut.data?.value;
    console.log(`  After PUT: amount=${updated?.amount} amountExcludingVat=${updated?.amountExcludingVat}`);
  }

  // Try: PUT /supplierInvoice/:approve
  console.log("\n=== Try approve ===");
  const approveR = await api("PUT", `/supplierInvoice/${si?.id}/:approve?approveComment=OK`);
  console.log(`Approve: ${approveR.ok ? 'OK' : 'FAILED'}`);

  // Re-read supplierInvoice after approval
  if (approveR.ok) {
    const siAfter = await api("GET", `/supplierInvoice/${si?.id}?fields=*`);
    console.log(`After approve: amount=${siAfter.data?.value?.amount}`);
  }

  // Check what the voucher looks like now
  const vFinal = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  console.log(`\nFinal voucher: number=${vFinal.data?.value?.number} numberAsString=${vFinal.data?.value?.numberAsString}`);

  // ==============================
  // ALSO TRY: What does the scorer likely use to find our invoice?
  // ==============================
  console.log("\n\n=== SCORER SEARCH PATTERNS ===");

  // By supplier name
  const searchByName = await api("GET", `/supplier?name=Brightstone Ltd&fields=*`);
  console.log(`Search supplier by name "Brightstone Ltd": ${searchByName.data?.values?.length} results`);

  // By org number
  const searchByOrg = await api("GET", `/supplier?organizationNumber=890932991&fields=*`);
  console.log(`Search supplier by org "890932991": ${searchByOrg.data?.values?.length} results`);
  if (searchByOrg.data?.values?.length > 0) {
    for (const s of searchByOrg.data.values) {
      console.log(`  id=${s.id} name="${s.name}" org="${s.organizationNumber}"`);
    }
  }

  // By invoice number
  const searchByInvNr = await api("GET", `/supplierInvoice?invoiceNumber=INV-2026-9075&fields=*`);
  console.log(`Search supplierInvoice by invoiceNumber "INV-2026-9075": ${searchByInvNr.data?.values?.length} results`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
