const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path.substring(0, 100)} → ${res.status}`);
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const date = "2026-03-22";
  const gross = 12500;
  const net = 10000;
  const desc = "kontortjenester";

  const sRes = await api("POST", "/supplier", { name: "Minimal AS", organizationNumber: "823456786" });
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=id");
  const expAcctId = acctRes.data.values[0].id;

  // Test A: POST /supplierInvoice WITHOUT voucherType
  console.log("\n=== Test A: No voucherType ===");
  const a = await api("POST", "/supplierInvoice", {
    invoiceDate: date,
    invoiceNumber: "INV-MIN-A",
    invoiceDueDate: "2026-04-21",
    supplier: { id: supplierId },
    currency: { id: 1 },
    amountCurrency: -gross,
    voucher: {
      date, description: desc,
      postings: [
        { row: 1, date, description: desc, account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
        { row: 2, date, description: desc, account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross, invoiceNumber: "INV-MIN-A", termOfPayment: "2026-04-21" },
      ],
    },
  });
  console.log("  Result:", a.status, a.ok ? `id=${a.data.value.id}` : JSON.stringify(a.data).substring(0, 300));

  if (a.ok) {
    // Check voucher type
    const vRB = await api("GET", `/ledger/voucher/${a.data.value.voucher.id}?fields=voucherType(id,name)`);
    console.log("  Voucher type:", JSON.stringify(vRB.data.value?.voucherType));
    // Book
    const book = await api("PUT", `/ledger/voucher/${a.data.value.voucher.id}`, {
      id: a.data.value.voucher.id, version: 3, date, voucherType: vRB.data.value?.voucherType,
    });
    console.log("  Book:", book.status, book.ok ? `num=${book.data.value?.number}` : JSON.stringify(book.data).substring(0, 200));
  }

  // Test B: Without vatType lookup (use id=1 directly since vatType 1 = 25% incoming)
  console.log("\n=== Test B: Direct vatType id=1 ===");
  const b = await api("POST", "/supplierInvoice", {
    invoiceDate: date,
    invoiceNumber: "INV-MIN-B",
    invoiceDueDate: "2026-04-21",
    supplier: { id: supplierId },
    currency: { id: 1 },
    amountCurrency: -gross,
    voucher: {
      date, description: desc,
      postings: [
        { row: 1, date, description: desc, account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
        { row: 2, date, description: desc, account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross },
      ],
    },
  });
  console.log("  Result:", b.status, b.ok ? `id=${b.data.value.id}` : JSON.stringify(b.data).substring(0, 300));

  // Test C: Can we skip row 2 (supplier posting) and let system auto-create it?
  console.log("\n=== Test C: Single expense posting only ===");
  const c = await api("POST", "/supplierInvoice", {
    invoiceDate: date,
    invoiceNumber: "INV-MIN-C",
    invoiceDueDate: "2026-04-21",
    supplier: { id: supplierId },
    currency: { id: 1 },
    amountCurrency: -gross,
    voucher: {
      date, description: desc,
      postings: [
        { row: 1, date, description: desc, account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
      ],
    },
  });
  console.log("  Result:", c.status, c.ok ? `id=${c.data.value.id}` : JSON.stringify(c.data).substring(0, 300));

  // Test D: Can we PUT book without specifying voucherType?
  if (a.ok) {
    console.log("\n=== Test D: PUT without voucherType ===");
    const d = await api("POST", "/supplierInvoice", {
      invoiceDate: date, invoiceNumber: "INV-MIN-D", invoiceDueDate: "2026-04-21",
      supplier: { id: supplierId }, currency: { id: 1 }, amountCurrency: -gross,
      voucher: { date, description: desc, postings: [
        { row: 1, date, description: desc, account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
        { row: 2, date, description: desc, account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross },
      ] },
    });
    if (d.ok) {
      const vid = d.data.value.voucher.id;
      const putD = await api("PUT", `/ledger/voucher/${vid}`, { id: vid, version: 3, date });
      console.log("  PUT no voucherType:", putD.status, putD.ok ? `num=${putD.data.value?.number}` : JSON.stringify(putD.data).substring(0, 200));
    }
  }
}

main().catch(console.error);
