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
  const candidates = [
    // Common Tripletex module names
    "ACCOUNTING", "INVOICE", "PROJECT", "PRODUCT", "DEPARTMENT",
    "CUSTOMER", "APPROVE_VOUCHER", "OFFER", "AUTO_BANK_RECONCILIATION",
    // Incoming invoice related
    "VOUCHER_SCANNING", "SMART_VOUCHER", "FANGST", "CAPTURE",
    "EHF", "INCOMING", "BILAGSMOTTAK", "BILAG",
    "AUTOMATED_VOUCHER_OCR", "VOUCHER_OCR", "AUTO_VOUCHER",
    "INCOMING_INVOICE_PROCESSING", "SUPPLIER", "SUPPLIER_INVOICE_IMPORT",
    // More variations
    "CURRENCY", "NRF", "ELECTRO", "VVS", "AGRO",
    "DIGITAL_SIGNATURE", "FIXED_ASSET_REGISTER",
    "MULTIPLE_LEDGERS", "VACATION_BALANCE",
    "PRODUCT_ACCOUNTING", "PROJECT_ACCOUNTING",
    "DEPARTMENT_ACCOUNTING", "WAGE_PROJECT_ACCOUNTING",
    "PROJECT_BUDGET", "PROJECT_CATEGORY", "QUANTITY_HANDLING",
    "ORDER_OUT", "RACKBEAT", "CONTACT", "EMPLOYEE",
    "ACCOUNTANT_CONNECT_CLIENT", "HOLYDAY_PLAN",
    // Maybe a BETA module name?
    "BETA", "API_BETA", "INCOMING_INVOICE_BETA",
    "TRIPLETEX_BETA", "BETA_ACCESS",
  ];

  const results: Record<string, string> = {};
  for (const name of candidates) {
    const res = await api("POST", "/company/salesmodules", { name });
    if (res.ok) {
      results[name] = "ENABLED ✓";
    } else if (res.status === 422) {
      const msg = res.data?.validationMessages?.[0]?.message || res.data?.message || '';
      if (msg.includes("Request mapping failed")) {
        results[name] = "unknown";
      } else if (msg.includes("already active") || msg.includes("allerede")) {
        results[name] = "already active";
      } else {
        results[name] = `422: ${String(msg).substring(0, 60)}`;
      }
    } else {
      results[name] = `${res.status}: ${(res.data?.message || '').substring(0, 60)}`;
    }
  }

  console.log("=== Results ===");
  for (const [name, result] of Object.entries(results)) {
    if (result !== "unknown") {
      console.log(`  ${name}: ${result}`);
    }
  }

  // List unknown separately
  const unknowns = Object.entries(results).filter(([, r]) => r === "unknown").map(([n]) => n);
  console.log(`\n${unknowns.length} unknown module names (invalid): ${unknowns.join(', ')}`);

  // Check final module list
  const modRes = await api("GET", "/company/salesmodules?fields=*");
  console.log("\n=== Active modules ===");
  for (const m of modRes.data.values || []) {
    console.log(`  ${m.name}`);
  }

  // Final incomingInvoice test
  const incRes = await api("POST", "/incomingInvoice?sendTo=ledger", {
    invoiceHeader: { vendorId: 108508220, invoiceDate: "2026-03-22", dueDate: "2026-04-21", currencyId: 1, invoiceAmount: 12500, description: "test", invoiceNumber: "INV-MOD-TEST" },
    orderLines: [{ externalId: "l1", row: 1, description: "test", accountId: 424191165, count: 1, amountInclVat: 12500, vatTypeId: 1 }],
  });
  console.log(`\nPOST /incomingInvoice → ${incRes.status} ${incRes.ok ? 'SUCCESS!' : (incRes.data?.message || '').substring(0, 100)}`);
}

main().catch(console.error);
