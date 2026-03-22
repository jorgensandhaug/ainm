/**
 * Try POST /supplierInvoice directly — this might NOT be beta.
 * Also try POST /supplierInvoice/:approve and other variations.
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
  const date = "2026-03-22";

  // Create supplier
  const sRes = await api("POST", "/supplier", { name: "DirectSI AS", organizationNumber: "823456786" });
  if (!sRes.ok) { console.error("Supplier fail:", JSON.stringify(sRes.data).substring(0, 300)); return; }
  const supplierId = sRes.data.value.id;
  console.log(`  Supplier: id=${supplierId}`);

  // Get expense account
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;

  // Get vatType
  const vatRes = await api("GET", "/ledger/vatType?number=1&fields=*");
  const vatTypeId = vatRes.data.values[0].id;
  console.log(`  vatType: id=${vatTypeId}`);

  // Try 1: POST /supplierInvoice
  console.log("\n=== Try POST /supplierInvoice ===");
  const si1 = await api("POST", "/supplierInvoice", {
    invoiceDate: date,
    dueDate: date,
    supplier: { id: supplierId },
    invoiceNumber: "INV-DSI-001",
    amount: 12500,
    amountExcludingVat: 10000,
    currency: { id: 1 },
    description: "kontortjenester",
  });
  console.log("  Result:", JSON.stringify(si1.data).substring(0, 500));

  // Try 2: POST /supplierInvoice with voucher info
  console.log("\n=== Try POST /supplierInvoice with voucher ===");
  const si2 = await api("POST", "/supplierInvoice", {
    invoiceDate: date,
    dueDate: date,
    supplier: { id: supplierId },
    invoiceNumber: "INV-DSI-002",
    amount: 12500,
    amountExcludingVat: 10000,
    currency: { id: 1 },
    description: "kontortjenester",
    voucher: {
      date,
      description: "kontortjenester",
    },
  });
  console.log("  Result:", JSON.stringify(si2.data).substring(0, 500));

  // Try 3: Check what fields supplierInvoice accepts
  console.log("\n=== Try OPTIONS/GET /supplierInvoice ===");
  const siSchema = await api("GET", "/supplierInvoice?fields=*&count=1");
  if (siSchema.ok && siSchema.data.values?.length) {
    console.log("  First existing supplierInvoice keys:", Object.keys(siSchema.data.values[0]));
    console.log("  Sample:", JSON.stringify(siSchema.data.values[0]).substring(0, 500));
  } else {
    console.log("  No existing supplierInvoices or error");
  }

  // Try 4: POST /supplierInvoice/voucher
  console.log("\n=== Try POST /supplierInvoice/voucher ===");
  const si3 = await api("POST", "/supplierInvoice/voucher", {
    invoiceDate: date,
    dueDate: date,
    supplier: { id: supplierId },
    invoiceNumber: "INV-DSI-003",
    amount: 12500,
    description: "kontortjenester",
  });
  console.log("  Result:", JSON.stringify(si3.data).substring(0, 500));

  // Try 5: What about PUT on existing supplierInvoice to change description?
  // First find one from importDocument
  const existing = await api("GET", "/supplierInvoice?invoiceDateFrom=2026-03-22&fields=*");
  if (existing.ok && existing.data.values?.length) {
    const first = existing.data.values[0];
    console.log(`\n=== Existing supplierInvoice: id=${first.id} desc="${first.description}" invoiceNumber="${first.invoiceNumber}" ===`);
    
    // Try PUT to change description
    const putRes = await api("PUT", `/supplierInvoice/${first.id}`, {
      ...first,
      description: "kontortjenester MODIFIED",
    });
    console.log("  PUT result:", putRes.status, JSON.stringify(putRes.data).substring(0, 500));
    
    if (putRes.ok) {
      // Read back
      const readback = await api("GET", `/supplierInvoice/${first.id}?fields=*`);
      console.log("  Readback desc:", readback.data.value?.description);
    }
  }
}

main().catch(console.error);
