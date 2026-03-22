/**
 * Discover POST /supplierInvoice schema by trial-and-error.
 * Also check Swagger for field names.
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
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const date = "2026-03-22";

  // Create supplier
  const sRes = await api("POST", "/supplier", { name: "SchemaSI AS", organizationNumber: "823456786" });
  const supplierId = sRes.data.value.id;
  console.log(`Supplier: id=${supplierId}`);

  // First, try to find existing supplierInvoices (from importDocument) to see schema
  // The earlier GET with fields=* gave 422, try without fields filter
  const existing = await api("GET", "/supplierInvoice?count=1");
  console.log("GET /supplierInvoice (no fields):", existing.status, JSON.stringify(existing.data).substring(0, 500));

  // Try with various field combos
  const existing2 = await api("GET", "/supplierInvoice?from=0&count=5");
  console.log("GET (from/count):", existing2.status, JSON.stringify(existing2.data).substring(0, 500));

  // Try without any query params
  const existing3 = await api("GET", "/supplierInvoice");
  console.log("GET (bare):", existing3.status, JSON.stringify(existing3.data).substring(0, 1000));

  // Now try POST with minimal payload, removing invalid fields one by one
  console.log("\n=== POST attempts ===");

  // Try 1: Just supplier and invoiceNumber
  const t1 = await api("POST", "/supplierInvoice", {
    supplier: { id: supplierId },
    invoiceNumber: "INV-SCH-001",
  });
  console.log("T1 (supplier+invoiceNumber):", t1.status, JSON.stringify(t1.data).substring(0, 500));

  // Try 2: Add invoiceDate (not dueDate)
  const t2 = await api("POST", "/supplierInvoice", {
    supplier: { id: supplierId },
    invoiceNumber: "INV-SCH-002",
    invoiceDate: date,
  });
  console.log("T2 (+invoiceDate):", t2.status, JSON.stringify(t2.data).substring(0, 500));

  // Try 3: With amount
  const t3 = await api("POST", "/supplierInvoice", {
    supplier: { id: supplierId },
    invoiceNumber: "INV-SCH-003",
    invoiceDate: date,
    amount: 12500,
  });
  console.log("T3 (+amount):", t3.status, JSON.stringify(t3.data).substring(0, 500));

  // Try 4: With voucher
  const t4 = await api("POST", "/supplierInvoice", {
    supplier: { id: supplierId },
    invoiceNumber: "INV-SCH-004",
    invoiceDate: date,
    amount: 12500,
    voucher: {
      date,
      description: "kontortjenester",
    },
  });
  console.log("T4 (+voucher):", t4.status, JSON.stringify(t4.data).substring(0, 500));

  // Try 5: With paymentDueDate instead of dueDate
  const t5 = await api("POST", "/supplierInvoice", {
    supplier: { id: supplierId },
    invoiceNumber: "INV-SCH-005",
    invoiceDate: date,
    paymentDueDate: date,
    amount: 12500,
  });
  console.log("T5 (+paymentDueDate):", t5.status, JSON.stringify(t5.data).substring(0, 500));

  // Try 6: Empty body to see required fields
  const t6 = await api("POST", "/supplierInvoice", {});
  console.log("T6 (empty):", t6.status, JSON.stringify(t6.data).substring(0, 500));
}

main().catch(console.error);
