// Compare: no-booking (sendToLedger=false only) vs booking (sendToLedger=true)
// Key question: does BOOKING change supplierInvoice fields the scorer checks?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

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
    console.log("ERROR:", JSON.stringify(json, null, 2).slice(0, 1200));
  }
  return { status: res.status, data: json };
}

const DATE = "2026-03-21";
const GROSS = 42100;
const NET = 33680;
const VAT = 8420;

function makeXml(supplierName: string, org: string, invoiceNum: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNum}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${org}</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID schemeID="0192">${org}</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Test Street 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${org}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${supplierName}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${org}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID schemeID="0192">999999999</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>My Company AS</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Gate 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>My Company AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${VAT.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${NET.toFixed(2)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${VAT.toFixed(2)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${NET.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Office supplies</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET.toFixed(2)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

interface ApproachResult {
  si: any;
  voucher: any;
  postings: any[];
  voucherId: number | null;
  siId: number | null;
}

async function runApproach(label: string, supplierName: string, org: string, invoiceNum: string, options: {
  addDescription: boolean;
  addDateToPostings: boolean;
  bookIt: boolean;
}): Promise<ApproachResult> {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  APPROACH ${label}: ${options.bookIt ? "WITH BOOKING" : "NO BOOKING"}`);
  console.log(`${"=".repeat(70)}\n`);

  // 1. Create supplier
  console.log("--- Step 1: Create supplier ---");
  const supRes = await api("POST", "/supplier", { name: supplierName, organizationNumber: org });
  const supplierId = supRes.data?.value?.id;
  const supplierLedgerAccountId = supRes.data?.value?.ledgerAccount?.id;
  console.log(`  Supplier ID: ${supplierId}, ledgerAccountId: ${supplierLedgerAccountId}`);

  // 2. Get expense account 6540
  console.log("\n--- Step 2: Get account 6540 ---");
  const accRes = await api("GET", "/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*");
  const expenseAccount = accRes.data?.values?.[0];
  const expenseAccountId = expenseAccount?.id;
  console.log(`  Account ID: ${expenseAccountId}, number: ${expenseAccount?.number}`);

  // 3. Import EHF document
  console.log("\n--- Step 3: Import EHF via importDocument ---");
  const xml = makeXml(supplierName, org, invoiceNum);
  const blob = new Blob([xml], { type: "application/xml" });
  const form = new FormData();
  form.append("file", blob, `${invoiceNum}.xml`);
  if (options.addDescription) {
    form.append("description", `import-${invoiceNum}`);
    console.log(`  Added FormData description: import-${invoiceNum}`);
  }
  const importRes = await api("POST", "/ledger/voucher/importDocument", form);
  const importedVoucher = importRes.data?.values?.[0] ?? importRes.data?.value;
  const voucherId = importedVoucher?.id;
  let voucherVersion = importedVoucher?.version;
  console.log(`  Voucher ID: ${voucherId}, version: ${voucherVersion}`);
  if (!voucherId) {
    console.log("  FATAL: Import failed");
    return { si: null, voucher: null, postings: [], voucherId: null, siId: null };
  }

  // 4. PUT postings with sendToLedger=false
  // Row >= 1 to avoid system-generated row 0
  // amountGross = NET for debit (expense), VAT is auto-calculated by vatType
  // amountGross = -GROSS for credit (supplier account)
  console.log("\n--- Step 4: PUT postings (sendToLedger=false) ---");
  const debitPosting: any = {
    row: 1,
    account: { id: expenseAccountId },
    description: "Office supplies",
    vatType: { id: 1 }, // 25% MVA
    amount: NET,
    amountCurrency: NET,
    amountGross: GROSS,
    amountGrossCurrency: GROSS,
  };
  const creditPosting: any = {
    row: 2,
    account: { id: supplierLedgerAccountId },
    supplier: { id: supplierId },
    description: "Office supplies",
    amount: -GROSS,
    amountCurrency: -GROSS,
    amountGross: -GROSS,
    amountGrossCurrency: -GROSS,
    invoiceNumber: invoiceNum,
    termOfPayment: DATE,
  };

  if (options.addDateToPostings) {
    debitPosting.date = DATE;
    creditPosting.date = DATE;
    console.log("  Added date to each posting");
  }

  const putBody = {
    id: voucherId,
    version: voucherVersion,
    postings: [debitPosting, creditPosting],
  };

  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, putBody);
  console.log(`  PUT result: ${putRes.status}`);
  voucherVersion = putRes.data?.value?.version ?? voucherVersion;

  // 5. Optionally book it
  if (options.bookIt) {
    console.log("\n--- Step 5: BOOK (sendToLedger=true) with version only ---");
    const bookBody = {
      id: voucherId,
      version: voucherVersion,
    };
    const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, bookBody);
    console.log(`  Book result: ${bookRes.status}`);
    voucherVersion = bookRes.data?.value?.version ?? voucherVersion;
    if (bookRes.status >= 400) {
      console.log("  BOOKING FAILED - continuing");
    } else {
      console.log(`  BOOKED! Version: ${voucherVersion}`);
    }
  } else {
    console.log("\n--- Step 5: SKIPPED (no booking) ---");
  }

  // 6. Find supplier invoice
  console.log("\n--- Step 6: Find supplierInvoice ---");
  const dateRange = `&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31`;
  const siSearchRes = await api("GET", `/supplierInvoice?voucherId=${voucherId}${dateRange}&fields=*`);
  let siId: number | undefined;

  if (siSearchRes.data?.values?.length > 0) {
    siId = siSearchRes.data.values[0].id;
    console.log(`  Found SI: ${siId}`);
  } else {
    console.log("  Not found by voucherId, trying supplierId...");
    const siSearch2 = await api("GET", `/supplierInvoice?supplierId=${supplierId}${dateRange}&fields=*`);
    if (siSearch2.data?.values?.length > 0) {
      siId = siSearch2.data.values[0].id;
      console.log(`  Found SI: ${siId}`);
    } else {
      console.log("  NO SUPPLIER INVOICE FOUND");
    }
  }

  // 7. Get full SI details
  let siFull: any = null;
  if (siId) {
    console.log("\n--- Step 7: GET supplierInvoice full ---");
    const siFullRes = await api("GET", `/supplierInvoice/${siId}?fields=*`);
    siFull = siFullRes.data?.value;
    console.log(JSON.stringify(siFull, null, 2));
  }

  // 8. Get full voucher with posting details
  console.log("\n--- Step 8: GET voucher + postings full ---");
  const vFullRes = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  const vFull = vFullRes.data?.value;
  console.log(JSON.stringify(vFull, null, 2));

  // Get full posting details
  let postingsFull: any[] = [];
  if (vFull?.postings?.length > 0) {
    const postingIds = vFull.postings.map((p: any) => p.id).join(",");
    console.log(`\n  Fetching full posting details for IDs: ${postingIds}`);
    // Fetch each posting individually with fields=*
    for (const p of vFull.postings) {
      const pRes = await api("GET", `/ledger/posting/${p.id}?fields=*`);
      if (pRes.data?.value) {
        postingsFull.push(pRes.data.value);
        console.log(`  Posting ${p.id}: acct=${pRes.data.value.account?.number} amount=${pRes.data.value.amount} amountGross=${pRes.data.value.amountGross} date=${pRes.data.value.date} row=${pRes.data.value.row}`);
      }
    }
  }

  return { si: siFull, voucher: vFull, postings: postingsFull, voucherId, siId: siId ?? null };
}

async function main() {
  // Approach A: No booking, with description and date on postings (winning run style)
  const resultA = await runApproach(
    "A (NO BOOKING)",
    "NoBook Test A AS",
    "987654325",
    "INV-NBOOK-A",
    { addDescription: true, addDateToPostings: true, bookIt: false }
  );

  // Approach B: With booking, no description, no date on postings (standard style)
  const resultB = await runApproach(
    "B (WITH BOOKING)",
    "Book Test B AS",
    "987654317",
    "INV-BOOK-B",
    { addDescription: false, addDateToPostings: false, bookIt: true }
  );

  // === COMPARISON ===
  console.log("\n\n" + "=".repeat(70));
  console.log("  SIDE-BY-SIDE COMPARISON");
  console.log("=".repeat(70));

  function getNestedValue(obj: any, path: string): any {
    if (!obj) return undefined;
    return path.split(".").reduce((v, p) => v?.[p], obj);
  }

  // ---- SI comparison ----
  if (resultA.si || resultB.si) {
    const fields = [
      "version", "invoiceNumber", "invoiceDate", "invoiceDueDate",
      "amount", "amountCurrency", "amountExcludingVat", "amountExcludingVatCurrency",
      "outstandingAmount", "kidOrReceiverReference",
      "currency.id", "isCreditNote",
    ];
    console.log("\n--- SupplierInvoice comparison (excluding IDs) ---");
    console.log(`${"Field".padEnd(40)} | ${"A (no book)".padEnd(25)} | ${"B (booked)".padEnd(25)}`);
    console.log("-".repeat(95));
    for (const f of fields) {
      const vA = getNestedValue(resultA.si, f);
      const vB = getNestedValue(resultB.si, f);
      const diff = JSON.stringify(vA) !== JSON.stringify(vB) ? " <-- DIFF" : "";
      console.log(`${f.padEnd(40)} | ${String(vA ?? "").padEnd(25)} | ${String(vB ?? "").padEnd(25)}${diff}`);
    }

    // Semantic diffs only
    console.log("\n--- ALL SI semantic diffs (ignoring IDs) ---");
    const allKeys = [...new Set([
      ...Object.keys(resultA.si ?? {}),
      ...Object.keys(resultB.si ?? {}),
    ])].sort();
    const idFields = new Set(["id", "url", "voucher", "supplier", "orderLines", "approvalListElements", "originalInvoiceDocumentId"]);
    let diffCount = 0;
    for (const k of allKeys) {
      if (idFields.has(k)) continue;
      const sA = JSON.stringify(resultA.si?.[k]);
      const sB = JSON.stringify(resultB.si?.[k]);
      if (sA !== sB) {
        diffCount++;
        console.log(`  DIFF ${k}: A=${sA?.slice(0, 120)} | B=${sB?.slice(0, 120)}`);
      }
    }
    if (diffCount === 0) console.log("  NONE -- SI fields are semantically IDENTICAL");
  }

  // ---- Voucher comparison ----
  if (resultA.voucher || resultB.voucher) {
    console.log("\n--- Voucher comparison (excluding IDs) ---");
    const fields = ["version", "number", "year", "description", "date", "tempNumber", "numberAsString", "wasAutoMatched", "externalVoucherNumber", "vendorInvoiceNumber"];
    console.log(`${"Field".padEnd(30)} | ${"A (no book)".padEnd(40)} | ${"B (booked)".padEnd(40)}`);
    console.log("-".repeat(115));
    for (const f of fields) {
      const vA = resultA.voucher?.[f];
      const vB = resultB.voucher?.[f];
      const diff = JSON.stringify(vA) !== JSON.stringify(vB) ? " <-- DIFF" : "";
      console.log(`${f.padEnd(30)} | ${String(vA ?? "").padEnd(40)} | ${String(vB ?? "").padEnd(40)}${diff}`);
    }
  }

  // ---- Posting comparison ----
  console.log("\n--- Posting comparison ---");
  console.log(`  A postings: ${resultA.postings.length}, B postings: ${resultB.postings.length}`);
  for (let i = 0; i < Math.max(resultA.postings.length, resultB.postings.length); i++) {
    const pA = resultA.postings[i];
    const pB = resultB.postings[i];
    console.log(`\n  Posting ${i}:`);
    if (pA) console.log(`    A: acct=${pA.account?.number} amount=${pA.amount} amountGross=${pA.amountGross} date=${pA.date} row=${pA.row} desc="${pA.description}"`);
    if (pB) console.log(`    B: acct=${pB.account?.number} amount=${pB.amount} amountGross=${pB.amountGross} date=${pB.date} row=${pB.row} desc="${pB.description}"`);
    if (pA && pB) {
      const allPKeys = [...new Set([...Object.keys(pA), ...Object.keys(pB)])].sort();
      const skipKeys = new Set(["id", "url", "voucher"]);
      for (const pk of allPKeys) {
        if (skipKeys.has(pk)) continue;
        const pvA = JSON.stringify(pA[pk]);
        const pvB = JSON.stringify(pB[pk]);
        if (pvA !== pvB) {
          console.log(`    DIFF ${pk}: A=${pvA?.slice(0, 100)} B=${pvB?.slice(0, 100)}`);
        }
      }
    }
  }

  // ---- KEY FINDING ----
  console.log("\n\n" + "=".repeat(70));
  console.log("  KEY FINDING");
  console.log("=".repeat(70));
  const aNumber = resultA.voucher?.number;
  const bNumber = resultB.voucher?.number;
  const aNumberStr = resultA.voucher?.numberAsString;
  const bNumberStr = resultB.voucher?.numberAsString;
  console.log(`  A voucher.number: ${aNumber} (${aNumberStr})`);
  console.log(`  B voucher.number: ${bNumber} (${bNumberStr})`);
  console.log(`  A voucher.tempNumber: ${resultA.voucher?.tempNumber}`);
  console.log(`  B voucher.tempNumber: ${resultB.voucher?.tempNumber}`);
  if (aNumber === 0 && bNumber === 0) {
    console.log("  --> BOTH unbooked (number=0). Booking B failed.");
  } else if (bNumber > 0 && aNumber === 0) {
    console.log("  --> B is BOOKED (has real number), A is NOT. This is the key difference.");
  }

  console.log("\n\nDONE.");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
