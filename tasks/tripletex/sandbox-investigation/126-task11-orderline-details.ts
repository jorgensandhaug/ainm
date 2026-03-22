/**
 * Check the orderLine on the supplierInvoice — this might be what the scorer checks for expense account.
 * Also try to understand the full supplierInvoice structure.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: { Authorization: AUTH } });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  // The supplierInvoice from the last test
  const siId = 2147668562;
  const orderLineId = 1607594051;

  // Get order line details
  console.log("=== GET /order/orderline/{id}?fields=* ===");
  const olRes = await api("GET", `/order/orderline/${orderLineId}?fields=*`);
  console.log(`Status: ${olRes.status}`);
  if (olRes.ok) {
    console.log(JSON.stringify(olRes.data.value, null, 2));
  } else {
    console.log("Error:", JSON.stringify(olRes.data).substring(0, 500));
  }

  // Also get the voucherApprovalListElement
  console.log("\n=== GET /voucherApprovalListElement/647352465?fields=* ===");
  const ale1 = await api("GET", `/voucherApprovalListElement/647352465?fields=*`);
  console.log(`Status: ${ale1.status}`);
  if (ale1.ok) {
    console.log(JSON.stringify(ale1.data.value, null, 2));
  }

  console.log("\n=== GET /voucherApprovalListElement/647352477?fields=* ===");
  const ale2 = await api("GET", `/voucherApprovalListElement/647352477?fields=*`);
  console.log(`Status: ${ale2.status}`);
  if (ale2.ok) {
    console.log(JSON.stringify(ale2.data.value, null, 2));
  }

  // Check the supplierInvoice with expanded orderLines
  console.log("\n=== GET /supplierInvoice/{id}?fields=*,orderLines(*) ===");
  const siExp = await api("GET", `/supplierInvoice/${siId}?fields=*,orderLines(*)`);
  console.log(`Status: ${siExp.status}`);
  if (siExp.ok) {
    const si = siExp.data.value;
    console.log("orderLines:", JSON.stringify(si.orderLines, null, 2));
  }

  // Also look at a few more recent supplierInvoices to understand patterns
  console.log("\n=== Recent supplierInvoices with expanded fields ===");
  const recent = await api("GET", `/supplierInvoice?invoiceDateFrom=2026-03-22&invoiceDateTo=2026-03-23&fields=*,orderLines(*)`);
  if (recent.ok) {
    console.log(`Count: ${recent.data.count}`);
    for (const si of recent.data.values.slice(0, 3)) {
      console.log(`\n--- SI id=${si.id} ---`);
      console.log(`  invoiceNumber=${si.invoiceNumber} amount=${si.amount}`);
      console.log(`  orderLines:`, JSON.stringify(si.orderLines, null, 2));
    }
  }
}

main().catch(console.error);
