// Further investigation:
// 1. Try POST /supplierInvoice - maybe it works now?
// 2. Try PUT /project/hourlyRates to set a fixed rate
// 3. Check if setting hourly rates makes feeAmount non-zero on invoice
// 4. Try PUT /project to set additional budget fields

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Content-Type": "application/json", Authorization: AUTH },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (r.status >= 400) {
    console.log(`${method} ${path} → ${r.status} ERROR:`, JSON.stringify(json).slice(0, 1500));
  } else {
    console.log(`${method} ${path} → ${r.status}`);
  }
  return { status: r.status, data: json };
}

async function main() {
  const projectId = 402041289;
  const suppId = 108439685; // from the full flow test (Oceano zwysd6 Lda)

  // 1. Try POST /supplierInvoice
  console.log("=== Testing POST /supplierInvoice ===");
  const siRes = await api("POST", "/supplierInvoice", {
    invoiceNumber: "TEST-001",
    invoiceDate: "2026-03-21",
    dueDate: "2026-04-20",
    supplier: { id: suppId },
    voucher: null,
  });
  console.log("supplierInvoice result:", JSON.stringify(siRes.data, null, 2)?.slice(0, 800));

  // 2. Try with more fields
  console.log("\n=== Testing POST /supplierInvoice with more fields ===");
  const siRes2 = await api("POST", "/supplierInvoice", {
    invoiceNumber: "TEST-002",
    invoiceDate: "2026-03-21",
    dueDate: "2026-04-20",
    supplier: { id: suppId },
    amountExcludingVat: 56300,
    amountExcludingVatCurrency: 56300,
  });
  console.log("supplierInvoice result:", JSON.stringify(siRes2.data, null, 2)?.slice(0, 800));

  // 3. Check the search for supplier invoices
  console.log("\n=== GET /supplierInvoice ===");
  const siSearch = await api("GET", `/supplierInvoice?supplierId=${suppId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*&count=10`);
  console.log("supplierInvoice search:", JSON.stringify(siSearch.data, null, 2)?.slice(0, 800));

  // 4. Try setting hourly rates on the project
  console.log("\n=== PUT /project/hourlyRates ===");
  const hrRes = await api("PUT", `/project/hourlyRates/11091008`, {
    id: 11091008,
    version: 0,
    project: { id: projectId },
    startDate: "2026-03-21",
    showInProjectOrder: false,
    hourlyRateModel: "TYPE_FIXED_HOURLY_RATE",
    fixedRate: 2318.18,
  });
  console.log("hourlyRates update:", hrRes.status);
  if (hrRes.status === 200) {
    console.log("  fixedRate:", hrRes.data.value?.fixedRate);
  }

  // 5. Read back project after setting hourly rates
  console.log("\n=== Project after hourly rate update ===");
  const projRes = await api("GET", `/project/${projectId}?fields=fixedprice,isFixedPrice,contributionMarginPercent,invoiceReserveTotalAmountCurrency`);
  console.log("project:", JSON.stringify(projRes.data.value, null, 2));

  // 6. Check project/period/overallStatus after hourly rate change
  console.log("\n=== Project overallStatus after hourly rate update ===");
  const statusRes = await api("GET", `/project/${projectId}/period/overallStatus?dateFrom=2026-01-01&dateTo=2026-12-31&fields=*`);
  console.log("overallStatus:", JSON.stringify(statusRes.data.value, null, 2));

  // 7. What about contributionMarginPercent? Can we affect it?
  // The project currently shows 75, not sure what controls this.

  // 8. Check openapi spec for project fields - look for budget-related fields
  console.log("\n=== Project full fields dump ===");
  const projFull = await api("GET", `/project/${projectId}?fields=*`);
  const p = projFull.data.value;
  // Print ALL fields
  for (const [k, v] of Object.entries(p)) {
    if (typeof v !== "object" || v === null) {
      console.log(`  ${k}: ${v}`);
    }
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
