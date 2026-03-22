// Task 11: Full end-to-end supplier invoice flow verification
// Tests the CURRENT 5-call path WITH booking (sendToLedger=true)
// Also verifies: physicalAddress on supplier, OrderLinePosting format
// Reports full supplierInvoice and voucher state for scorer field analysis

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const DATE = "2026-03-22";
const GROSS = 55000;
const NET = 44000;
const VAT_AMT = 11000;
const INVOICE_NUM = "INV-VERIFY-84-001";
const SUPPLIER_NAME = "Verifisering AS";
const ORG_NUM = "812345672"; // Valid mod11
const DESCRIPTION = "konsulenttjenester";
const EXPENSE_ACCT = 6300;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H as any };
  if (body && !(body instanceof FormData)) opts.body = JSON.stringify(body);
  if (body instanceof FormData) { opts.body = body; opts.headers = { Authorization: AUTH } as any; }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n${method} ${path} => ${res.status}`);
  if (res.status >= 400) {
    console.log("ERROR:", JSON.stringify(json, null, 2).slice(0, 2000));
  }
  return { status: res.status, data: json };
}

function makeXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NUM}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${ORG_NUM}</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID schemeID="0192">${ORG_NUM}</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Testveien 42</cbc:StreetName><cbc:CityName>Bergen</cbc:CityName><cbc:PostalZone>5003</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${ORG_NUM}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${ORG_NUM}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID schemeID="0192">123456785</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>Buyer Company AS</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Kjopergate 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>Buyer Company AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">123456785</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${VAT_AMT.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${NET.toFixed(2)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${VAT_AMT.toFixed(2)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${NET.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${DESCRIPTION}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET.toFixed(2)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

async function main() {
  console.log("=".repeat(70));
  console.log("  TASK 11: FULL 5-CALL FLOW WITH BOOKING");
  console.log("  POST supplier (with physicalAddress) -> GET account -> POST importDocument");
  console.log("  -> PUT sendToLedger=false -> PUT sendToLedger=true");
  console.log("=".repeat(70));

  // ============================================================
  // Step 1: POST /supplier (with physicalAddress + postalAddress)
  // ============================================================
  console.log("\n" + "=".repeat(50));
  console.log("STEP 1: POST /supplier (with physicalAddress)");
  console.log("=".repeat(50));
  const supRes = await api("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: ORG_NUM,
    postalAddress: {
      addressLine1: "Testveien 42",
      postalCode: "5003",
      city: "Bergen",
      country: { id: 161 },
    },
    physicalAddress: {
      addressLine1: "Testveien 42",
      postalCode: "5003",
      city: "Bergen",
      country: { id: 161 },
    },
    bankAccountPresentation: [{ bban: "12345678903" }],
  });
  if (supRes.status >= 400) {
    console.log("FATAL: Supplier creation failed");
    return;
  }
  const supplier = supRes.data?.value;
  const supplierId = supplier?.id;
  const supplierLedgerAccountId = supplier?.ledgerAccount?.id;
  console.log(`  Supplier ID: ${supplierId}`);
  console.log(`  Ledger Account ID: ${supplierLedgerAccountId}`);
  console.log(`  postalAddress: ${JSON.stringify(supplier?.postalAddress)}`);
  console.log(`  physicalAddress: ${JSON.stringify(supplier?.physicalAddress)}`);
  console.log(`  bankAccountPresentation: ${JSON.stringify(supplier?.bankAccountPresentation)}`);

  // ============================================================
  // Step 2: GET /ledger/account
  // ============================================================
  console.log("\n" + "=".repeat(50));
  console.log(`STEP 2: GET /ledger/account?number=${EXPENSE_ACCT}`);
  console.log("=".repeat(50));
  const accRes = await api("GET", `/ledger/account?number=${EXPENSE_ACCT}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccount = accRes.data?.values?.[0];
  const expenseAccountId = expenseAccount?.id;
  console.log(`  Account ID: ${expenseAccountId}, name: ${expenseAccount?.name}, number: ${expenseAccount?.number}`);
  if (!expenseAccountId) { console.log("FATAL: Account not found"); return; }

  // ============================================================
  // Step 3: POST /ledger/voucher/importDocument
  // ============================================================
  console.log("\n" + "=".repeat(50));
  console.log("STEP 3: POST /ledger/voucher/importDocument");
  console.log("=".repeat(50));
  const xml = makeXml();
  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
  const importRes = await api("POST", "/ledger/voucher/importDocument", form);
  // importDocument returns { values: [...] } NOT { value: ... }
  const importedVoucher = importRes.data?.values?.[0];
  const voucherId = importedVoucher?.id;
  let version = importedVoucher?.version;
  console.log(`  Voucher ID: ${voucherId}, version: ${version}`);
  console.log(`  number: ${importedVoucher?.number} (0 = unbooked)`);
  if (!voucherId) { console.log("FATAL: Import failed"); return; }

  // ============================================================
  // Step 4: PUT /ledger/voucher/{id}?sendToLedger=false (set postings)
  // ============================================================
  console.log("\n" + "=".repeat(50));
  console.log("STEP 4: PUT /ledger/voucher (sendToLedger=false) - set postings");
  console.log("=".repeat(50));
  const postingsBody = {
    version,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description: DESCRIPTION,
        vatType: { id: 1 }, // 25% incoming VAT
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
        invoiceNumber: INVOICE_NUM,
        termOfPayment: DATE,
      },
    ],
  };
  const postingsRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, postingsBody);
  if (postingsRes.status >= 400) {
    console.log("FATAL: Postings PUT failed");
    return;
  }
  const postingsVoucher = postingsRes.data?.value;
  version = postingsVoucher?.version;
  console.log(`  After postings: version=${version}, number=${postingsVoucher?.number}`);
  console.log(`  Postings count: ${postingsVoucher?.postings?.length}`);
  for (const p of postingsVoucher?.postings || []) {
    console.log(`    row=${p.row} account=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id}/${p.vatType?.name} supplier=${p.supplier?.id || 'n/a'}`);
  }

  // ============================================================
  // Step 5: PUT /ledger/voucher/{id}?sendToLedger=true (BOOK)
  // ============================================================
  console.log("\n" + "=".repeat(50));
  console.log("STEP 5: PUT /ledger/voucher (sendToLedger=true) - BOOK");
  console.log("=".repeat(50));
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, { version });
  if (bookRes.status >= 400) {
    console.log("FATAL: Booking PUT failed");
    return;
  }
  const bookedVoucher = bookRes.data?.value;
  version = bookedVoucher?.version;
  console.log(`  After booking: version=${version}, number=${bookedVoucher?.number}`);
  console.log(`  numberAsString: ${bookedVoucher?.numberAsString}`);
  console.log(`  BOOKED = ${(bookedVoucher?.number || 0) > 0 ? "YES" : "NO"}`);

  // ============================================================
  // Verification: GET /supplierInvoice to find the created SI
  // ============================================================
  console.log("\n" + "=".repeat(50));
  console.log("VERIFICATION: GET /supplierInvoice (find created SI)");
  console.log("=".repeat(50));
  // dateTo is exclusive - must use date+1
  const nextDate = "2026-03-23";
  const siRes = await api("GET", `/supplierInvoice?invoiceNumber=${INVOICE_NUM}&invoiceDateFrom=${DATE}&invoiceDateTo=${nextDate}&fields=*,voucher(*),supplier(*)`);
  const siList = siRes.data?.values || [];
  console.log(`  Found ${siList.length} supplier invoice(s)`);

  if (siList.length > 0) {
    const si = siList[0];
    console.log("\n--- Supplier Invoice Full State ---");
    console.log(JSON.stringify(si, null, 2));
  }

  // ============================================================
  // Verification: GET /ledger/voucher/{id} with full fields
  // ============================================================
  console.log("\n" + "=".repeat(50));
  console.log("VERIFICATION: GET /ledger/voucher (full readback)");
  console.log("=".repeat(50));
  const voucherRes = await api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*, account(*), vatType(*), supplier(*))`);
  if (voucherRes.status < 400) {
    const v = voucherRes.data?.value;
    console.log("\n--- Voucher Full State ---");
    console.log(`  id: ${v?.id}`);
    console.log(`  number: ${v?.number}`);
    console.log(`  numberAsString: ${v?.numberAsString}`);
    console.log(`  version: ${v?.version}`);
    console.log(`  description: ${v?.description}`);
    console.log(`  date: ${v?.date}`);
    console.log(`  type: ${JSON.stringify(v?.type)}`);
    console.log(`  postings (${v?.postings?.length}):`);
    for (const p of v?.postings || []) {
      console.log(`    row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} amtGross=${p.amountGross} vat=${p.vatType?.id}/${p.vatType?.name} supp=${p.supplier?.id||'n/a'} inv=${p.invoiceNumber||'n/a'} term=${p.termOfPayment||'n/a'}`);
    }
  }

  // ============================================================
  // Verification: GET /supplier/{id} readback (verify physicalAddress)
  // ============================================================
  console.log("\n" + "=".repeat(50));
  console.log("VERIFICATION: GET /supplier (check physicalAddress)");
  console.log("=".repeat(50));
  const suppReadback = await api("GET", `/supplier/${supplierId}?fields=*,postalAddress(*),physicalAddress(*)`);
  if (suppReadback.status < 400) {
    const s = suppReadback.data?.value;
    console.log(`  name: ${s?.name}`);
    console.log(`  organizationNumber: ${s?.organizationNumber}`);
    console.log(`  postalAddress: ${JSON.stringify(s?.postalAddress)}`);
    console.log(`  physicalAddress: ${JSON.stringify(s?.physicalAddress)}`);
    console.log(`  bankAccountPresentation: ${JSON.stringify(s?.bankAccountPresentation)}`);
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log("\n" + "=".repeat(70));
  console.log("  SUMMARY");
  console.log("=".repeat(70));
  const booked = (bookedVoucher?.number || 0) > 0;
  console.log(`  Supplier created: YES (id=${supplierId})`);
  console.log(`  physicalAddress set: ${suppReadback.data?.value?.physicalAddress?.addressLine1 ? 'YES' : 'NO'}`);
  console.log(`  postalAddress set: ${suppReadback.data?.value?.postalAddress?.addressLine1 ? 'YES' : 'NO'}`);
  console.log(`  bankAccount set: ${(suppReadback.data?.value?.bankAccountPresentation?.length || 0) > 0 ? 'YES' : 'NO'}`);
  console.log(`  Voucher booked: ${booked ? 'YES' : 'NO'} (number=${bookedVoucher?.number})`);
  console.log(`  Supplier Invoice found: ${siList.length > 0 ? 'YES' : 'NO'}`);
  console.log(`  Total API calls: 5 (core) + 3 (verification)`);
}

main().catch(console.error);
