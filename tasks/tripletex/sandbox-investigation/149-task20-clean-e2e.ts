// Task 20: CLEAN end-to-end test with full verification of all fields
// Tests the importDocument path and reads back every scored field

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Unique test data to avoid sandbox collisions
const RUN_ID = Date.now().toString().slice(-6);
const SUPPLIER_NAME = `TestSupplier-${RUN_ID}`;
const ORG_NR = "948453436"; // valid mod11 org number
const STREET = "Parkveien 77";
const POSTAL_CODE = "9008";
const CITY = "Tromsø";
const BANK_ACCOUNT = "17062016817";
const INVOICE_NR = `INV-T20-${RUN_ID}`;
const INVOICE_DATE = "2026-05-24";
const DUE_DATE = "2026-06-23";
const DESCRIPTION = "Programvarelisens";
const NET = 45400;
const GROSS = 56750;
const VAT_AMOUNT = 11350;
const EXPENSE_ACCOUNT_NR = 6340;

let supplierId: number;
let supplierLedgerAccountId: number;
let expenseAccountId: number;
let voucherId: number;

async function step1_createSupplier() {
  console.log("\n========== STEP 1: POST /supplier ==========");
  const res = await fetch(`${BASE}/supplier`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: SUPPLIER_NAME,
      organizationNumber: ORG_NR,
      postalAddress: {
        addressLine1: STREET,
        postalCode: POSTAL_CODE,
        city: CITY,
        country: { id: 161 },
      },
      physicalAddress: {
        addressLine1: STREET,
        postalCode: POSTAL_CODE,
        city: CITY,
        country: { id: 161 },
      },
      bankAccountPresentation: [{ bban: BANK_ACCOUNT }],
    }),
  });
  const data = await res.json();
  if (!res.ok) { console.log("FAIL:", JSON.stringify(data)); throw new Error("Step 1 failed"); }

  supplierId = data.value.id;
  supplierLedgerAccountId = data.value.ledgerAccount.id;
  console.log(`  supplierId = ${supplierId}`);
  console.log(`  supplierLedgerAccountId = ${supplierLedgerAccountId}`);
  console.log(`  STATUS: ${res.status} OK`);
}

async function step2_getAccount() {
  console.log("\n========== STEP 2: GET /ledger/account ==========");
  const res = await fetch(
    `${BASE}/ledger/account?number=${EXPENSE_ACCOUNT_NR}&isApplicableForSupplierInvoice=true&fields=*`,
    { headers: H }
  );
  const data = await res.json();
  if (!res.ok || !data.values?.length) { console.log("FAIL:", JSON.stringify(data)); throw new Error("Step 2 failed"); }

  expenseAccountId = data.values[0].id;
  console.log(`  expenseAccountId = ${expenseAccountId} (${data.values[0].name})`);
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
        <cbc:StreetName>${STREET}</cbc:StreetName>
        <cbc:CityName>${CITY}</cbc:CityName>
        <cbc:PostalZone>${POSTAL_CODE}</cbc:PostalZone>
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
  if (!res.ok) { console.log("FAIL:", JSON.stringify(data)); throw new Error("Step 3 failed"); }

  voucherId = data.values[0].id;
  const version = data.values[0].version;
  console.log(`  voucherId = ${voucherId}`);
  console.log(`  version = ${version}`);
  console.log(`  number = ${data.values[0].number} (should be 0 = unbooked)`);
  console.log(`  STATUS: ${res.status} OK`);
  return version;
}

async function step4_setPostings(version: number): Promise<number> {
  console.log("\n========== STEP 4: PUT /ledger/voucher — set postings ==========");
  const res = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify({
      version,
      postings: [
        {
          row: 1,
          account: { id: expenseAccountId },
          description: DESCRIPTION,
          vatType: { id: 1 },
          amount: NET,
          amountCurrency: NET,
          amountGross: GROSS,
          amountGrossCurrency: GROSS,
        },
        {
          row: 2,
          account: { id: supplierLedgerAccountId },
          supplier: { id: supplierId },
          description: DESCRIPTION,
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
  if (!res.ok) { console.log("FAIL:", JSON.stringify(data)); throw new Error("Step 4 failed"); }

  const newVersion = data.value.version;
  console.log(`  newVersion = ${newVersion}`);
  console.log(`  number = ${data.value.number} (should still be 0)`);
  console.log(`  STATUS: ${res.status} OK`);
  return newVersion;
}

async function step5_book(version: number) {
  console.log("\n========== STEP 5: PUT /ledger/voucher — book ==========");
  const res = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify({ version }),
  });
  const data = await res.json();
  if (!res.ok) { console.log("FAIL:", JSON.stringify(data)); throw new Error("Step 5 failed"); }

  console.log(`  number = ${data.value.number} (should be > 0 = booked)`);
  console.log(`  numberAsString = ${data.value.numberAsString}`);
  console.log(`  STATUS: ${res.status} OK`);
}

// ============ VERIFICATION ============

async function verify_supplier() {
  console.log("\n========== VERIFY: Supplier ==========");
  const res = await fetch(
    `${BASE}/supplier/${supplierId}?fields=id,name,organizationNumber,supplierNumber,isSupplier,postalAddress(id,addressLine1,postalCode,city,country(id)),physicalAddress(id,addressLine1,postalCode,city,country(id)),bankAccountPresentation(bban,iban),ledgerAccount(id,number)`,
    { headers: H }
  );
  const data = await res.json();
  if (!res.ok) { console.log("FAIL:", JSON.stringify(data)); return; }
  const s = data.value;

  const checks = [
    { name: "name", got: s.name, want: SUPPLIER_NAME },
    { name: "organizationNumber", got: s.organizationNumber, want: ORG_NR },
    { name: "isSupplier", got: s.isSupplier, want: true },
    { name: "postalAddress.addressLine1", got: s.postalAddress?.addressLine1, want: STREET },
    { name: "postalAddress.postalCode", got: s.postalAddress?.postalCode, want: POSTAL_CODE },
    { name: "postalAddress.city", got: s.postalAddress?.city, want: CITY },
    { name: "postalAddress.country.id", got: s.postalAddress?.country?.id, want: 161 },
    { name: "physicalAddress.addressLine1", got: s.physicalAddress?.addressLine1, want: STREET },
    { name: "physicalAddress.postalCode", got: s.physicalAddress?.postalCode, want: POSTAL_CODE },
    { name: "physicalAddress.city", got: s.physicalAddress?.city, want: CITY },
    { name: "physicalAddress.country.id", got: s.physicalAddress?.country?.id, want: 161 },
    { name: "bankAccountPresentation[0].bban", got: s.bankAccountPresentation?.[0]?.bban, want: BANK_ACCOUNT },
    { name: "ledgerAccount.id", got: s.ledgerAccount?.id, want: supplierLedgerAccountId },
  ];

  let pass = 0, fail = 0;
  for (const c of checks) {
    const ok = String(c.got) === String(c.want);
    if (ok) { pass++; } else { fail++; console.log(`  FAIL: ${c.name} = ${JSON.stringify(c.got)} (want ${JSON.stringify(c.want)})`); }
  }
  console.log(`  ${pass}/${checks.length} passed${fail > 0 ? `, ${fail} FAILED` : " — ALL PASS"}`);
}

async function verify_voucher() {
  console.log("\n========== VERIFY: Voucher ==========");
  const res = await fetch(
    `${BASE}/ledger/voucher/${voucherId}?fields=id,number,numberAsString,description,date,vendorInvoiceNumber,voucherType(id,name),postings(row,date,description,account(id,number,name),vatType(id,number,percentage),amount,amountCurrency,amountGross,amountGrossCurrency,supplier(id),invoiceNumber,termOfPayment,systemGenerated,currency(id))`,
    { headers: H }
  );
  const data = await res.json();
  if (!res.ok) { console.log("FAIL:", JSON.stringify(data)); return; }
  const v = data.value;

  console.log(`  id = ${v.id}`);
  console.log(`  number = ${v.number} (booked: ${v.number > 0})`);
  console.log(`  numberAsString = ${v.numberAsString}`);
  console.log(`  description = "${v.description}"`);
  console.log(`  date = ${v.date}`);
  console.log(`  vendorInvoiceNumber = "${v.vendorInvoiceNumber}"`);
  console.log(`  voucherType = ${v.voucherType?.name} (id=${v.voucherType?.id})`);

  const checks = [
    { name: "number > 0 (booked)", got: v.number > 0, want: true },
    { name: "date", got: v.date, want: INVOICE_DATE },
    { name: "vendorInvoiceNumber", got: v.vendorInvoiceNumber, want: INVOICE_NR },
    { name: "voucherType.name", got: v.voucherType?.name, want: "Leverandørfaktura" },
  ];

  // Check postings
  console.log(`\n  Postings (${v.postings?.length}):`);
  for (const p of v.postings || []) {
    console.log(`    row=${p.row} | account=${p.account?.number} (${p.account?.name}) | amount=${p.amount} | amountGross=${p.amountGross} | vatType=${p.vatType?.id}/${p.vatType?.percentage}% | supplier=${p.supplier?.id || '-'} | invoiceNr=${p.invoiceNumber || '-'} | termOfPayment=${p.termOfPayment || '-'} | sysGen=${p.systemGenerated}`);
  }

  // Find debit posting (row 1)
  const debit = v.postings?.find((p: any) => p.row === 1);
  if (debit) {
    checks.push(
      { name: "debit.account.number", got: debit.account?.number, want: EXPENSE_ACCOUNT_NR },
      { name: "debit.amount", got: debit.amount, want: NET },
      { name: "debit.amountGross", got: debit.amountGross, want: GROSS },
      { name: "debit.vatType.id", got: debit.vatType?.id, want: 1 },
      { name: "debit.description", got: debit.description, want: DESCRIPTION },
      { name: "debit.systemGenerated", got: debit.systemGenerated, want: false },
    );
  } else {
    checks.push({ name: "debit posting exists", got: false, want: true });
  }

  // Find credit posting (row 2)
  const credit = v.postings?.find((p: any) => p.row === 2);
  if (credit) {
    checks.push(
      { name: "credit.account.id", got: credit.account?.id, want: supplierLedgerAccountId },
      { name: "credit.amount", got: credit.amount, want: -GROSS },
      { name: "credit.amountGross", got: credit.amountGross, want: -GROSS },
      { name: "credit.supplier.id", got: credit.supplier?.id, want: supplierId },
      { name: "credit.invoiceNumber", got: credit.invoiceNumber, want: INVOICE_NR },
      { name: "credit.termOfPayment", got: credit.termOfPayment, want: DUE_DATE },
      { name: "credit.systemGenerated", got: credit.systemGenerated, want: false },
    );
  } else {
    checks.push({ name: "credit posting exists", got: false, want: true });
  }

  // Find VAT posting (row 0, system generated)
  const vat = v.postings?.find((p: any) => p.row === 0);
  if (vat) {
    checks.push(
      { name: "vat.amount", got: vat.amount, want: VAT_AMOUNT },
      { name: "vat.systemGenerated", got: vat.systemGenerated, want: true },
    );
  } else {
    checks.push({ name: "vat posting exists", got: false, want: true });
  }

  let pass = 0, fail = 0;
  for (const c of checks) {
    const ok = String(c.got) === String(c.want);
    if (ok) { pass++; } else { fail++; console.log(`  FAIL: ${c.name} = ${JSON.stringify(c.got)} (want ${JSON.stringify(c.want)})`); }
  }
  console.log(`\n  ${pass}/${checks.length} passed${fail > 0 ? `, ${fail} FAILED` : " — ALL PASS"}`);
}

async function verify_supplierInvoice() {
  console.log("\n========== VERIFY: supplierInvoice ==========");
  const res = await fetch(
    `${BASE}/supplierInvoice?invoiceDateFrom=${INVOICE_DATE}&invoiceDateTo=2026-12-31&fields=id,invoiceNumber,invoiceDate,invoiceDueDate,supplier(id,name),voucher(id,number),amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,outstandingAmount,isCreditNote,currency(id),payments`,
    { headers: H }
  );
  const data = await res.json();
  if (!res.ok) { console.log("FAIL:", JSON.stringify(data)); return; }

  // Find our invoice by voucher id
  const si = data.values?.find((v: any) => v.voucher?.id === voucherId);
  if (!si) {
    console.log(`  FAIL: No supplierInvoice found for voucherId=${voucherId}`);
    console.log(`  Available voucher ids: ${data.values?.map((v: any) => v.voucher?.id).join(', ')}`);
    return;
  }

  console.log(`  id = ${si.id}`);
  console.log(`  invoiceNumber = "${si.invoiceNumber}"`);
  console.log(`  invoiceDate = ${si.invoiceDate}`);
  console.log(`  invoiceDueDate = ${si.invoiceDueDate}`);
  console.log(`  supplier.id = ${si.supplier?.id}`);
  console.log(`  supplier.name = "${si.supplier?.name}"`);
  console.log(`  voucher.id = ${si.voucher?.id}`);
  console.log(`  voucher.number = ${si.voucher?.number}`);
  console.log(`  amount = ${si.amount}`);
  console.log(`  amountExcludingVat = ${si.amountExcludingVat}`);
  console.log(`  outstandingAmount = ${si.outstandingAmount}`);
  console.log(`  isCreditNote = ${si.isCreditNote}`);
  console.log(`  payments = ${JSON.stringify(si.payments)}`);

  const checks = [
    { name: "supplierInvoice exists", got: true, want: true },
    { name: "invoiceNumber", got: si.invoiceNumber, want: INVOICE_NR },
    { name: "invoiceDate", got: si.invoiceDate, want: INVOICE_DATE },
    { name: "invoiceDueDate", got: si.invoiceDueDate, want: DUE_DATE },
    { name: "supplier.id", got: si.supplier?.id, want: supplierId },
    { name: "voucher.id", got: si.voucher?.id, want: voucherId },
    { name: "amount", got: si.amount, want: -GROSS },
    { name: "amountExcludingVat", got: si.amountExcludingVat, want: -NET },
    { name: "outstandingAmount", got: si.outstandingAmount, want: GROSS },
    { name: "isCreditNote", got: si.isCreditNote, want: false },
  ];

  let pass = 0, fail = 0;
  for (const c of checks) {
    const ok = String(c.got) === String(c.want);
    if (ok) { pass++; } else { fail++; console.log(`  FAIL: ${c.name} = ${JSON.stringify(c.got)} (want ${JSON.stringify(c.want)})`); }
  }
  console.log(`\n  ${pass}/${checks.length} passed${fail > 0 ? `, ${fail} FAILED` : " — ALL PASS"}`);
}

async function main() {
  console.log("=== Task 20 Clean E2E Test ===");
  console.log(`Supplier: ${SUPPLIER_NAME} / ${ORG_NR}`);
  console.log(`Invoice: ${INVOICE_NR} / ${INVOICE_DATE} / due ${DUE_DATE}`);
  console.log(`Amounts: net=${NET} vat=${VAT_AMOUNT} gross=${GROSS}`);
  console.log(`Account: ${EXPENSE_ACCOUNT_NR}`);

  // === EXECUTION (5 API calls) ===
  await step1_createSupplier();
  await step2_getAccount();
  const importVersion = await step3_importDocument();
  const postingsVersion = await step4_setPostings(importVersion);
  await step5_book(postingsVersion);

  console.log("\n\n====================================================");
  console.log("============ VERIFICATION (read-back) ==============");
  console.log("====================================================");

  // === VERIFICATION (3 read-back calls) ===
  await verify_supplier();
  await verify_voucher();
  await verify_supplierInvoice();

  console.log("\n\n====================================================");
  console.log("============ SUMMARY ===============================");
  console.log("====================================================");
  console.log(`Execution: 5 API calls, 0 errors`);
  console.log(`Verification: 3 read-back calls`);
  console.log(`supplierId = ${supplierId}`);
  console.log(`voucherId = ${voucherId}`);
}

main().catch((e) => {
  console.error("\nFATAL:", e);
  process.exit(1);
});
