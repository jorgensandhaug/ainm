// Task 11 investigation part 4: Fix sendToLedger=true
// Hypothesis: posting amount/amountGross signs or fields are wrong for ledger booking
// Try different posting structures

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = "2026-03-21";
const SUFFIX = `T11d-${Date.now()}`;
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

function buildXml(name: string, org: string, inv: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${inv}</cbc:ID><cbc:IssueDate>${TODAY}</cbc:IssueDate><cbc:DueDate>2026-04-20</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${org}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>${name}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>T</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${org}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${name}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${org}</cbc:CompanyID></cac:PartyLegalEntity>
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
}

async function doImport(org: string, label: string): Promise<{voucherId: number, version: number, supplierId: number, supLedger: number}> {
  const sup = await api("POST", "/supplier", { name: `${label}-${SUFFIX}`, organizationNumber: org, isSupplier: true });
  const supplierId = sup.data?.value?.id;
  const supLedger = sup.data?.value?.ledgerAccount?.id;
  const xml = buildXml(`${label}-${SUFFIX}`, org, `${label}-${SUFFIX}`);
  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), `${label}.xml`);
  const imp = await apiForm("/ledger/voucher/importDocument", form);
  return { voucherId: imp.data?.values?.[0]?.id, version: imp.data?.values?.[0]?.version, supplierId, supLedger };
}

async function main() {
  const acctR = await api("GET", `/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccountId = acctR.data?.values?.[0]?.id;

  // ==============================
  // TEST A: Two-step with version from first PUT
  // ==============================
  console.log("========== TEST A: Two-step, re-read version ==========\n");
  const a = await doImport("890932991", "TestA");
  console.log(`Import: voucher=${a.voucherId} v=${a.version}`);

  // Step 1: PUT with sendToLedger=false
  const putA1 = await api("PUT", `/ledger/voucher/${a.voucherId}?sendToLedger=false`, {
    version: a.version,
    postings: [
      { row: 1, account: { id: expenseAccountId }, description: "Office services", vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, account: { id: a.supLedger }, supplier: { id: a.supplierId }, description: "Office services", amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: `TestA-${SUFFIX}`, termOfPayment: "2026-04-20" },
    ],
  });
  console.log(`Step 1 (sendToLedger=false): ${putA1.ok ? 'OK' : 'FAILED'}`);
  const newVer = putA1.data?.value?.version;

  // Step 2: PUT with sendToLedger=true, NO postings (just version)
  console.log("Step 2: sendToLedger=true without re-specifying postings");
  const putA2 = await api("PUT", `/ledger/voucher/${a.voucherId}?sendToLedger=true`, {
    version: newVer,
  });
  console.log(`Step 2: ${putA2.ok ? 'OK' : 'FAILED'}`);

  // ==============================
  // TEST B: Minimal postings - amount only, no amountGross
  // ==============================
  console.log("\n========== TEST B: Minimal postings (no amountGross) ==========\n");
  const b = await doImport("976098897", "TestB");
  console.log(`Import: voucher=${b.voucherId} v=${b.version}`);

  const putB = await api("PUT", `/ledger/voucher/${b.voucherId}?sendToLedger=true`, {
    version: b.version,
    postings: [
      { row: 1, account: { id: expenseAccountId }, description: "Office services", vatType: { id: 1 }, amount: NET, amountCurrency: NET },
      { row: 2, account: { id: b.supLedger }, supplier: { id: b.supplierId }, description: "Office services", amount: -GROSS, amountCurrency: -GROSS, invoiceNumber: `TestB-${SUFFIX}`, termOfPayment: "2026-04-20" },
    ],
  });
  console.log(`PUT B: ${putB.ok ? 'OK' : 'FAILED'}`);
  if (putB.ok) {
    const vr = await api("GET", `/ledger/voucher/${b.voucherId}?fields=*`);
    console.log(`  Voucher number: ${vr.data?.value?.number}`);
  }

  // ==============================
  // TEST C: Opposite signs - expense negative, supplier positive
  // ==============================
  console.log("\n========== TEST C: Reversed signs ==========\n");
  const c = await doImport("979191138", "TestC");
  console.log(`Import: voucher=${c.voucherId} v=${c.version}`);

  const putC = await api("PUT", `/ledger/voucher/${c.voucherId}?sendToLedger=true`, {
    version: c.version,
    postings: [
      { row: 1, account: { id: expenseAccountId }, description: "Office services", vatType: { id: 1 }, amount: -NET, amountCurrency: -NET, amountGross: -GROSS, amountGrossCurrency: -GROSS },
      { row: 2, account: { id: c.supLedger }, supplier: { id: c.supplierId }, description: "Office services", amount: GROSS, amountCurrency: GROSS, amountGross: GROSS, amountGrossCurrency: GROSS, invoiceNumber: `TestC-${SUFFIX}`, termOfPayment: "2026-04-20" },
    ],
  });
  console.log(`PUT C: ${putC.ok ? 'OK' : 'FAILED'}`);

  // ==============================
  // TEST D: 3-posting structure (manual VAT posting)
  // ==============================
  console.log("\n========== TEST D: 3 explicit postings (incl VAT) ==========\n");
  const d = await doImport("971032081", "TestD");
  console.log(`Import: voucher=${d.voucherId} v=${d.version}`);

  const putD = await api("PUT", `/ledger/voucher/${d.voucherId}?sendToLedger=true`, {
    version: d.version,
    postings: [
      { row: 1, account: { id: expenseAccountId }, description: "Office services", amount: NET, amountCurrency: NET },
      { row: 2, account: { id: 424190943 }, description: "MVA", amount: VAT_AMT, amountCurrency: VAT_AMT }, // 2710 account
      { row: 3, account: { id: d.supLedger }, supplier: { id: d.supplierId }, description: "Office services", amount: -GROSS, amountCurrency: -GROSS, invoiceNumber: `TestD-${SUFFIX}`, termOfPayment: "2026-04-20" },
    ],
  });
  console.log(`PUT D: ${putD.ok ? 'OK' : 'FAILED'}`);
  if (putD.ok) {
    const vr = await api("GET", `/ledger/voucher/${d.voucherId}?fields=*`);
    console.log(`  Voucher number: ${vr.data?.value?.number}`);
  }

  // ==============================
  // TEST E: Just amount, no amountGross/amountCurrency
  // ==============================
  console.log("\n========== TEST E: Just amount field ==========\n");
  const e = await doImport("916300484", "TestE");
  console.log(`Import: voucher=${e.voucherId} v=${e.version}`);

  const putE = await api("PUT", `/ledger/voucher/${e.voucherId}?sendToLedger=true`, {
    version: e.version,
    postings: [
      { row: 1, account: { id: expenseAccountId }, description: "Office services", vatType: { id: 1 }, amount: NET },
      { row: 2, account: { id: e.supLedger }, supplier: { id: e.supplierId }, description: "Office services", amount: -GROSS, invoiceNumber: `TestE-${SUFFIX}`, termOfPayment: "2026-04-20" },
    ],
  });
  console.log(`PUT E: ${putE.ok ? 'OK' : 'FAILED'}`);
  if (putE.ok) {
    const vr = await api("GET", `/ledger/voucher/${e.voucherId}?fields=*`);
    console.log(`  Voucher number: ${vr.data?.value?.number}`);
    // Check supplier invoice
    const siR = await api("GET", `/supplierInvoice?supplierId=${e.supplierId}&invoiceDateFrom=2000-01-01&invoiceDateTo=2027-12-31&fields=*`);
    for (const si of siR.data?.values || []) {
      console.log(`  SI: amount=${si.amount} amountExcludingVat=${si.amountExcludingVat} outstandingAmount=${si.outstandingAmount}`);
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
