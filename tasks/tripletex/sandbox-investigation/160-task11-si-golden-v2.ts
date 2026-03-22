/**
 * Golden pipeline for T11 using POST /supplierInvoice.
 * Full E2E: create supplier → get account → POST supplierInvoice → PUT voucher (book)
 * Then audit ALL state the scorer could check.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path.substring(0, 80)} → ${res.status}`);
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  // Simulate T11 prompt: French, supplier Lumière SARL, 72350 NOK gross, account 6300, 25% VAT
  const supplierName = "Lumière SARL";
  const orgNumber = "913175212";
  const invoiceNumber = "INV-2026-7606";
  const description = "services de bureau";
  const invoiceDate = "2026-03-22";
  const dueDate = "2026-04-21";
  const gross = 72350;
  const net = Math.round((gross * 100) / 125); // 57880
  const vat = gross - net; // 14470

  console.log(`=== T11 GOLDEN PIPELINE (POST /supplierInvoice) ===`);
  console.log(`gross=${gross} net=${net} vat=${vat}`);

  // CALL 1: POST /supplier
  const sRes = await api("POST", "/supplier", { name: supplierName, organizationNumber: orgNumber });
  if (!sRes.ok) { console.error("FAIL:", JSON.stringify(sRes.data).substring(0, 300)); return; }
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;
  console.log(`  supplier id=${supplierId} ledgerAcct=${supplierLedger}`);

  // CALL 2: GET /ledger/account
  const acctRes = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*");
  if (!acctRes.ok) { console.error("FAIL:", JSON.stringify(acctRes.data).substring(0, 300)); return; }
  const expAcctId = acctRes.data.values[0].id;
  console.log(`  expense account 6300: id=${expAcctId}`);

  // CALL 3: POST /supplierInvoice
  const siRes = await api("POST", "/supplierInvoice", {
    invoiceNumber: invoiceNumber,
    invoiceDate: invoiceDate,
    invoiceDueDate: dueDate,
    supplier: { id: supplierId },
    amountCurrency: -gross,
    voucher: {
      date: invoiceDate,
      description: description,
      postings: [
        {
          row: 1,
          date: invoiceDate,
          description: description,
          account: { id: expAcctId },
          vatType: { id: 1 },
          amount: net,
          amountCurrency: net,
          amountGross: gross,
          amountGrossCurrency: gross,
        },
        {
          row: 2,
          date: invoiceDate,
          description: description,
          account: { id: supplierLedger },
          supplier: { id: supplierId },
          amount: -gross,
          amountCurrency: -gross,
          amountGross: -gross,
          amountGrossCurrency: -gross,
          invoiceNumber: invoiceNumber,
          termOfPayment: dueDate,
        },
      ],
    },
  });
  if (!siRes.ok) { console.error("SI FAIL:", JSON.stringify(siRes.data, null, 2).substring(0, 500)); return; }
  const si = siRes.data.value;
  const voucherId = si.voucher.id;
  console.log(`  SI id=${si.id} voucher.id=${voucherId}`);

  // CALL 4: PUT /ledger/voucher (book it — NO description field!)
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}`, {
    version: 3,
    voucherType: { name: "Leverandørfaktura" },
  });
  if (!putRes.ok) {
    console.error("PUT FAIL:", JSON.stringify(putRes.data).substring(0, 500));
    // Try with version from GET
    const getV = await api("GET", `/ledger/voucher/${voucherId}?fields=version`);
    console.log(`  version from GET: ${getV.data?.value?.version}`);
    return;
  }
  const voucher = putRes.data.value;
  console.log(`  Booked: number=${voucher.number} numberAsString="${voucher.numberAsString}"`);

  // ============ AUDIT ALL SCORER STATE ============
  console.log("\n=== FULL STATE AUDIT ===");

  // A: SupplierInvoice entity
  const siRead = await api("GET", `/supplierInvoice/${si.id}?fields=*`);
  if (siRead.ok) {
    const s = siRead.data.value;
    console.log("\n--- SupplierInvoice ---");
    for (const [k, v] of Object.entries(s)) {
      if (v !== null && v !== undefined) {
        console.log(`  ${k} = ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      }
    }
  }

  // B: Voucher entity
  const vRead = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  if (vRead.ok) {
    const v = vRead.data.value;
    console.log("\n--- Voucher ---");
    console.log(`  id=${v.id} number=${v.number} description="${v.description}"`);
    console.log(`  date=${v.date} voucherType=${JSON.stringify(v.voucherType)}`);
    console.log(`  vendorInvoiceNumber=${v.vendorInvoiceNumber}`);
    console.log(`  tempNumber=${v.tempNumber} numberAsString="${v.numberAsString}"`);
    console.log(`  supplierVoucherType=${v.supplierVoucherType}`);
    for (const p of v.postings || []) {
      console.log(`  posting: row=${p.row} acct=${p.account?.id}(${p.account?.number}) amt=${p.amount} amtGross=${p.amountGross} vatType=${p.vatType?.id}(${p.vatType?.number}) supplier=${p.supplier?.id||'-'} invoiceNum=${p.invoiceNumber||'-'} termOfPayment=${p.termOfPayment||'-'} desc="${p.description}"`);
    }
  }

  // C: Supplier entity
  const supRead = await api("GET", `/supplier/${supplierId}?fields=*`);
  if (supRead.ok) {
    const s = supRead.data.value;
    console.log("\n--- Supplier ---");
    console.log(`  id=${s.id} name="${s.name}" orgNumber=${s.organizationNumber}`);
    console.log(`  ledgerAccount=${JSON.stringify(s.ledgerAccount)}`);
  }

  // D: Compare with direct-voucher approach output
  console.log("\n=== COMPARISON: Direct POST /ledger/voucher ===");
  const directRes = await api("POST", "/ledger/voucher", {
    date: invoiceDate,
    description: description + " (direct)",
    voucherType: { name: "Leverandørfaktura" },
    postings: [
      { row: 1, date: invoiceDate, description: description, account: { id: expAcctId }, vatType: { id: 1 }, currency: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
      { row: 2, date: invoiceDate, description: description, account: { id: supplierLedger }, supplier: { id: supplierId }, currency: { id: 1 }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross, invoiceNumber: invoiceNumber, termOfPayment: dueDate },
    ],
  });
  if (directRes.ok) {
    const dv = directRes.data.value;
    console.log(`  Direct voucher: id=${dv.id} number=${dv.number} description="${dv.description}"`);
    // Check if supplierInvoice was created
    const directSI = await api("GET", `/supplierInvoice?voucherId=${dv.id}&fields=*`);
    console.log(`  supplierInvoice for direct voucher: count=${directSI.data.count || 0}`);
    if (directSI.data.values?.length) {
      const ds = directSI.data.values[0];
      console.log(`  SI id=${ds.id} invoiceNumber="${ds.invoiceNumber}" amount=${ds.amount} amountCurrency=${ds.amountCurrency}`);
    } else {
      console.log(`  NO supplierInvoice entity created by direct voucher!`);
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log("POST /supplierInvoice creates: SI entity + voucher (needs PUT to book)");
  console.log("POST /ledger/voucher creates: voucher only (auto-books, NO SI entity)");
  console.log("If scorer checks for SI entity, POST /supplierInvoice is required.");
}

main().catch(console.error);
