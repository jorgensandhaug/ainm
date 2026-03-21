// Task 11 sandbox investigation: Why does supplier invoice registration score 0%?
// Test 3 approaches and inspect resulting supplierInvoice state:
// A. EHF XML import + PUT sendToLedger=false
// B. EHF XML import + PUT sendToLedger=true
// C. Direct POST /ledger/voucher (no XML)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = "2026-03-21";
const SUFFIX = `T11-${Date.now()}`;

// Task 11 params
const GROSS = 59800;
const NET = 47840; // 59800 / 1.25
const VAT_AMOUNT = 11960;
const EXPENSE_ACCT = 6300;
const INVOICE_NR = `INV-${SUFFIX}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) {
    console.log(`${method} ${path} → ${r.status}: ${text.slice(0, 300)}`);
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

async function inspectSupplierInvoice(supplierId: number, label: string) {
  // Search for supplier invoices
  const siR = await api("GET", `/supplierInvoice?supplierId=${supplierId}&invoiceDateFrom=2000-01-01&invoiceDateTo=2027-12-31&fields=*`);
  console.log(`\n${label} — Supplier invoices for supplier ${supplierId}:`);
  if (!siR.ok || !siR.data?.values?.length) {
    console.log("  NONE FOUND!");
    return;
  }
  for (const si of siR.data.values) {
    console.log(`  id=${si.id}`);
    console.log(`    invoiceNumber: ${si.invoiceNumber}`);
    console.log(`    invoiceDate: ${si.invoiceDate}`);
    console.log(`    dueDate: ${si.dueDate}`);
    console.log(`    amount: ${si.amount}`);
    console.log(`    amountCurrency: ${si.amountCurrency}`);
    console.log(`    amountExcludingVat: ${si.amountExcludingVat}`);
    console.log(`    amountExcludingVatCurrency: ${si.amountExcludingVatCurrency}`);
    console.log(`    supplier.id: ${si.supplier?.id}`);
    console.log(`    voucher.id: ${si.voucher?.id}`);
    console.log(`    currency: ${JSON.stringify(si.currency)}`);
    // Dump ALL non-null fields
    console.log(`    ALL fields:`);
    for (const [k, v] of Object.entries(si).sort()) {
      if (v !== null && v !== undefined && v !== "" && v !== 0 && v !== false && !['url', 'changes'].includes(k)) {
        const vs = JSON.stringify(v);
        if (vs.length < 200) console.log(`      ${k}: ${vs}`);
      }
    }
  }
}

async function main() {
  // Setup: get expense account and VAT type
  const acctR = await api("GET", `/ledger/account?number=${EXPENSE_ACCT}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccountId = acctR.data?.values?.[0]?.id;
  console.log(`Expense account ${EXPENSE_ACCT}: id=${expenseAccountId}`);

  const vatR = await api("GET", `/ledger/vatType?typeOfVat=INCOMING&vatDate=${TODAY}&fields=*`);
  const vat25 = vatR.data?.values?.find((v: any) => v.percentage === 25 && /^\d+$/.test(v.number ?? ""));
  const vatTypeId = vat25?.id;
  console.log(`VAT type 25%: id=${vatTypeId} number=${vat25?.number}`);

  // Get voucherType for direct POST approach
  const vtR = await api("GET", "/ledger/voucherType?name=Leverandørfaktura&fields=*");
  const voucherTypeId = vtR.data?.values?.find((v: any) => v.name === "Leverandørfaktura")?.id;
  console.log(`VoucherType Leverandørfaktura: id=${voucherTypeId}`);

  // ==============================
  // APPROACH A: EHF import + sendToLedger=false
  // ==============================
  console.log("\n\n========== APPROACH A: EHF import + sendToLedger=false ==========\n");

  const supA = await api("POST", "/supplier", { name: `BrightstoneA-${SUFFIX}`, organizationNumber: "890932991", isSupplier: true });
  const supAId = supA.data?.value?.id;
  const supALedger = supA.data?.value?.ledgerAccount?.id;
  console.log(`Supplier A: id=${supAId}, ledgerAccount=${supALedger}`);

  const xmlA = buildEhfXml(`BrightstoneA-${SUFFIX}`, "890932991", `INVA-${SUFFIX}`, NET, VAT_AMOUNT, GROSS, "Office services");
  const formA = new FormData();
  formA.append("file", new Blob([xmlA], { type: "application/xml" }), `INVA-${SUFFIX}.xml`);
  const importA = await apiForm("/ledger/voucher/importDocument", formA);
  const voucherAId = importA.data?.values?.[0]?.id;
  const voucherAVer = importA.data?.values?.[0]?.version;
  console.log(`Import A: voucherId=${voucherAId}, version=${voucherAVer}`);

  const putA = await api("PUT", `/ledger/voucher/${voucherAId}?sendToLedger=false`, {
    version: voucherAVer,
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
        account: { id: supALedger },
        supplier: { id: supAId },
        description: "Office services",
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: `INVA-${SUFFIX}`,
        termOfPayment: "2026-04-20",
      },
    ],
  });
  console.log(`PUT A (sendToLedger=false): ${putA.ok ? 'OK' : 'FAILED'}`);

  await inspectSupplierInvoice(supAId, "APPROACH A");

  // ==============================
  // APPROACH B: EHF import + sendToLedger=true
  // ==============================
  console.log("\n\n========== APPROACH B: EHF import + sendToLedger=true ==========\n");

  const supB = await api("POST", "/supplier", { name: `BrightstoneB-${SUFFIX}`, organizationNumber: "890932992", isSupplier: true });
  const supBId = supB.data?.value?.id;
  const supBLedger = supB.data?.value?.ledgerAccount?.id;
  console.log(`Supplier B: id=${supBId}, ledgerAccount=${supBLedger}`);

  const xmlB = buildEhfXml(`BrightstoneB-${SUFFIX}`, "890932992", `INVB-${SUFFIX}`, NET, VAT_AMOUNT, GROSS, "Office services");
  const formB = new FormData();
  formB.append("file", new Blob([xmlB], { type: "application/xml" }), `INVB-${SUFFIX}.xml`);
  const importB = await apiForm("/ledger/voucher/importDocument", formB);
  const voucherBId = importB.data?.values?.[0]?.id;
  const voucherBVer = importB.data?.values?.[0]?.version;
  console.log(`Import B: voucherId=${voucherBId}, version=${voucherBVer}`);

  const putB = await api("PUT", `/ledger/voucher/${voucherBId}?sendToLedger=true`, {
    version: voucherBVer,
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
        account: { id: supBLedger },
        supplier: { id: supBId },
        description: "Office services",
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: `INVB-${SUFFIX}`,
        termOfPayment: "2026-04-20",
      },
    ],
  });
  console.log(`PUT B (sendToLedger=true): ${putB.ok ? 'OK' : 'FAILED'}`);

  await inspectSupplierInvoice(supBId, "APPROACH B");

  // ==============================
  // APPROACH C: Direct POST /ledger/voucher (no XML import)
  // ==============================
  console.log("\n\n========== APPROACH C: Direct POST /ledger/voucher ==========\n");

  const supC = await api("POST", "/supplier", { name: `BrightstoneC-${SUFFIX}`, organizationNumber: "890932993", isSupplier: true });
  const supCId = supC.data?.value?.id;
  const supCLedger = supC.data?.value?.ledgerAccount?.id;
  console.log(`Supplier C: id=${supCId}, ledgerAccount=${supCLedger}`);

  const voucherC = await api("POST", "/ledger/voucher", {
    date: TODAY,
    description: "Office services",
    voucherType: { id: voucherTypeId },
    postings: [
      {
        row: 1,
        date: TODAY,
        description: "Office services",
        account: { id: expenseAccountId },
        vatType: { id: vatTypeId },
        currency: { id: 1 },
        amount: NET,
        amountCurrency: NET,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        date: TODAY,
        description: "Office services",
        account: { id: supCLedger },
        supplier: { id: supCId },
        currency: { id: 1 },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: `INVC-${SUFFIX}`,
        termOfPayment: "2026-04-20",
      },
    ],
  });
  console.log(`POST voucher C: ${voucherC.ok ? 'OK' : 'FAILED'}`);
  if (voucherC.ok) {
    console.log(`  voucherId: ${voucherC.data?.value?.id}`);
    console.log(`  postings: ${voucherC.data?.value?.postings?.length}`);
  }

  await inspectSupplierInvoice(supCId, "APPROACH C");

  // ==============================
  // APPROACH D: Direct POST /supplierInvoice (if this even works)
  // ==============================
  console.log("\n\n========== APPROACH D: POST /supplierInvoice directly ==========\n");

  const supD = await api("POST", "/supplier", { name: `BrightstoneD-${SUFFIX}`, organizationNumber: "890932994", isSupplier: true });
  const supDId = supD.data?.value?.id;
  console.log(`Supplier D: id=${supDId}`);

  // Try multiple schema variations
  const si1 = await api("POST", "/supplierInvoice", {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-20",
    supplier: { id: supDId },
    invoiceNumber: `INVD-${SUFFIX}`,
  });
  console.log(`POST /supplierInvoice (minimal): ${si1.ok ? 'OK' : 'FAILED'}`);
  if (si1.ok) {
    console.log(`  id: ${si1.data?.value?.id}`);
    await inspectSupplierInvoice(supDId, "APPROACH D");
  }

  // ==============================
  // INSPECTION: Read back all vouchers to compare
  // ==============================
  console.log("\n\n========== VOUCHER COMPARISON ==========\n");
  for (const [label, vid] of [["A", voucherAId], ["B", voucherBId], ["C", voucherC.ok ? voucherC.data?.value?.id : null]]) {
    if (!vid) continue;
    const vr = await api("GET", `/ledger/voucher/${vid}?fields=*,postings(*)`);
    if (vr.ok) {
      const v = vr.data?.value;
      console.log(`\nVoucher ${label} (id=${vid}):`);
      console.log(`  voucherType: ${JSON.stringify(v?.voucherType)}`);
      console.log(`  date: ${v?.date}`);
      console.log(`  description: ${v?.description}`);
      console.log(`  number: ${v?.number}`);
      for (const p of v?.postings || []) {
        console.log(`  posting row=${p.row}: account=${p.account?.id}(${p.account?.number}) amount=${p.amount} amountGross=${p.amountGross} vat=${p.vatType?.id} supplier=${p.supplier?.id} invoiceNr=${p.invoiceNumber}`);
      }
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
