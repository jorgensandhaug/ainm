/**
 * Task 11 — Production-realistic test.
 * 1. Create a FRESH supplier (unique name+org)
 * 2. importDocument with same org in XML
 * 3. PUT postings (no description)
 * 4. Book
 * 5. Full readback to confirm all 4 hypothesized checks pass
 *
 * Also need to find the company's org number (for buyer in XML).
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

// Valid mod11 org numbers we haven't used much
// 981448294, 848657514, 938165742 — all from production prompts, valid mod11
const SUPPLIER_ORG = "938165742";
const SUPPLIER_NAME = "FreshImport GmbH";

async function main() {
  const date = "2026-03-22";
  const gross = 70400;
  const net = 56320;
  const vat = 14080;
  const invoiceNumber = "INV-2026-FRESH1";
  const promptDescription = "Bürodienstleistungen"; // German, from actual production prompt
  const expenseAccountNumber = "6590";

  // ── Step 0: Get company org number ──
  console.log("── Step 0: Get company org ──");
  const whoRes = await api("GET", "/token/session/%3EwhoAmI");
  let buyerOrg = "514295328"; // fallback
  if (whoRes.status < 400) {
    const companyId = whoRes.data.value?.company?.id;
    if (companyId) {
      const coRes = await api("GET", `/company/${companyId}?fields=organizationNumber,name`);
      if (coRes.status < 400) {
        buyerOrg = coRes.data.value.organizationNumber;
        console.log(`  Company: "${coRes.data.value.name}" org=${buyerOrg}`);
      }
    }
  }

  // ── Step 1: Create supplier ──
  console.log("\n── Step 1: Create supplier ──");
  // First check if it exists (to avoid duplication)
  const supLookup = await api("GET", `/supplier?organizationNumber=${SUPPLIER_ORG}&fields=id,name,ledgerAccount(id)`);
  let supplierId: number, supplierLedgerAccountId: number;
  if (supLookup.data.values?.length === 1) {
    supplierId = supLookup.data.values[0].id;
    supplierLedgerAccountId = supLookup.data.values[0].ledgerAccount.id;
    console.log(`  Using existing supplier: id=${supplierId} name="${supLookup.data.values[0].name}"`);
    console.log(`  WARNING: ${supLookup.data.values.length} supplier(s) with this org — matching should work if exactly 1`);
  } else if (supLookup.data.values?.length > 1) {
    console.log(`  WARNING: ${supLookup.data.values.length} suppliers with org ${SUPPLIER_ORG}!`);
    console.log(`  Using first one: id=${supLookup.data.values[0].id} name="${supLookup.data.values[0].name}"`);
    supplierId = supLookup.data.values[0].id;
    supplierLedgerAccountId = supLookup.data.values[0].ledgerAccount.id;
  } else {
    const supRes = await api("POST", "/supplier", { name: SUPPLIER_NAME, organizationNumber: SUPPLIER_ORG });
    supplierId = supRes.data.value.id;
    supplierLedgerAccountId = supRes.data.value.ledgerAccount.id;
    console.log(`  Created: id=${supplierId}`);
  }

  // ── Step 2: Get expense account ──
  console.log("\n── Step 2: Get expense account ──");
  const acctRes = await api("GET", `/ledger/account?number=${expenseAccountNumber}&isApplicableForSupplierInvoice=true&fields=id,number,name`);
  const expenseAccountId = acctRes.data.values[0].id;
  console.log(`  Account: ${acctRes.data.values[0].number} "${acctRes.data.values[0].name}"`);

  // ── Step 3: importDocument ──
  console.log("\n── Step 3: importDocument ──");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${SUPPLIER_ORG}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Teststr 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${SUPPLIER_ORG}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${SUPPLIER_ORG}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${buyerOrg}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Buyer</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>X</cbc:StreetName><cbc:CityName>Bergen</cbc:CityName><cbc:PostalZone>5003</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
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
  if (importRes.status >= 400) { console.log("FATAL: import failed"); return; }

  const v = importRes.data.values?.[0];
  const voucherId = v.id;
  let version = v.version;
  console.log(`  Voucher: id=${voucherId} v=${version} desc="${v.description}"`);
  console.log(`  Supplier matched: ${v.description.includes("Ukjent") ? "NO ✗" : "YES ✓"}`);

  // ── Step 4: PUT postings ──
  console.log("\n── Step 4: PUT postings ──");
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version,
    postings: [
      {
        row: 1, date, description: promptDescription,
        account: { id: expenseAccountId }, vatType: { id: 1 }, currency: { id: 1 },
        amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross,
      },
      {
        row: 2, date, description: promptDescription,
        account: { id: supplierLedgerAccountId }, supplier: { id: supplierId }, currency: { id: 1 },
        amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross,
        invoiceNumber, termOfPayment: date,
      },
    ],
  });
  if (putRes.status < 400) version = putRes.data.value.version;

  // ── Step 5: Book ──
  console.log("\n── Step 5: Book ──");
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, { version });
  if (bookRes.status < 400) {
    version = bookRes.data.value.version;
    console.log(`  Booked: number=${bookRes.data.value.number}`);
  }

  // ═══════════════════════════════════════════════
  // SCORER CHECK READBACK
  // ═══════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════");
  console.log("  SCORER CHECK READBACK");
  console.log("═══════════════════════════════════════════════");

  // Read supplierInvoice with ALL fields
  const siRes = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&invoiceNumber=${invoiceNumber}&fields=*,voucher(*,postings(*,account(*),vatType(*))),supplier(*)`);

  if (siRes.data.values?.length > 0) {
    const si = siRes.data.values[0];

    console.log("\n  ── CHECK 1 HYPOTHESIS: supplierInvoice exists with correct invoiceNumber ──");
    console.log(`  invoiceNumber: "${si.invoiceNumber}" expected: "${invoiceNumber}"`);
    console.log(`  MATCH: ${si.invoiceNumber === invoiceNumber ? "YES ✓" : "NO ✗"}`);

    console.log("\n  ── CHECK 2 HYPOTHESIS: Correct amounts ──");
    console.log(`  amount: ${si.amount} (abs=${Math.abs(si.amount)}) expected gross: ${gross}`);
    console.log(`  amountExcludingVat: ${si.amountExcludingVat} (abs=${Math.abs(si.amountExcludingVat)}) expected net: ${net}`);
    console.log(`  outstandingAmount: ${si.outstandingAmount} expected: ${gross}`);
    console.log(`  AMOUNT MATCH: ${Math.abs(si.amount) === gross ? "YES ✓" : "NO ✗"}`);

    console.log("\n  ── CHECK 3 HYPOTHESIS: Supplier linked correctly ──");
    console.log(`  supplier.id: ${si.supplier?.id} expected: ${supplierId}`);
    console.log(`  supplier.name: "${si.supplier?.name}"`);
    console.log(`  supplier.organizationNumber: "${si.supplier?.organizationNumber}" expected: "${SUPPLIER_ORG}"`);
    console.log(`  SUPPLIER MATCH: ${si.supplier?.organizationNumber === SUPPLIER_ORG ? "YES ✓" : "NO ✗"}`);

    console.log("\n  ── CHECK 4 HYPOTHESIS: Voucher booked with correct postings ──");
    console.log(`  voucher.number: ${si.voucher?.number} (>0 = booked)`);
    console.log(`  BOOKED: ${(si.voucher?.number || 0) > 0 ? "YES ✓" : "NO ✗"}`);
    const postings = si.voucher?.postings || [];
    const debit = postings.find((p: any) => p.account?.number === expenseAccountNumber);
    const credit = postings.find((p: any) => p.account?.number === "2400");
    const vatPosting = postings.find((p: any) => p.account?.number === "2710");
    console.log(`  Debit posting (${expenseAccountNumber}): amt=${debit?.amount} gross=${debit?.amountGross} vat=${debit?.vatType?.id}`);
    console.log(`  Credit posting (2400): amt=${credit?.amount} gross=${credit?.amountGross}`);
    console.log(`  VAT posting (2710): amt=${vatPosting?.amount}`);
    console.log(`  POSTINGS OK: ${debit && credit && vatPosting ? "YES ✓" : "NO ✗"}`);

    console.log("\n  ── ALTERNATIVE CHECK HYPOTHESES ──");
    console.log(`  voucher.description: "${si.voucher?.description}"`);
    console.log(`  invoiceDate: "${si.invoiceDate}"`);
    console.log(`  invoiceDueDate: "${si.invoiceDueDate}"`);
    console.log(`  isCreditNote: ${si.isCreditNote}`);
    console.log(`  currency.id: ${si.currency?.id}`);
  } else {
    console.log("\n  supplierInvoice NOT FOUND ✗✗✗");
  }

  // Also check supplier directly
  const supRead = await api("GET", `/supplier/${supplierId}?fields=*`);
  if (supRead.status < 400) {
    const s = supRead.data.value;
    console.log(`\n  ── SUPPLIER READBACK ──`);
    console.log(`  name: "${s.name}" expected: "${SUPPLIER_NAME}"`);
    console.log(`  organizationNumber: "${s.organizationNumber}" expected: "${SUPPLIER_ORG}"`);
    console.log(`  supplierNumber: ${s.supplierNumber}`);
  }

  // ── Cleanup ──
  console.log("\n── Cleanup ──");
  await api("PUT", `/ledger/voucher/${voucherId}/:reverse?date=${date}`);

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
