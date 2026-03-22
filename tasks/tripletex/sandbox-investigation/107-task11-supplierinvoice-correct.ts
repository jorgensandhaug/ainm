/**
 * Task 11 — Test POST /supplierInvoice with correct field names.
 * Schema shows: invoiceDueDate (not dueDate), amountCurrency (not amount).
 * Also test importDocument with valid org number to see if it creates a supplierInvoice.
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
  console.log(`  ${ok ? '✓' : '✗'} ${method} ${path} → ${res.status}`);
  if (!ok) console.log(`    ${JSON.stringify(data).slice(0, 500)}`);
  return { status: res.status, data };
}

async function main() {
  const date = "2026-03-22";
  const gross = 50000;
  const net = 40000;
  const expenseAcctNum = 6300;

  // Setup
  const acctRes = await api("GET", `/ledger/account?number=${expenseAcctNum}&isApplicableForSupplierInvoice=true&fields=id,number`);
  const expenseAccountId = acctRes.data.values[0].id;

  const vtRes = await api("GET", `/ledger/voucherType?name=Leverandørfaktura&fields=id,name`);
  const vtId = vtRes.data.values.find((v: any) => v.name === "Leverandørfaktura")?.id;

  // Get or create supplier
  let supplierId: number, supplierLedgerAccountId: number;
  const supLookup = await api("GET", `/supplier?organizationNumber=984527318&fields=id,name,ledgerAccount(id)`);
  if (supLookup.data.values?.length > 0) {
    supplierId = supLookup.data.values[0].id;
    supplierLedgerAccountId = supLookup.data.values[0].ledgerAccount.id;
    console.log(`  Using existing supplier ${supplierId}`);
  } else {
    const supRes = await api("POST", "/supplier", {
      name: "Testleverandor AS",
      organizationNumber: "984527318",
    });
    supplierId = supRes.data.value.id;
    supplierLedgerAccountId = supRes.data.value.ledgerAccount.id;
  }

  const cleanup: number[] = [];

  // ══════════════════════════════════════════
  // TEST 1: POST /supplierInvoice with correct fields
  // ══════════════════════════════════════════
  console.log("\n══════════════════════════════════════════");
  console.log("  TEST 1: POST /supplierInvoice (minimal)");
  console.log("══════════════════════════════════════════");

  const si1 = await api("POST", "/supplierInvoice", {
    invoiceNumber: "INV-T1-001",
    invoiceDate: date,
    invoiceDueDate: date,
    supplier: { id: supplierId },
    amountCurrency: gross,
    currency: { id: 1 },
  });

  if (si1.status < 400) {
    const si = si1.data.value;
    console.log(`    id=${si.id} invoiceNumber="${si.invoiceNumber}" amount=${si.amount}`);
    console.log(`    voucher: ${JSON.stringify(si.voucher)}`);

    // Full readback
    const read = await api("GET", `/supplierInvoice/${si.id}?fields=*,voucher(*,postings(*)),supplier(*)`);
    if (read.status < 400) {
      const s = read.data.value;
      console.log(`\n    Full SI readback:`);
      console.log(`      invoiceNumber: "${s.invoiceNumber}"`);
      console.log(`      invoiceDate: ${s.invoiceDate}`);
      console.log(`      invoiceDueDate: ${s.invoiceDueDate}`);
      console.log(`      amount: ${s.amount}`);
      console.log(`      amountCurrency: ${s.amountCurrency}`);
      console.log(`      supplier: id=${s.supplier?.id} name="${s.supplier?.name}"`);
      console.log(`      voucher: id=${s.voucher?.id} number=${s.voucher?.number} desc="${s.voucher?.description}"`);
      if (s.voucher?.postings?.length) {
        console.log(`      postings (${s.voucher.postings.length}):`);
        for (const p of s.voucher.postings) {
          console.log(`        row=${p.row} acct=${p.account?.id} amt=${p.amount} gross=${p.amountGross}`);
        }
      }
    }
    if (si.voucher?.id) cleanup.push(si.voucher.id);
    else cleanup.push(-si.id); // flag for SI cleanup
  }

  // ══════════════════════════════════════════
  // TEST 2: POST /supplierInvoice with voucher + postings
  // ══════════════════════════════════════════
  console.log("\n══════════════════════════════════════════");
  console.log("  TEST 2: POST /supplierInvoice with voucher + postings");
  console.log("══════════════════════════════════════════");

  const si2 = await api("POST", "/supplierInvoice", {
    invoiceNumber: "INV-T2-001",
    invoiceDate: date,
    invoiceDueDate: date,
    supplier: { id: supplierId },
    amountCurrency: gross,
    currency: { id: 1 },
    voucher: {
      date,
      description: "kontortjenester",
      voucherType: { id: vtId },
      postings: [
        {
          row: 1, date, description: "kontortjenester",
          account: { id: expenseAccountId },
          vatType: { id: 1 },
          currency: { id: 1 },
          amount: net, amountCurrency: net,
          amountGross: gross, amountGrossCurrency: gross,
        },
        {
          row: 2, date, description: "kontortjenester",
          account: { id: supplierLedgerAccountId },
          supplier: { id: supplierId },
          currency: { id: 1 },
          amount: -gross, amountCurrency: -gross,
          amountGross: -gross, amountGrossCurrency: -gross,
          invoiceNumber: "INV-T2-001",
          termOfPayment: date,
        },
      ],
    },
  });

  if (si2.status < 400) {
    const si = si2.data.value;
    console.log(`    id=${si.id} invoiceNumber="${si.invoiceNumber}" amount=${si.amount}`);
    console.log(`    voucher: id=${si.voucher?.id} number=${si.voucher?.number}`);

    const read = await api("GET", `/supplierInvoice/${si.id}?fields=*,voucher(*,postings(*,account(*),vatType(*))),supplier(*)`);
    if (read.status < 400) {
      const s = read.data.value;
      console.log(`\n    Full SI readback:`);
      console.log(`      invoiceNumber: "${s.invoiceNumber}"`);
      console.log(`      amount: ${s.amount} (auto-calculated)`);
      console.log(`      amountCurrency: ${s.amountCurrency}`);
      console.log(`      amountExcludingVat: ${s.amountExcludingVat}`);
      console.log(`      supplier: id=${s.supplier?.id} name="${s.supplier?.name}"`);
      console.log(`      voucher: id=${s.voucher?.id} number=${s.voucher?.number} desc="${s.voucher?.description}"`);
      if (s.voucher?.postings?.length) {
        console.log(`      postings (${s.voucher.postings.length}):`);
        for (const p of s.voucher.postings) {
          console.log(`        row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}`);
        }
      }
    }
    if (si.voucher?.id) cleanup.push(si.voucher.id);
  }

  // ══════════════════════════════════════════
  // TEST 3: POST supplierInvoice/voucher/{id}/postings (PUT debit postings)
  // ══════════════════════════════════════════
  console.log("\n══════════════════════════════════════════");
  console.log("  TEST 3: Create SI minimal, then PUT postings separately");
  console.log("══════════════════════════════════════════");

  const si3 = await api("POST", "/supplierInvoice", {
    invoiceNumber: "INV-T3-001",
    invoiceDate: date,
    invoiceDueDate: date,
    supplier: { id: supplierId },
    amountCurrency: gross,
    currency: { id: 1 },
  });

  if (si3.status < 400) {
    const si = si3.data.value;
    const voucherId = si.voucher?.id;
    console.log(`    SI id=${si.id} voucherId=${voucherId}`);

    if (voucherId) {
      // Try PUT /supplierInvoice/voucher/{id}/postings (BETA)
      const putPostings = await api("PUT", `/supplierInvoice/voucher/${voucherId}/postings`, [
        {
          account: { id: expenseAccountId },
          description: "kontortjenester",
          vatType: { id: 1 },
          amount: net,
          amountCurrency: net,
          amountGross: gross,
          amountGrossCurrency: gross,
        },
      ]);

      if (putPostings.status < 400) {
        console.log("    Postings updated via BETA endpoint!");
        // Readback
        const read3 = await api("GET", `/supplierInvoice/${si.id}?fields=*,voucher(*,postings(*,account(*),vatType(*))),supplier(*)`);
        if (read3.status < 400) {
          const s = read3.data.value;
          console.log(`      amount: ${s.amount}, amountExcVat: ${s.amountExcludingVat}`);
          console.log(`      voucher: number=${s.voucher?.number} desc="${s.voucher?.description}"`);
          for (const p of s.voucher?.postings || []) {
            console.log(`      row=${p.row} acct=${p.account?.number} amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}`);
          }
        }
      }
      cleanup.push(voucherId);
    }
  }

  // ══════════════════════════════════════════
  // TEST 4: importDocument with valid org number
  // ══════════════════════════════════════════
  console.log("\n══════════════════════════════════════════");
  console.log("  TEST 4: importDocument → check if supplierInvoice created");
  console.log("══════════════════════════════════════════");

  // Use a real-format Norwegian org number (must pass mod11)
  // 984527318 is valid mod11
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>INV-T4-IMPORT-001</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">984527318</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Testleverandor AS</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Testveien 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO984527318MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Testleverandor AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">984527318</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">925068262</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Jansen Konsult AS</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Dreggsallmenningen 7</cbc:StreetName><cbc:CityName>Bergen</cbc:CityName><cbc:PostalZone>5003</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>Jansen Konsult AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">925068262</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">10000.00</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${net}.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">10000.00</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${net}.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${net}.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${gross}.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${gross}.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${net}.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>kontortjenester</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${net}.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);

  if (importRes.status < 400) {
    const v = importRes.data.values?.[0];
    console.log(`    Voucher id=${v?.id} number=${v?.number} desc="${v?.description}"`);

    // Check if a supplierInvoice was auto-created
    await new Promise(r => setTimeout(r, 2000));
    const siSearch = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&supplierId=${supplierId}&fields=*,voucher(*),supplier(*)&count=50`);
    console.log(`    supplierInvoices found: ${siSearch.data.values?.length || 0}`);
    for (const si of siSearch.data.values || []) {
      console.log(`      id=${si.id} invNum="${si.invoiceNumber}" amount=${si.amount} voucherId=${si.voucher?.id} desc="${si.voucher?.description || ''}"`);
    }

    if (v?.id) cleanup.push(v.id);
  }

  // ══════════════════════════════════════════
  // Cleanup
  // ══════════════════════════════════════════
  console.log("\n── Cleanup ──");
  for (const id of cleanup.reverse()) {
    if (id > 0) {
      await api("PUT", `/ledger/voucher/${id}/:reverse?date=2026-03-22`);
    }
  }

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
