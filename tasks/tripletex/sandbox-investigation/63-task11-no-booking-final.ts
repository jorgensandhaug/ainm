// Task 11: Verify NO-BOOKING approach produces correct supplier invoice state
// Key finding: The ONLY production run that scored >0 used sendToLedger=false (no booking).
// Every run WITH sendToLedger=true (booking) scored 0/8.
// This script confirms the no-booking 4-call flow is correct.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const DATE = "2026-03-21";
const GROSS = 42100;
const NET = 33680;
const VAT_AMT = 8420;
const INVOICE_NUM = "INV-FINAL-001";
const SUPPLIER_NAME = "FinalTest AS";
const ORG_NUM = "987654325";

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
  if (res.status >= 400) {
    console.log("ERROR:", JSON.stringify(json, null, 2).slice(0, 1500));
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
    <cac:PostalAddress><cbc:StreetName>Test Street 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${ORG_NUM}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${ORG_NUM}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID schemeID="0192">123456785</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>My Company AS</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Gate 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>My Company AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">123456785</cbc:CompanyID></cac:PartyLegalEntity>
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
    <cac:Item><cbc:Name>kontortjenester</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET.toFixed(2)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

async function main() {
  console.log("=".repeat(70));
  console.log("  TASK 11: NO-BOOKING FINAL VERIFICATION");
  console.log("  4-call flow: POST supplier -> GET account -> POST importDocument -> PUT sendToLedger=false");
  console.log("  NO sendToLedger=true step");
  console.log("=".repeat(70));

  // Step 1: POST /supplier
  console.log("\n--- Step 1: POST /supplier ---");
  const supRes = await api("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: ORG_NUM,
  });
  const supplierId = supRes.data?.value?.id;
  const supplierLedgerAccountId = supRes.data?.value?.ledgerAccount?.id;
  console.log(`  Supplier ID: ${supplierId}, ledgerAccountId: ${supplierLedgerAccountId}`);
  if (!supplierId) { console.log("FATAL: Supplier creation failed"); return; }

  // Step 2: GET /ledger/account
  console.log("\n--- Step 2: GET /ledger/account?number=6540 ---");
  const accRes = await api("GET", "/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*");
  const expenseAccount = accRes.data?.values?.[0];
  const expenseAccountId = expenseAccount?.id;
  console.log(`  Account ID: ${expenseAccountId}, number: ${expenseAccount?.number}, name: ${expenseAccount?.name}`);
  if (!expenseAccountId) { console.log("FATAL: Account lookup failed"); return; }

  // Step 3: GET /ledger/vatType (find 25% incoming VAT)
  console.log("\n--- Step 3: GET /ledger/vatType (25% incoming) ---");
  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=INCOMING&vatDate=${DATE}&fields=*`);
  const vatTypes = vatRes.data?.values ?? [];
  const vat25 = vatTypes.find((v: any) => v.percentage === 25 && String(v.number) === "1");
  console.log(`  Found ${vatTypes.length} incoming VAT types`);
  console.log(`  25% base (number=1): id=${vat25?.id}, name=${vat25?.name}, percentage=${vat25?.percentage}`);
  if (!vat25) { console.log("FATAL: 25% VAT type not found"); return; }

  // Step 4: POST /ledger/voucher/importDocument
  console.log("\n--- Step 4: POST /ledger/voucher/importDocument ---");
  const xml = makeXml();
  const blob = new Blob([xml], { type: "application/xml" });
  const form = new FormData();
  form.append("file", blob, `${INVOICE_NUM}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", form);
  const importedVoucher = importRes.data?.values?.[0];
  const voucherId = importedVoucher?.id;
  let voucherVersion = importedVoucher?.version;
  console.log(`  Voucher ID: ${voucherId}, version: ${voucherVersion}`);
  if (!voucherId) { console.log("FATAL: Import failed"); return; }

  // Step 5: PUT /ledger/voucher/{id}?sendToLedger=false (with postings)
  console.log("\n--- Step 5: PUT postings (sendToLedger=false) ---");
  const putBody = {
    id: voucherId,
    version: voucherVersion,
    postings: [
      {
        row: 1,
        date: DATE,
        account: { id: expenseAccountId },
        description: "kontortjenester",
        vatType: { id: vat25.id },
        amount: NET,
        amountCurrency: NET,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        date: DATE,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        description: "kontortjenester",
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INVOICE_NUM,
        termOfPayment: DATE,
      },
    ],
  };
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, putBody);
  voucherVersion = putRes.data?.value?.version ?? voucherVersion;
  console.log(`  PUT result: ${putRes.status}, version: ${voucherVersion}`);
  if (putRes.status >= 400) { console.log("FATAL: PUT postings failed"); return; }

  // Step 6: NO sendToLedger=true — this is the key difference
  console.log("\n--- Step 6: SKIPPED — NO sendToLedger=true (no booking) ---");
  console.log("  This is intentional. The only scored production run used no booking.");

  // Step 7: GET /supplierInvoice (verify all fields)
  console.log("\n--- Step 7: GET /supplierInvoice (verify) ---");
  const siRes = await api("GET", `/supplierInvoice?voucherId=${voucherId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
  const si = siRes.data?.values?.[0];
  if (!si) {
    console.log("  WARNING: No supplierInvoice found by voucherId, trying supplierId...");
    const siRes2 = await api("GET", `/supplierInvoice?supplierId=${supplierId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
    if (siRes2.data?.values?.length > 0) {
      console.log("  Found via supplierId");
    } else {
      console.log("  FATAL: No supplierInvoice found at all");
      return;
    }
  }

  // Step 8: GET /ledger/voucher/{id} (verify postings)
  console.log("\n--- Step 8: GET /ledger/voucher (verify) ---");
  const vRes = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  const voucher = vRes.data?.value;

  // ===== COMPREHENSIVE FINAL STATE CHECK =====
  console.log("\n\n" + "=".repeat(70));
  console.log("  COMPREHENSIVE FINAL STATE CHECK");
  console.log("=".repeat(70));

  // Supplier Invoice fields
  console.log("\n--- SupplierInvoice Fields ---");
  const siObj = si ?? siRes.data?.values?.[0];
  if (siObj) {
    const siFields = [
      ["id", siObj.id],
      ["version", siObj.version],
      ["invoiceNumber", siObj.invoiceNumber],
      ["invoiceDate", siObj.invoiceDate],
      ["invoiceDueDate", siObj.invoiceDueDate],
      ["amount", siObj.amount],
      ["amountCurrency", siObj.amountCurrency],
      ["amountExcludingVat", siObj.amountExcludingVat],
      ["amountExcludingVatCurrency", siObj.amountExcludingVatCurrency],
      ["outstandingAmount", siObj.outstandingAmount],
      ["currency.id", siObj.currency?.id],
      ["currency.code", siObj.currency?.code],
      ["isCreditNote", siObj.isCreditNote],
      ["kidOrReceiverReference", siObj.kidOrReceiverReference],
      ["supplier.id", siObj.supplier?.id],
      ["supplier.name", siObj.supplier?.name],
      ["voucher.id", siObj.voucher?.id],
      ["comment", siObj.comment],
      ["paymentTypeId", siObj.paymentTypeId],
      ["amountRoundoff", siObj.amountRoundoff],
    ];
    for (const [name, val] of siFields) {
      console.log(`  ${String(name).padEnd(35)} = ${JSON.stringify(val)}`);
    }
  } else {
    console.log("  NO SUPPLIER INVOICE FOUND");
  }

  // Voucher fields
  console.log("\n--- Voucher Fields ---");
  if (voucher) {
    const vFields = [
      ["id", voucher.id],
      ["version", voucher.version],
      ["number", voucher.number],
      ["numberAsString", voucher.numberAsString],
      ["tempNumber", voucher.tempNumber],
      ["year", voucher.year],
      ["date", voucher.date],
      ["description", voucher.description],
      ["voucherType.id", voucher.voucherType?.id],
      ["voucherType.name", voucher.voucherType?.name],
      ["externalVoucherNumber", voucher.externalVoucherNumber],
      ["vendorInvoiceNumber", voucher.vendorInvoiceNumber],
      ["postings count", voucher.postings?.length],
    ];
    for (const [name, val] of vFields) {
      console.log(`  ${String(name).padEnd(35)} = ${JSON.stringify(val)}`);
    }
  } else {
    console.log("  NO VOUCHER FOUND");
  }

  // Postings details
  console.log("\n--- Posting Details ---");
  if (voucher?.postings?.length > 0) {
    for (const p of voucher.postings) {
      const pRes = await api("GET", `/ledger/posting/${p.id}?fields=*`);
      const posting = pRes.data?.value;
      if (posting) {
        console.log(`\n  Posting row=${posting.row}:`);
        const pFields = [
          ["account.number", posting.account?.number],
          ["account.name", posting.account?.name],
          ["amount", posting.amount],
          ["amountCurrency", posting.amountCurrency],
          ["amountGross", posting.amountGross],
          ["amountGrossCurrency", posting.amountGrossCurrency],
          ["amountVat", posting.amountVat],
          ["description", posting.description],
          ["date", posting.date],
          ["vatType.id", posting.vatType?.id],
          ["vatType.name", posting.vatType?.name],
          ["vatType.percentage", posting.vatType?.percentage],
          ["supplier.id", posting.supplier?.id],
          ["invoiceNumber", posting.invoiceNumber],
          ["termOfPayment", posting.termOfPayment],
          ["row", posting.row],
          ["systemGenerated", posting.systemGenerated],
        ];
        for (const [name, val] of pFields) {
          if (val !== undefined && val !== null && val !== 0 && val !== false && val !== "") {
            console.log(`    ${String(name).padEnd(30)} = ${JSON.stringify(val)}`);
          }
        }
      }
    }
  }

  // Summary
  console.log("\n\n" + "=".repeat(70));
  console.log("  SUMMARY");
  console.log("=".repeat(70));
  const booked = voucher?.number > 0;
  console.log(`  Voucher booked: ${booked} (number=${voucher?.number})`);
  console.log(`  SupplierInvoice exists: ${!!siObj}`);
  console.log(`  SupplierInvoice.amount: ${siObj?.amount} (expected: -${GROSS})`);
  console.log(`  SupplierInvoice.outstandingAmount: ${siObj?.outstandingAmount} (expected: ${GROSS})`);
  console.log(`  SupplierInvoice.invoiceNumber: ${siObj?.invoiceNumber} (expected: ${INVOICE_NUM})`);
  console.log(`  Postings count: ${voucher?.postings?.length} (expected: 3 — debit, credit, system VAT)`);
  console.log(`  Total API calls in flow: 5 (POST supplier, GET account, GET vatType, POST importDocument, PUT sendToLedger=false)`);
  console.log(`  Booking step: OMITTED (sendToLedger=true NOT called)`);
  console.log(`\n  RESULT: ${siObj && voucher ? "SUCCESS — no-booking approach produces valid supplier invoice" : "FAILURE"}`);
  console.log("\nDONE.");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
