// Task 11 investigation part 2:
// - Test EHF import WITHOUT overriding postings (just import)
// - Test EHF import + sendToLedger=true (with valid org number)
// - Compare supplierInvoice fields in both cases

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = "2026-03-21";
const SUFFIX = `T11b-${Date.now()}`;

const GROSS = 59800;
const NET = 47840;
const VAT_AMOUNT = 11960;
const EXPENSE_ACCT = 6300;

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

function buildEhfXml(supplierName: string, orgNr: string, invoiceNr: string, net: number, vat: number, gross: number, desc: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNr}</cbc:ID>
  <cbc:IssueDate>${TODAY}</cbc:IssueDate>
  <cbc:DueDate>2026-04-20</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${orgNr}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${orgNr}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${supplierName}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${orgNr}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Our Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Our Company</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${vat}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${net}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${vat}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${net}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${gross}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${gross}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${desc}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${net}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

async function inspectFull(supplierId: number, label: string) {
  const siR = await api("GET", `/supplierInvoice?supplierId=${supplierId}&invoiceDateFrom=2000-01-01&invoiceDateTo=2027-12-31&fields=*`);
  console.log(`\n${label} — Supplier invoices:`);
  if (!siR.ok || !siR.data?.values?.length) {
    console.log("  NONE FOUND!");
    return;
  }
  for (const si of siR.data.values) {
    console.log(`  id=${si.id}`);
    for (const [k, v] of Object.entries(si).sort()) {
      if (v !== null && v !== undefined && v !== "" && !['url', 'changes'].includes(k)) {
        const vs = JSON.stringify(v);
        if (vs.length < 300) console.log(`    ${k}: ${vs}`);
      }
    }

    // Also read the voucher postings for this supplier invoice
    if (si.voucher?.id) {
      const vr = await api("GET", `/ledger/voucher/${si.voucher.id}?fields=*,postings(*,account(*),vatType(*),supplier(*))`);
      if (vr.ok) {
        console.log(`  Voucher postings:`);
        for (const p of vr.data?.value?.postings || []) {
          console.log(`    row=${p.row}: acct=${p.account?.number}(id=${p.account?.id}) amount=${p.amount} amountGross=${p.amountGross} vat=${p.vatType?.number}(id=${p.vatType?.id},pct=${p.vatType?.percentage}) supplier=${p.supplier?.id} invoiceNr=${p.invoiceNumber}`);
        }
      }
    }
  }
}

async function main() {
  // Setup
  const acctR = await api("GET", `/ledger/account?number=${EXPENSE_ACCT}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccountId = acctR.data?.values?.[0]?.id;

  const vatR = await api("GET", `/ledger/vatType?typeOfVat=INCOMING&vatDate=${TODAY}&fields=*`);
  const vat25 = vatR.data?.values?.find((v: any) => v.percentage === 25 && /^\d+$/.test(v.number ?? ""));
  const vatTypeId = vat25?.id;

  // ==============================
  // TEST 1: Import ONLY (no PUT) — let Tripletex handle everything
  // ==============================
  console.log("\n\n========== TEST 1: Import only, NO PUT ==========\n");

  // Use the real task 11 org number (890932991) — must be MOD11 valid
  const sup1 = await api("POST", "/supplier", { name: `Brightstone-ImportOnly-${SUFFIX}`, organizationNumber: "890932991", isSupplier: true });
  const sup1Id = sup1.data?.value?.id;
  console.log(`Supplier: id=${sup1Id}`);

  const xml1 = buildEhfXml(`Brightstone-ImportOnly-${SUFFIX}`, "890932991", `INV1-${SUFFIX}`, NET, VAT_AMOUNT, GROSS, "Office services");
  const form1 = new FormData();
  form1.append("file", new Blob([xml1], { type: "application/xml" }), `INV1-${SUFFIX}.xml`);
  const import1 = await apiForm("/ledger/voucher/importDocument", form1);
  const voucher1Id = import1.data?.values?.[0]?.id;
  console.log(`Import result: voucherId=${voucher1Id}`);

  // Don't PUT — just read the state
  await inspectFull(sup1Id, "TEST 1 (import only)");

  // ==============================
  // TEST 2: Import + PUT with sendToLedger=true (same org number)
  // ==============================
  console.log("\n\n========== TEST 2: Import + PUT sendToLedger=true ==========\n");

  // Need a different supplier since org number 890932991 already used
  // Use another valid Norwegian org number
  const sup2 = await api("POST", "/supplier", { name: `Brightstone-LedgerTrue-${SUFFIX}`, organizationNumber: "979191138", isSupplier: true });
  const sup2Id = sup2.data?.value?.id;
  const sup2Ledger = sup2.data?.value?.ledgerAccount?.id;
  console.log(`Supplier: id=${sup2Id}, ledger=${sup2Ledger}`);

  const xml2 = buildEhfXml(`Brightstone-LedgerTrue-${SUFFIX}`, "979191138", `INV2-${SUFFIX}`, NET, VAT_AMOUNT, GROSS, "Office services");
  const form2 = new FormData();
  form2.append("file", new Blob([xml2], { type: "application/xml" }), `INV2-${SUFFIX}.xml`);
  const import2 = await apiForm("/ledger/voucher/importDocument", form2);
  const voucher2Id = import2.data?.values?.[0]?.id;
  const voucher2Ver = import2.data?.values?.[0]?.version;
  console.log(`Import: voucherId=${voucher2Id}, version=${voucher2Ver}`);

  if (voucher2Id) {
    const put2 = await api("PUT", `/ledger/voucher/${voucher2Id}?sendToLedger=true`, {
      version: voucher2Ver,
      postings: [
        {
          row: 1,
          account: { id: expenseAccountId },
          description: "Office services",
          vatType: { id: vatTypeId },
          amount: NET,
          amountCurrency: NET,
          amountGross: GROSS,
          amountGrossCurrency: GROSS,
        },
        {
          row: 2,
          account: { id: sup2Ledger },
          supplier: { id: sup2Id },
          description: "Office services",
          amount: -GROSS,
          amountCurrency: -GROSS,
          amountGross: -GROSS,
          amountGrossCurrency: -GROSS,
          invoiceNumber: `INV2-${SUFFIX}`,
          termOfPayment: "2026-04-20",
        },
      ],
    });
    console.log(`PUT (sendToLedger=true): ${put2.ok ? 'OK' : 'FAILED'}`);
  }

  await inspectFull(sup2Id, "TEST 2 (import + PUT sendToLedger=true)");

  // ==============================
  // TEST 3: Import + PUT sendToLedger=false (same as before but with valid org)
  // ==============================
  console.log("\n\n========== TEST 3: Import + PUT sendToLedger=false ==========\n");

  const sup3 = await api("POST", "/supplier", { name: `Brightstone-LedgerFalse-${SUFFIX}`, organizationNumber: "976098897", isSupplier: true });
  const sup3Id = sup3.data?.value?.id;
  const sup3Ledger = sup3.data?.value?.ledgerAccount?.id;
  console.log(`Supplier: id=${sup3Id}, ledger=${sup3Ledger}`);

  const xml3 = buildEhfXml(`Brightstone-LedgerFalse-${SUFFIX}`, "976098897", `INV3-${SUFFIX}`, NET, VAT_AMOUNT, GROSS, "Office services");
  const form3 = new FormData();
  form3.append("file", new Blob([xml3], { type: "application/xml" }), `INV3-${SUFFIX}.xml`);
  const import3 = await apiForm("/ledger/voucher/importDocument", form3);
  const voucher3Id = import3.data?.values?.[0]?.id;
  const voucher3Ver = import3.data?.values?.[0]?.version;
  console.log(`Import: voucherId=${voucher3Id}, version=${voucher3Ver}`);

  if (voucher3Id) {
    const put3 = await api("PUT", `/ledger/voucher/${voucher3Id}?sendToLedger=false`, {
      version: voucher3Ver,
      postings: [
        {
          row: 1,
          account: { id: expenseAccountId },
          description: "Office services",
          vatType: { id: vatTypeId },
          amount: NET,
          amountCurrency: NET,
          amountGross: GROSS,
          amountGrossCurrency: GROSS,
        },
        {
          row: 2,
          account: { id: sup3Ledger },
          supplier: { id: sup3Id },
          description: "Office services",
          amount: -GROSS,
          amountCurrency: -GROSS,
          amountGross: -GROSS,
          amountGrossCurrency: -GROSS,
          invoiceNumber: `INV3-${SUFFIX}`,
          termOfPayment: "2026-04-20",
        },
      ],
    });
    console.log(`PUT (sendToLedger=false): ${put3.ok ? 'OK' : 'FAILED'}`);
  }

  await inspectFull(sup3Id, "TEST 3 (import + PUT sendToLedger=false)");

  // ==============================
  // TEST 4: What about existing sandbox-investigation scripts?
  // ==============================
  console.log("\n\n========== SUMMARY ==========");
  console.log("Compare: voucher number, SI amounts, SI fields across all 3 tests");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
