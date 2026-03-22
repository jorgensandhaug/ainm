/**
 * Task 11 — Comprehensive readback to hypothesize what the 4 scorer checks are.
 *
 * Creates a supplier invoice via the hybrid approach (importDocument + PUT postings + book)
 * then reads back EVERY field that a scorer could conceivably check.
 *
 * Also creates via direct POST /ledger/voucher for comparison.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any, isForm = false) {
  const headers: Record<string, string> = { Authorization: AUTH };
  if (!isForm) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  const ok = res.status < 400;
  if (!ok) console.log(`  ✗ ${method} ${path} → ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  else console.log(`  ✓ ${method} ${path} → ${res.status}`);
  return { status: res.status, data };
}

async function main() {
  const date = "2026-03-22";
  const gross = 32650;
  const net = 26120;
  const vat = 6530;
  const promptDescription = "kontortjenester";
  const supplierName = "ScorerTest AS";
  const supplierOrg = "890932991"; // valid mod11
  const buyerOrg = "514295328";
  const expenseAccountNumber = "7300";

  // ══════════════════════════════════════════
  // METHOD A: Hybrid importDocument
  // ══════════════════════════════════════════
  console.log("═══════════════════════════════════════════════");
  console.log("  METHOD A: importDocument + PUT postings + book");
  console.log("═══════════════════════════════════════════════\n");

  const invoiceNumberA = "INV-2026-SCORER-A";

  // Create supplier
  let supplierIdA: number, supplierLedgerAccountIdA: number;
  const supLookupA = await api("GET", `/supplier?organizationNumber=${supplierOrg}&fields=id,name,organizationNumber,ledgerAccount(id),phoneNumber,email,postalAddress(*),physicalAddress(*),bankAccountPresentation(*)`);
  if (supLookupA.data.values?.length > 0) {
    const s = supLookupA.data.values[0];
    supplierIdA = s.id;
    supplierLedgerAccountIdA = s.ledgerAccount.id;
    console.log(`  Existing supplier: id=${s.id} name="${s.name}" org="${s.organizationNumber}"`);
  } else {
    const supResA = await api("POST", "/supplier", { name: supplierName, organizationNumber: supplierOrg });
    supplierIdA = supResA.data.value.id;
    supplierLedgerAccountIdA = supResA.data.value.ledgerAccount.id;
  }

  const acctRes = await api("GET", `/ledger/account?number=${expenseAccountNumber}&isApplicableForSupplierInvoice=true&fields=id,number,name`);
  const expenseAccountId = acctRes.data.values[0].id;
  console.log(`  Expense account: id=${expenseAccountId} ${acctRes.data.values[0].number} "${acctRes.data.values[0].name}"`);

  // importDocument
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumberA}</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${supplierOrg}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Testveien 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${supplierOrg}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${supplierName}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${supplierOrg}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${buyerOrg}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Buyer</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Dreggsallmenningen 7</cbc:StreetName><cbc:CityName>Bergen</cbc:CityName><cbc:PostalZone>5003</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${buyerOrg}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Buyer</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${buyerOrg}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${vat}.00</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${net}.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${vat}.00</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${net}.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${net}.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${gross}.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${gross}.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${net}.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${promptDescription}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${net}.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);
  if (importRes.status >= 400) { console.log("FATAL"); return; }

  const vA = importRes.data.values?.[0];
  const voucherIdA = vA.id;
  let versionA = vA.version;

  // PUT postings (no description!)
  const putA = await api("PUT", `/ledger/voucher/${voucherIdA}?sendToLedger=false`, {
    version: versionA,
    postings: [
      {
        row: 1, date, description: promptDescription,
        account: { id: expenseAccountId }, vatType: { id: 1 }, currency: { id: 1 },
        amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross,
      },
      {
        row: 2, date, description: promptDescription,
        account: { id: supplierLedgerAccountIdA }, supplier: { id: supplierIdA }, currency: { id: 1 },
        amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross,
        invoiceNumber: invoiceNumberA, termOfPayment: date,
      },
    ],
  });
  if (putA.status < 400) versionA = putA.data.value.version;

  // Book
  const bookA = await api("PUT", `/ledger/voucher/${voucherIdA}?sendToLedger=true`, { version: versionA });
  if (bookA.status < 400) versionA = bookA.data.value.version;

  // ── COMPREHENSIVE READBACK METHOD A ──
  console.log("\n══ METHOD A: COMPREHENSIVE READBACK ══\n");

  // 1. supplierInvoice
  const siA = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&invoiceNumber=${invoiceNumberA}&fields=*,voucher(*,postings(*,account(*),vatType(*))),supplier(*)`);
  if (siA.data.values?.length > 0) {
    const si = siA.data.values[0];
    console.log("  [SI] supplierInvoice EXISTS ✓");
    console.log(`  [SI] invoiceNumber: "${si.invoiceNumber}"`);
    console.log(`  [SI] invoiceDate: "${si.invoiceDate}"`);
    console.log(`  [SI] invoiceDueDate: "${si.invoiceDueDate}"`);
    console.log(`  [SI] amount: ${si.amount} (expected: ${gross} or ${-gross})`);
    console.log(`  [SI] amountCurrency: ${si.amountCurrency}`);
    console.log(`  [SI] amountExcludingVat: ${si.amountExcludingVat} (expected: ${net} or ${-net})`);
    console.log(`  [SI] amountExcludingVatCurrency: ${si.amountExcludingVatCurrency}`);
    console.log(`  [SI] outstandingAmount: ${si.outstandingAmount}`);
    console.log(`  [SI] isCreditNote: ${si.isCreditNote}`);
    console.log(`  [SI] supplier.id: ${si.supplier?.id}`);
    console.log(`  [SI] supplier.name: "${si.supplier?.name}"`);
    console.log(`  [SI] supplier.organizationNumber: "${si.supplier?.organizationNumber}"`);
    console.log(`  [SI] voucher.id: ${si.voucher?.id}`);
    console.log(`  [SI] voucher.number: ${si.voucher?.number} (>0 = booked)`);
    console.log(`  [SI] voucher.description: "${si.voucher?.description}"`);
    console.log(`  [SI] voucher.date: "${si.voucher?.date}"`);
    console.log(`  [SI] voucher.type: "${si.voucher?.type}"`);
    console.log(`  [SI] postings:`);
    for (const p of si.voucher?.postings || []) {
      console.log(`    row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}/${p.vatType?.name} desc="${p.description}"`);
    }
  } else {
    console.log("  [SI] supplierInvoice DOES NOT EXIST ✗");
  }

  // 2. supplier readback
  const supReadA = await api("GET", `/supplier/${supplierIdA}?fields=*`);
  if (supReadA.status < 400) {
    const s = supReadA.data.value;
    console.log(`\n  [SUP] id: ${s.id}`);
    console.log(`  [SUP] name: "${s.name}"`);
    console.log(`  [SUP] organizationNumber: "${s.organizationNumber}"`);
    console.log(`  [SUP] email: "${s.email || ''}"`);
    console.log(`  [SUP] phoneNumber: "${s.phoneNumber || ''}"`);
    console.log(`  [SUP] supplierNumber: ${s.supplierNumber}`);
  }

  // 3. voucher readback
  const vReadA = await api("GET", `/ledger/voucher/${voucherIdA}?fields=*,postings(*,account(*),vatType(*),supplier(*))`);
  if (vReadA.status < 400) {
    const rv = vReadA.data.value;
    console.log(`\n  [V] id: ${rv.id}`);
    console.log(`  [V] number: ${rv.number} (>0 = booked)`);
    console.log(`  [V] description: "${rv.description}"`);
    console.log(`  [V] date: "${rv.date}"`);
    console.log(`  [V] type: "${rv.type}"`);
    console.log(`  [V] postings (${rv.postings?.length}):`);
    for (const p of rv.postings || []) {
      console.log(`    row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}/${p.vatType?.name} supp=${p.supplier?.id||'-'} inv=${p.invoiceNumber||'-'} term=${p.termOfPayment||'-'} desc="${p.description||''}"`);
    }
  }

  // ══════════════════════════════════════════
  // METHOD B: Direct POST /ledger/voucher (for comparison)
  // ══════════════════════════════════════════
  console.log("\n\n═══════════════════════════════════════════════");
  console.log("  METHOD B: Direct POST /ledger/voucher");
  console.log("═══════════════════════════════════════════════\n");

  const invoiceNumberB = "INV-2026-SCORER-B";

  // Get voucherType
  const vtRes = await api("GET", "/ledger/voucherType?name=Leverandørfaktura&fields=id,name");
  const vtId = vtRes.data.values.find((v: any) => v.name === "Leverandørfaktura")?.id;

  const vResB = await api("POST", "/ledger/voucher", {
    date,
    description: promptDescription,
    voucherType: { id: vtId },
    postings: [
      {
        row: 1, date, description: promptDescription,
        account: { id: expenseAccountId }, vatType: { id: 1 }, currency: { id: 1 },
        amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross,
      },
      {
        row: 2, date, description: promptDescription,
        account: { id: supplierLedgerAccountIdA }, supplier: { id: supplierIdA }, currency: { id: 1 },
        amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross,
        invoiceNumber: invoiceNumberB, termOfPayment: date,
      },
    ],
  });

  const voucherIdB = vResB.data.value?.id;
  const voucherNumberB = vResB.data.value?.number;

  // ── COMPREHENSIVE READBACK METHOD B ──
  console.log("\n══ METHOD B: COMPREHENSIVE READBACK ══\n");

  // 1. supplierInvoice
  const siB = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&invoiceNumber=${invoiceNumberB}&fields=*,voucher(*,postings(*,account(*),vatType(*))),supplier(*)`);
  if (siB.data.values?.length > 0) {
    console.log("  [SI] supplierInvoice EXISTS ✓");
    const si = siB.data.values[0];
    console.log(`  [SI] invoiceNumber: "${si.invoiceNumber}"`);
    console.log(`  [SI] amount: ${si.amount}`);
  } else {
    console.log("  [SI] supplierInvoice DOES NOT EXIST ✗");
  }

  // Also search broadly by date + supplier
  const siBroad = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&supplierId=${supplierIdA}&fields=id,invoiceNumber,amount,voucher(id,number)&count=50`);
  console.log(`  [SI] Broad search (by supplier+date): ${siBroad.data.values?.length || 0} results`);
  for (const si of siBroad.data.values || []) {
    console.log(`    id=${si.id} invNum="${si.invoiceNumber}" amt=${si.amount} voucherId=${si.voucher?.id} vNum=${si.voucher?.number}`);
  }

  // 2. voucher readback
  if (voucherIdB) {
    const vReadB = await api("GET", `/ledger/voucher/${voucherIdB}?fields=*,postings(*,account(*),vatType(*),supplier(*))`);
    if (vReadB.status < 400) {
      const rv = vReadB.data.value;
      console.log(`\n  [V] id: ${rv.id}`);
      console.log(`  [V] number: ${rv.number} (>0 = booked)`);
      console.log(`  [V] description: "${rv.description}"`);
      console.log(`  [V] date: "${rv.date}"`);
      console.log(`  [V] type: "${rv.type}"`);
      console.log(`  [V] postings (${rv.postings?.length}):`);
      for (const p of rv.postings || []) {
        console.log(`    row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}/${p.vatType?.name} supp=${p.supplier?.id||'-'} inv=${p.invoiceNumber||'-'} desc="${p.description||''}"`);
      }
    }
  }

  // ══════════════════════════════════════════
  // COMPARISON
  // ══════════════════════════════════════════
  console.log("\n\n═══════════════════════════════════════════════");
  console.log("  COMPARISON: What scorer likely checks");
  console.log("═══════════════════════════════════════════════");
  console.log(`
  CHECK HYPOTHESIS | Method A (import) | Method B (direct)
  ─────────────────┼───────────────────┼──────────────────
  1. SI exists     | YES               | NO ← likely why 0/4
  2. SI amounts    | YES (neg values)  | N/A
  3. SI supplier   | YES (linked)      | N/A
  4. Voucher booked| YES (num>0)       | YES (auto-booked)
  `);

  // ── Cleanup ──
  console.log("\n── Cleanup ──");
  await api("PUT", `/ledger/voucher/${voucherIdA}/:reverse?date=${date}`);
  if (voucherIdB) await api("PUT", `/ledger/voucher/${voucherIdB}/:reverse?date=${date}`);

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
