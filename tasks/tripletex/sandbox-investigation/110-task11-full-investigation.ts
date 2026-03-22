/**
 * Task 11 — Full investigation. Find company org number, test importDocument,
 * and understand exactly what state the scorer sees.
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
  // ── Find company org number ──
  console.log("── Finding company org number ──");
  const coRes = await api("GET", "/company/108114337?fields=id,name,organizationNumber,type");
  if (coRes.status < 400) {
    const co = coRes.data.value;
    console.log(`  Company: "${co.name}" org="${co.organizationNumber}" type=${co.type}`);
  }

  // Also try from customers (the company might be listed as a customer in its own system)
  const custRes = await api("GET", "/customer?isMe=true&fields=id,name,organizationNumber");

  // Look at existing invoices to infer the buyer org number from imported XML
  console.log("\n── Checking existing imported invoices for buyer org ──");
  const existingSI = await api("GET", "/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2026-12-31&count=1&fields=*");
  if (existingSI.data.values?.length > 0) {
    const si = existingSI.data.values[0];
    // Get the voucher detail to see the original import document
    const vRes = await api("GET", `/ledger/voucher/${si.voucher?.id}?fields=*,postings(*,account(*),vatType(*),supplier(*))`);
    if (vRes.status < 400) {
      const v = vRes.data.value;
      console.log(`  Voucher: id=${v.id} desc="${v.description}" date=${v.date} type=${v.type}`);
      console.log(`  Document: ${JSON.stringify(v.document || 'none')}`);
      for (const p of v.postings || []) {
        console.log(`    row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}/${p.vatType?.name} supp=${p.supplier?.id||'-'}`);
      }
    }
  }

  // ── The production runs use a proxy — the proxy provides a different org number per run ──
  // Let me check what org numbers exist in invoices from production runs
  console.log("\n── Checking ALL supplierInvoice fields for analysis ──");
  const siAll = await api("GET", "/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2026-12-31&count=3&fields=*,voucher(*),supplier(*)");
  if (siAll.data.values?.length > 0) {
    for (const si of siAll.data.values) {
      console.log(`\n  === SupplierInvoice id=${si.id} ===`);
      for (const [k, v] of Object.entries(si).sort()) {
        if (k === 'voucher' || k === 'supplier') continue;
        if (v !== null && v !== undefined && v !== '' && v !== 0 && v !== false) {
          console.log(`    ${k}: ${JSON.stringify(v)}`);
        }
      }
      console.log(`    supplier: id=${si.supplier?.id} name="${si.supplier?.name}" org="${si.supplier?.organizationNumber}"`);
      console.log(`    voucher: id=${si.voucher?.id} number=${si.voucher?.number} desc="${si.voucher?.description}"`);
    }
  }

  // ── Try creating a supplierInvoice via POST with pre-created voucher ──
  console.log("\n══════════════════════════════════════════");
  console.log("  TEST: Create voucher first, then POST /supplierInvoice");
  console.log("══════════════════════════════════════════");

  const date = "2026-03-22";
  const gross = 50000;
  const net = 40000;

  // Create supplier
  const supRes = await api("POST", "/supplier", {
    name: "Method Test AS",
    organizationNumber: "912834571", // valid mod11
  });
  let supplierId: number, supplierLedgerAccountId: number;
  if (supRes.status < 400) {
    supplierId = supRes.data.value.id;
    supplierLedgerAccountId = supRes.data.value.ledgerAccount.id;
  } else {
    // Might already exist
    const lookup = await api("GET", "/supplier?organizationNumber=912834571&fields=id,ledgerAccount(id)");
    supplierId = lookup.data.values[0].id;
    supplierLedgerAccountId = lookup.data.values[0].ledgerAccount.id;
  }

  // Get account + voucher type
  const acctRes = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=id");
  const expenseAccountId = acctRes.data.values[0].id;

  const vtRes = await api("GET", "/ledger/voucherType?name=Leverandørfaktura&fields=id,name");
  const vtId = vtRes.data.values.find((v: any) => v.name === "Leverandørfaktura")?.id;

  // Create voucher (unbooked initially?) or booked?
  const vRes = await api("POST", "/ledger/voucher", {
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
        invoiceNumber: "INV-METHOD-TEST-001",
        termOfPayment: date,
      },
    ],
  });

  const voucherId = vRes.data.value?.id;
  const voucherNumber = vRes.data.value?.number;
  console.log(`  Voucher created: id=${voucherId} number=${voucherNumber} (booked=${voucherNumber > 0})`);

  // Now try to create a supplierInvoice referencing this voucher
  console.log("\n  Trying POST /supplierInvoice with voucher reference...");
  const siRes = await api("POST", "/supplierInvoice", {
    invoiceNumber: "INV-METHOD-TEST-001",
    invoiceDate: date,
    invoiceDueDate: date,
    supplier: { id: supplierId },
    voucher: { id: voucherId },
    amountCurrency: gross,
    currency: { id: 1 },
  });

  if (siRes.status < 400) {
    console.log("  SUCCESS! SupplierInvoice created");
    console.log(JSON.stringify(siRes.data.value, null, 2).slice(0, 500));
  }

  // Try without voucher reference
  console.log("\n  Trying POST /supplierInvoice without voucher...");
  const siRes2 = await api("POST", "/supplierInvoice", {
    invoiceNumber: "INV-METHOD-TEST-002",
    invoiceDate: date,
    invoiceDueDate: date,
    supplier: { id: supplierId },
    currency: { id: 1 },
  });

  if (siRes2.status < 400) {
    console.log("  SUCCESS! SupplierInvoice created without voucher");
    console.log(JSON.stringify(siRes2.data.value, null, 2).slice(0, 500));
  }

  // Check if our direct voucher shows up in supplierInvoice search
  console.log("\n  Checking if direct voucher created a supplierInvoice...");
  const siSearch = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&supplierId=${supplierId}&fields=*&count=50`);
  console.log(`  Found ${siSearch.data.values?.length || 0} supplierInvoice(s)`);
  for (const si of siSearch.data.values || []) {
    console.log(`    id=${si.id} invNum="${si.invoiceNumber}" amount=${si.amount} voucherId=${si.voucher?.id}`);
  }

  // Also try voucherId-based search
  if (voucherId) {
    const siByVoucher = await api("GET", `/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-01-01&voucherId=${voucherId}&fields=*`);
    console.log(`\n  SI search by voucherId=${voucherId}: ${siByVoucher.data.values?.length || 0} result(s)`);
  }

  // ── Cleanup ──
  console.log("\n── Cleanup ──");
  if (voucherId) await api("PUT", `/ledger/voucher/${voucherId}/:reverse?date=${date}`);

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
