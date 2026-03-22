/**
 * Try to enable modules that might unlock POST /incomingInvoice.
 * POST /company/salesmodules is [BETA] but sandbox might allow it.
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
  // Try various module names that might enable incomingInvoice
  const candidates = [
    "INCOMING_INVOICE",
    "SUPPLIER_INVOICE",
    "SMART_SCAN",
    "AUTOMATED_VOUCHERS",
    "VOUCHER_AUTOMATION",
    "INVOICE_PROCESSING",
    "AUTOPAY",
    "OCR",
    "LOGISTICS",
    "LOGISTICS_LIGHT",
  ];

  for (const name of candidates) {
    const res = await api("POST", "/company/salesmodules", { name });
    if (res.ok) {
      console.log(`  ✓ ENABLED: ${name}`);
    } else {
      const msg = typeof res.data === 'object' ? (res.data.message || res.data.developerMessage || JSON.stringify(res.data.validationMessages?.[0]?.message || '')) : res.data;
      console.log(`  ✗ ${name}: ${String(msg).substring(0, 100)}`);
    }
  }

  // Check what modules are active now
  console.log("\n=== Active modules after attempts ===");
  const modRes = await api("GET", "/company/salesmodules?fields=*");
  if (modRes.ok) {
    for (const m of modRes.data.values || []) {
      console.log(`  ${m.name}`);
    }
  }

  // Try incomingInvoice again
  console.log("\n=== Retry POST /incomingInvoice ===");
  const incRes = await api("POST", "/incomingInvoice?sendTo=ledger", {
    invoiceHeader: {
      vendorId: 108508220,
      invoiceDate: "2026-03-22",
      dueDate: "2026-04-21",
      currencyId: 1,
      invoiceAmount: 12500,
      description: "test",
      invoiceNumber: "INV-AFTER-MODULE",
    },
    orderLines: [{
      externalId: "line-1",
      row: 1,
      description: "test",
      accountId: 424191165,
      count: 1,
      amountInclVat: 12500,
      vatTypeId: 1,
    }],
  });
  console.log(`  Result: ${incRes.status} ${incRes.ok ? 'OK' : JSON.stringify(incRes.data).substring(0, 200)}`);
}

main().catch(console.error);
