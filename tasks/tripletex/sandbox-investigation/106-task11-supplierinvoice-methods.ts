/**
 * Task 11 — Compare ALL methods for creating supplier invoices.
 *
 * Methods to test:
 * A. Direct POST /ledger/voucher (current playbook)
 * B. POST /ledger/voucher/importDocument (banned but previously used)
 * C. POST /supplierInvoice (if it exists — NOT /incomingInvoice which is BETA)
 *
 * For each, check:
 * 1. Does it create a supplierInvoice entity?
 * 2. What fields does the supplierInvoice have?
 * 3. Is the voucher booked?
 * 4. Is the description preserved?
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
  if (res.status >= 400) console.error(`  ERR ${method} ${path} → ${res.status}`, JSON.stringify(data).slice(0, 500));
  else console.log(`  ${method} ${path} → ${res.status}`);
  return { status: res.status, data };
}

async function main() {
  const date = "2026-03-22";
  const gross = 50000;
  const net = 40000;
  const expenseAcctNum = 6300;

  // Setup: get expense account + voucher type
  const acctRes = await api("GET", `/ledger/account?number=${expenseAcctNum}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccountId = acctRes.data.values[0].id;

  const vtRes = await api("GET", `/ledger/voucherType?name=Leverandørfaktura&fields=*`);
  const vtId = vtRes.data.values.find((v: any) => v.name === "Leverandørfaktura")?.id;

  // Get or create a supplier
  const supLookup = await api("GET", `/supplier?name=SI Test Supplier&fields=*`);
  let supplierId: number, supplierLedgerAccountId: number;
  if (supLookup.data.values?.length > 0) {
    supplierId = supLookup.data.values[0].id;
    supplierLedgerAccountId = supLookup.data.values[0].ledgerAccount.id;
  } else {
    const supRes = await api("POST", "/supplier", {
      name: "SI Test Supplier",
      organizationNumber: "984527318",
    });
    supplierId = supRes.data.value.id;
    supplierLedgerAccountId = supRes.data.value.ledgerAccount.id;
  }
  console.log(`  supplier=${supplierId} ledgerAcct=${supplierLedgerAccountId}\n`);

  const cleanup: number[] = [];

  // ══════════════════════════════════════════
  // METHOD C: POST /supplierInvoice  (try this first)
  // ══════════════════════════════════════════
  console.log("══════════════════════════════════════════");
  console.log("  METHOD C: POST /supplierInvoice");
  console.log("══════════════════════════════════════════\n");

  // First, let's see what the endpoint accepts
  const siRes = await api("POST", "/supplierInvoice", {
    invoiceNumber: "INV-C-001",
    invoiceDate: date,
    dueDate: date,
    supplier: { id: supplierId },
    amount: gross,
    amountCurrency: gross,
    currency: { id: 1 },
  });

  if (siRes.status < 400) {
    console.log("\n  SUCCESS! supplierInvoice created:");
    const si = siRes.data.value;
    console.log(`    id: ${si.id}`);
    console.log(`    invoiceNumber: "${si.invoiceNumber}"`);
    console.log(`    amount: ${si.amount}`);
    console.log(`    voucher: ${JSON.stringify(si.voucher)}`);

    // Check the voucher it created
    if (si.voucher?.id) {
      const vRes = await api("GET", `/ledger/voucher/${si.voucher.id}?fields=*,postings(*,account(*),vatType(*))`);
      if (vRes.status < 400) {
        const v = vRes.data.value;
        console.log(`\n    Voucher id=${v.id} number=${v.number} description="${v.description}"`);
        for (const p of v.postings || []) {
          console.log(`      row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}`);
        }
      }
    }
    cleanup.push(si.voucher?.id);
  } else {
    console.log("  POST /supplierInvoice FAILED");
  }

  // Try with more fields
  console.log("\n── Try POST /supplierInvoice with voucher + postings ──");
  const siRes2 = await api("POST", "/supplierInvoice", {
    invoiceNumber: "INV-C-002",
    invoiceDate: date,
    dueDate: date,
    supplier: { id: supplierId },
    amount: gross,
    amountCurrency: gross,
    currency: { id: 1 },
    description: "kontortjenester",
    voucher: {
      date,
      description: "kontortjenester",
      voucherType: { id: vtId },
    },
  });

  if (siRes2.status < 400) {
    const si = siRes2.data.value;
    console.log(`  SUCCESS! id=${si.id} invoiceNumber="${si.invoiceNumber}"`);
    console.log(`  voucher.id=${si.voucher?.id} description="${si.description || si.voucher?.description}"`);

    // Full readback
    const siRead = await api("GET", `/supplierInvoice/${si.id}?fields=*,voucher(*,postings(*,account(*),vatType(*))),supplier(*)`);
    if (siRead.status < 400) {
      const s = siRead.data.value;
      console.log(`\n  Full supplierInvoice state:`);
      for (const key of Object.keys(s)) {
        if (key !== 'voucher' && key !== 'supplier' && s[key] !== null && s[key] !== undefined) {
          console.log(`    ${key}: ${JSON.stringify(s[key])}`);
        }
      }
      if (s.voucher) {
        console.log(`\n  Voucher: id=${s.voucher.id} number=${s.voucher.number} desc="${s.voucher.description}"`);
        for (const p of s.voucher.postings || []) {
          console.log(`    row=${p.row} acct=${p.account?.number} amt=${p.amount} gross=${p.amountGross}`);
        }
      }
    }
    if (si.voucher?.id) cleanup.push(si.voucher.id);
  }

  // ── Try to understand what fields supplierInvoice needs ──
  console.log("\n── Try OPTIONS/GET on supplierInvoice to understand fields ──");

  // Check what fields exist on supplierInvoice via a generic search
  const siAll = await api("GET", `/supplierInvoice?supplierId=${supplierId}&count=50&fields=*`);
  if (siAll.data.values?.length > 0) {
    console.log(`\n  SupplierInvoice fields available (from existing entry):`);
    const sample = siAll.data.values[0];
    for (const [k, v] of Object.entries(sample)) {
      if (v !== null && v !== undefined) {
        console.log(`    ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      }
    }
  }

  // ══════════════════════════════════════════
  // METHOD B: importDocument (for comparison)
  // ══════════════════════════════════════════
  console.log("\n══════════════════════════════════════════");
  console.log("  METHOD B: POST /ledger/voucher/importDocument");
  console.log("══════════════════════════════════════════\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>INV-B-001</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">984527318</cbc:EndpointID>
    <cac:PartyName><cbc:Name>SI Test Supplier</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>X</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO984527318MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>SI Test Supplier</cbc:RegistrationName><cbc:CompanyID schemeID="0192">984527318</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Buyer</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>X</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>Buyer</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">10000</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${net}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">10000</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${net}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${gross}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${gross}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>kontortjenester</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${net}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);

  if (importRes.status < 400) {
    const importedVoucher = importRes.data.values?.[0];
    console.log(`  Voucher id=${importedVoucher?.id} number=${importedVoucher?.number} description="${importedVoucher?.description}"`);

    // Check supplierInvoice
    console.log("\n── Checking /supplierInvoice after importDocument ──");
    // Small delay to let async processing finish
    await new Promise(r => setTimeout(r, 2000));

    const siSearch = await api("GET", `/supplierInvoice?invoiceNumber=INV-B-001&invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&fields=*&count=50`);
    console.log(`  Found ${siSearch.data.values?.length || 0} supplierInvoice(s)`);
    for (const si of siSearch.data.values || []) {
      console.log(`    id=${si.id} invoiceNumber="${si.invoiceNumber}" amount=${si.amount}`);
    }

    // Also search broadly by supplier
    const siBySupplier2 = await api("GET", `/supplierInvoice?supplierId=${supplierId}&count=50&fields=*`);
    console.log(`  All SIs by supplier: ${siBySupplier2.data.values?.length || 0}`);
    for (const si of siBySupplier2.data.values || []) {
      console.log(`    id=${si.id} invoiceNumber="${si.invoiceNumber}" amount=${si.amount} voucherId=${si.voucher?.id}`);
    }

    if (importedVoucher?.id) cleanup.push(importedVoucher.id);
  }

  // ══════════════════════════════════════════
  // Cleanup
  // ══════════════════════════════════════════
  console.log("\n── Cleanup ──");
  for (const id of cleanup.reverse()) {
    if (id) await api("PUT", `/ledger/voucher/${id}/:reverse?date=2026-03-22`);
  }

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
