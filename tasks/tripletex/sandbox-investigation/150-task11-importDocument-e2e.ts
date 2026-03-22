// Task 11: Text-only supplier invoice — importDocument flow with booking
// Tests the UPDATED T11 standard (importDocument + book with voucherType)
// Simulates a T11 prompt: "We received invoice INV-... from supplier X (org Y) for Z NOK"

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// T11 prompt data (all inline, no PDF):
// "Vi har mottatt faktura INV-2026-9382 fra leverandøren Stormberg AS (org.nr 877462137)
//  på 61600 kr inklusiv MVA. Beløpet gjelder kontortjenester (konto 6340).
//  Registrer leverandørfakturaen med korrekt inngående MVA (25 %)."
const RUN_ID = Date.now().toString().slice(-6);
const SUPPLIER_NAME = `T11-Supplier-${RUN_ID}`;
const ORG_NR = "877462137"; // from a real T11 prompt
const INVOICE_NR = `INV-T11-${RUN_ID}`;
const INVOICE_DATE = "2026-03-22"; // T11 has no PDF date, uses run date
const DUE_DATE = "2026-04-21"; // run date + 30 days
const DESCRIPTION = "kontortjenester"; // exact casing from prompt
const GROSS = 61600;
const NET = 49280; // 61600 / 1.25
const VAT_AMOUNT = 12320;
const EXPENSE_ACCOUNT_NR = 6340;
// T11 prompts have NO address or bank data — supplier is text-only

let supplierId: number;
let supplierLedgerAccountId: number;
let expenseAccountId: number;
let voucherId: number;

async function step1_createSupplier() {
  console.log("\n========== STEP 1: POST /supplier ==========");
  // T11: no address/bank in prompt, but let's add physicalAddress anyway per standard
  const res = await fetch(`${BASE}/supplier`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: SUPPLIER_NAME,
      organizationNumber: ORG_NR,
    }),
  });
  const data = await res.json();
  if (!res.ok) { console.log("FAIL:", JSON.stringify(data, null, 2)); throw new Error("Step 1 failed"); }
  supplierId = data.value.id;
  supplierLedgerAccountId = data.value.ledgerAccount.id;
  console.log(`  supplierId=${supplierId}, ledgerAccountId=${supplierLedgerAccountId}`);
  console.log(`  STATUS: ${res.status} OK`);
}

async function step2_getAccount() {
  console.log("\n========== STEP 2: GET /ledger/account ==========");
  const res = await fetch(
    `${BASE}/ledger/account?number=${EXPENSE_ACCOUNT_NR}&isApplicableForSupplierInvoice=true&fields=*`,
    { headers: H }
  );
  const data = await res.json();
  if (!res.ok || !data.values?.length) throw new Error("Step 2 failed");
  expenseAccountId = data.values[0].id;
  console.log(`  expenseAccountId=${expenseAccountId} (${data.values[0].name})`);
  console.log(`  STATUS: ${res.status} OK`);
}

async function step3_importDocument(): Promise<number> {
  console.log("\n========== STEP 3: POST /ledger/voucher/importDocument ==========");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NR}</cbc:ID>
  <cbc:IssueDate>${INVOICE_DATE}</cbc:IssueDate>
  <cbc:DueDate>${DUE_DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NR}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG_NR}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${ORG_NR}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Ditt firma</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Ditt firma</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${VAT_AMOUNT}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${VAT_AMOUNT}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${DESCRIPTION}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "text/xml" }), `${INVOICE_NR}.xml`);
  const res = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) { console.log("FAIL:", JSON.stringify(data, null, 2)); throw new Error("Step 3 failed"); }
  voucherId = data.values[0].id;
  const version = data.values[0].version;
  console.log(`  voucherId=${voucherId}, version=${version}, number=${data.values[0].number}`);
  console.log(`  STATUS: ${res.status} OK`);
  return version;
}

async function step4_setPostings(version: number): Promise<number> {
  console.log("\n========== STEP 4: PUT postings (sendToLedger=false) ==========");
  const res = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify({
      version,
      postings: [
        {
          row: 1,
          date: INVOICE_DATE,
          description: DESCRIPTION,
          account: { id: expenseAccountId },
          vatType: { id: 1 },
          amount: NET,
          amountCurrency: NET,
          amountGross: GROSS,
          amountGrossCurrency: GROSS,
        },
        {
          row: 2,
          date: INVOICE_DATE,
          description: DESCRIPTION,
          account: { id: supplierLedgerAccountId },
          supplier: { id: supplierId },
          amount: -GROSS,
          amountCurrency: -GROSS,
          amountGross: -GROSS,
          amountGrossCurrency: -GROSS,
          invoiceNumber: INVOICE_NR,
          termOfPayment: DUE_DATE,
        },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) { console.log("FAIL:", JSON.stringify(data, null, 2)); throw new Error("Step 4 failed"); }
  const newVersion = data.value.version;
  console.log(`  newVersion=${newVersion}, number=${data.value.number}`);
  console.log(`  STATUS: ${res.status} OK`);
  return newVersion;
}

async function step5_book(version: number) {
  console.log("\n========== STEP 5: PUT book (sendToLedger=true) ==========");
  // Per updated T11 standard: send voucherType in booking PUT
  const res = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify({
      version,
      voucherType: { name: "Leverandørfaktura" },
    }),
  });
  const data = await res.json();
  if (!res.ok) { console.log("FAIL:", JSON.stringify(data, null, 2)); throw new Error("Step 5 failed"); }
  console.log(`  number=${data.value.number} (booked: ${data.value.number > 0})`);
  console.log(`  numberAsString=${data.value.numberAsString}`);
  console.log(`  STATUS: ${res.status} OK`);
}

// ============ FULL VERIFICATION ============

async function verify_all() {
  console.log("\n\n====================================================");
  console.log("============ VERIFICATION ==========================");
  console.log("====================================================");

  // 1. Supplier
  console.log("\n--- SUPPLIER ---");
  const supRes = await fetch(
    `${BASE}/supplier/${supplierId}?fields=id,name,organizationNumber,supplierNumber,isSupplier,postalAddress(addressLine1,postalCode,city,country(id)),physicalAddress(addressLine1,postalCode,city,country(id)),bankAccountPresentation(bban),ledgerAccount(id,number)`,
    { headers: H }
  );
  const sup = (await supRes.json()).value;
  console.log(`  name: "${sup.name}"`);
  console.log(`  organizationNumber: "${sup.organizationNumber}"`);
  console.log(`  supplierNumber: ${sup.supplierNumber}`);
  console.log(`  isSupplier: ${sup.isSupplier}`);
  console.log(`  postalAddress: ${sup.postalAddress?.addressLine1 || '(empty)'}, ${sup.postalAddress?.postalCode || ''} ${sup.postalAddress?.city || ''}, country=${sup.postalAddress?.country?.id || 'none'}`);
  console.log(`  physicalAddress: ${sup.physicalAddress?.addressLine1 || '(empty)'}, ${sup.physicalAddress?.postalCode || ''} ${sup.physicalAddress?.city || ''}, country=${sup.physicalAddress?.country?.id || 'none'}`);
  console.log(`  bankAccountPresentation: ${JSON.stringify(sup.bankAccountPresentation)}`);
  console.log(`  ledgerAccount: id=${sup.ledgerAccount?.id} number=${sup.ledgerAccount?.number}`);

  // 2. Voucher with expanded postings
  console.log("\n--- VOUCHER ---");
  const vRes = await fetch(
    `${BASE}/ledger/voucher/${voucherId}?fields=id,number,numberAsString,description,date,vendorInvoiceNumber,voucherType(id,name),postings(row,date,description,account(id,number,name),vatType(id,number,percentage),amount,amountCurrency,amountGross,amountGrossCurrency,supplier(id,name),invoiceNumber,termOfPayment,systemGenerated,currency(id))`,
    { headers: H }
  );
  const v = (await vRes.json()).value;
  console.log(`  id: ${v.id}`);
  console.log(`  number: ${v.number} (booked: ${v.number > 0})`);
  console.log(`  numberAsString: "${v.numberAsString}"`);
  console.log(`  description: "${v.description}"`);
  console.log(`  date: ${v.date}`);
  console.log(`  vendorInvoiceNumber: "${v.vendorInvoiceNumber}"`);
  console.log(`  voucherType: ${v.voucherType?.name} (id=${v.voucherType?.id})`);
  console.log(`  postings (${v.postings?.length}):`);
  for (const p of v.postings || []) {
    console.log(`    row=${p.row} | acct=${p.account?.number} "${p.account?.name}" | amt=${p.amount} | gross=${p.amountGross} | vat=${p.vatType?.id}/${p.vatType?.percentage}% | supplier=${p.supplier?.id || '-'} | invNr=${p.invoiceNumber || '-'} | due=${p.termOfPayment || '-'} | sysGen=${p.systemGenerated} | desc="${p.description}"`);
  }

  // 3. supplierInvoice
  console.log("\n--- SUPPLIER INVOICE ---");
  const siRes = await fetch(
    `${BASE}/supplierInvoice?invoiceDateFrom=${INVOICE_DATE}&invoiceDateTo=2026-12-31&fields=id,invoiceNumber,invoiceDate,invoiceDueDate,supplier(id,name),voucher(id,number),amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,outstandingAmount,isCreditNote,orderLines(id,description,count,unitCostCurrency,amountExcludingVatCurrency,amountIncludingVatCurrency,vatType(id,percentage)),currency(id),payments`,
    { headers: H }
  );
  const siData = await siRes.json();
  const si = siData.values?.find((x: any) => x.voucher?.id === voucherId);
  if (!si) {
    console.log(`  FAIL: No supplierInvoice for voucherId=${voucherId}`);
    return;
  }
  console.log(`  id: ${si.id}`);
  console.log(`  invoiceNumber: "${si.invoiceNumber}"`);
  console.log(`  invoiceDate: ${si.invoiceDate}`);
  console.log(`  invoiceDueDate: ${si.invoiceDueDate}`);
  console.log(`  supplier: id=${si.supplier?.id} name="${si.supplier?.name}"`);
  console.log(`  voucher: id=${si.voucher?.id} number=${si.voucher?.number}`);
  console.log(`  amount: ${si.amount}`);
  console.log(`  amountExcludingVat: ${si.amountExcludingVat}`);
  console.log(`  outstandingAmount: ${si.outstandingAmount}`);
  console.log(`  isCreditNote: ${si.isCreditNote}`);
  console.log(`  payments: ${JSON.stringify(si.payments)}`);
  console.log(`  orderLines (${si.orderLines?.length}):`);
  for (const ol of si.orderLines || []) {
    console.log(`    id=${ol.id} desc="${ol.description}" count=${ol.count} unitCost=${ol.unitCostCurrency} exVat=${ol.amountExcludingVatCurrency} incVat=${ol.amountIncludingVatCurrency} vatType=${ol.vatType?.id}/${ol.vatType?.percentage}%`);
  }

  // Summary checks
  console.log("\n--- FIELD CHECKS ---");
  const checks: { name: string; got: any; want: any }[] = [
    // Supplier
    { name: "supplier.name", got: sup.name, want: SUPPLIER_NAME },
    { name: "supplier.orgNr", got: sup.organizationNumber, want: ORG_NR },
    { name: "supplier.isSupplier", got: sup.isSupplier, want: true },
    // Voucher
    { name: "voucher.booked", got: v.number > 0, want: true },
    { name: "voucher.date", got: v.date, want: INVOICE_DATE },
    { name: "voucher.vendorInvoiceNumber", got: v.vendorInvoiceNumber, want: INVOICE_NR },
    { name: "voucher.voucherType", got: v.voucherType?.name, want: "Leverandørfaktura" },
    // Debit posting
    { name: "debit.account", got: v.postings?.find((p: any) => p.row === 1)?.account?.number, want: EXPENSE_ACCOUNT_NR },
    { name: "debit.amount", got: v.postings?.find((p: any) => p.row === 1)?.amount, want: NET },
    { name: "debit.amountGross", got: v.postings?.find((p: any) => p.row === 1)?.amountGross, want: GROSS },
    { name: "debit.vatType", got: v.postings?.find((p: any) => p.row === 1)?.vatType?.id, want: 1 },
    { name: "debit.description", got: v.postings?.find((p: any) => p.row === 1)?.description, want: DESCRIPTION },
    // Credit posting
    { name: "credit.supplier", got: v.postings?.find((p: any) => p.row === 2)?.supplier?.id, want: supplierId },
    { name: "credit.amount", got: v.postings?.find((p: any) => p.row === 2)?.amount, want: -GROSS },
    { name: "credit.invoiceNumber", got: v.postings?.find((p: any) => p.row === 2)?.invoiceNumber, want: INVOICE_NR },
    { name: "credit.termOfPayment", got: v.postings?.find((p: any) => p.row === 2)?.termOfPayment, want: DUE_DATE },
    // VAT posting
    { name: "vat.amount", got: v.postings?.find((p: any) => p.row === 0)?.amount, want: VAT_AMOUNT },
    { name: "vat.systemGenerated", got: v.postings?.find((p: any) => p.row === 0)?.systemGenerated, want: true },
    // supplierInvoice
    { name: "si.exists", got: !!si, want: true },
    { name: "si.invoiceNumber", got: si.invoiceNumber, want: INVOICE_NR },
    { name: "si.invoiceDate", got: si.invoiceDate, want: INVOICE_DATE },
    { name: "si.invoiceDueDate", got: si.invoiceDueDate, want: DUE_DATE },
    { name: "si.supplier.id", got: si.supplier?.id, want: supplierId },
    { name: "si.voucher.id", got: si.voucher?.id, want: voucherId },
    { name: "si.amount", got: si.amount, want: -GROSS },
    { name: "si.amountExcludingVat", got: si.amountExcludingVat, want: -NET },
    { name: "si.outstandingAmount", got: si.outstandingAmount, want: GROSS },
    { name: "si.isCreditNote", got: si.isCreditNote, want: false },
    { name: "si.hasOrderLines", got: (si.orderLines?.length || 0) > 0, want: true },
  ];

  let pass = 0, fail = 0;
  for (const c of checks) {
    const ok = String(c.got) === String(c.want);
    if (ok) { pass++; }
    else { fail++; console.log(`  FAIL: ${c.name} = ${JSON.stringify(c.got)} (want ${JSON.stringify(c.want)})`); }
  }
  console.log(`\n  ${pass}/${checks.length} checks passed${fail > 0 ? `, ${fail} FAILED` : " — ALL PASS"}`);
}

async function main() {
  console.log("=== Task 11 importDocument E2E Test ===");
  console.log(`Data: ${SUPPLIER_NAME} / ${ORG_NR} / ${INVOICE_NR} / gross=${GROSS} / acct=${EXPENSE_ACCOUNT_NR}`);

  await step1_createSupplier();
  await step2_getAccount();
  const v1 = await step3_importDocument();
  const v2 = await step4_setPostings(v1);
  await step5_book(v2);
  await verify_all();

  console.log("\n=== DONE: 5 execution calls + 3 verification calls ===");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
