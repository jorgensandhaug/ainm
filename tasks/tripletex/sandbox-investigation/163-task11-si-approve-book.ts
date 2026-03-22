const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path.substring(0, 90)} → ${res.status}`);
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  // Create a fresh SI
  const sRes = await api("POST", "/supplier", { name: "ApproveTest AS", organizationNumber: "823456786" });
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;

  const siRes = await api("POST", "/supplierInvoice", {
    invoiceNumber: "INV-APPROVE-1",
    invoiceDate: "2026-03-22",
    invoiceDueDate: "2026-04-21",
    supplier: { id: supplierId },
    amountCurrency: -12500,
    voucher: {
      date: "2026-03-22",
      description: "approve test",
      postings: [
        { row: 1, date: "2026-03-22", description: "approve test", account: { id: expAcctId }, vatType: { id: 1 }, amount: 10000, amountCurrency: 10000, amountGross: 12500, amountGrossCurrency: 12500 },
        { row: 2, date: "2026-03-22", description: "approve test", account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -12500, amountCurrency: -12500, amountGross: -12500, amountGrossCurrency: -12500 },
      ],
    },
  });
  if (!siRes.ok) { console.error("SI FAIL:", JSON.stringify(siRes.data).substring(0, 300)); return; }
  const si = siRes.data.value;
  const siId = si.id;
  const voucherId = si.voucher.id;
  console.log(`SI id=${siId} voucher=${voucherId}`);
  console.log(`  BEFORE: amount=${si.amount} amountCurrency=${si.amountCurrency} amountExcludingVat=${si.amountExcludingVat} outstanding=${si.outstandingAmount}`);

  // Try all state-changing operations on /supplierInvoice
  console.log("\n=== TRY APPROVE/BOOK/REJECT ETC ===");
  const actions = [
    ["PUT", `/supplierInvoice/${siId}/:approve`],
    ["PUT", `/supplierInvoice/${siId}/:reject`],
    ["PUT", `/supplierInvoice/${siId}/:book`],
    ["PUT", `/supplierInvoice/${siId}/:send`],
    ["PUT", `/supplierInvoice/${siId}/:deliver`],
    ["PUT", `/supplierInvoice/${siId}/:accept`],
    ["PUT", `/supplierInvoice/${siId}/:addRecipient`],
    ["POST", `/supplierInvoice/${siId}/:approve`],
    ["POST", `/supplierInvoice/${siId}/:reject`],
    ["POST", `/supplierInvoice/${siId}/:book`],
    ["PUT", `/supplierInvoice/${siId}/approve`],
    ["PUT", `/supplierInvoice/${siId}/reject`],
    // Also try PUT on the SI itself
    ["PUT", `/supplierInvoice/${siId}`],
  ];

  for (const [method, path] of actions) {
    const body = path.endsWith(`/${siId}`) ? { id: siId, version: si.version || 0 } : undefined;
    const r = await api(method, path, body);
    const msg = r.data?.validationMessages?.[0]?.message || r.data?.message || r.data?.developerMessage || '';
    if (r.ok) {
      console.log(`  ✓ ${method} ${path.split('/').pop()}: OK`);
      // Re-read SI to check amounts
      const reread = await api("GET", `/supplierInvoice/${siId}?fields=amount,amountCurrency,amountExcludingVat,outstandingAmount`);
      const s = reread.data.value;
      console.log(`    AFTER: amount=${s.amount} amountCurrency=${s.amountCurrency} amountExcludingVat=${s.amountExcludingVat} outstanding=${s.outstandingAmount}`);
    } else {
      console.log(`  ✗ ${method} ${path.split('/').pop()}: ${r.status} ${String(msg).substring(0, 100)}`);
    }
  }

  // Also book the voucher and re-check SI amounts
  console.log("\n=== BOOK VOUCHER AND RECHECK SI ===");
  const getV = await api("GET", `/ledger/voucher/${voucherId}?fields=version,voucherType(id)`);
  const putV = await api("PUT", `/ledger/voucher/${voucherId}`, {
    version: getV.data.value.version,
    voucherType: { id: getV.data.value.voucherType.id },
  });
  if (putV.ok) {
    console.log(`  Voucher booked: number=${putV.data.value.number}`);
    const reread = await api("GET", `/supplierInvoice/${siId}?fields=amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,outstandingAmount`);
    const s = reread.data.value;
    console.log(`  SI AFTER BOOKING: amount=${s.amount} amountCurrency=${s.amountCurrency} amountExcludingVat=${s.amountExcludingVat} amountExcludingVatCurrency=${s.amountExcludingVatCurrency} outstanding=${s.outstandingAmount}`);
  }

  // Try approve AFTER booking
  console.log("\n=== APPROVE AFTER BOOKING ===");
  const approveAfter = await api("PUT", `/supplierInvoice/${siId}/:approve`, { invoiceNumber: "INV-APPROVE-1", invoiceDate: "2026-03-22", invoiceDueDate: "2026-04-21" });
  if (approveAfter.ok) {
    console.log("  APPROVED!");
    const reread = await api("GET", `/supplierInvoice/${siId}?fields=*`);
    const s = reread.data.value;
    console.log(`  amount=${s.amount} amountCurrency=${s.amountCurrency} amountExcludingVat=${s.amountExcludingVat} outstanding=${s.outstandingAmount}`);
  } else {
    console.log(`  ${approveAfter.status}: ${approveAfter.data?.message || JSON.stringify(approveAfter.data).substring(0, 200)}`);
  }
}

main().catch(console.error);
