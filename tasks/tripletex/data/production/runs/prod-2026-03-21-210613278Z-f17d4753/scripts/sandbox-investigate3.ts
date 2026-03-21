// Investigate:
// 1. Can we add a project orderline for cost tracking on top of the voucher?
// 2. Check if overallStatus costs field updates with orderline vs voucher
// 3. Investigate invoice with projectInvoiceDetails expansion
// 4. Check what fields the scorer might check

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
    console.log(`${method} ${path} → ${r.status} ERROR:`, JSON.stringify(json).slice(0, 800));
  } else {
    console.log(`${method} ${path} → ${r.status}`);
  }
  return { status: r.status, data: json };
}

async function main() {
  const projectId = 402041125;
  const suppId = 108439216;

  // 1. Check overallStatus before adding orderline
  console.log("=== Project overallStatus BEFORE orderline ===");
  const s1 = await api("GET", `/project/${projectId}/period/overallStatus?dateFrom=2026-01-01&dateTo=2026-12-31&fields=*`);
  console.log("costs before:", s1.data.value?.costs, "income:", s1.data.value?.income);

  // 2. Add project orderline with cost
  console.log("\n=== Adding project orderline for cost ===");
  const olRes = await api("POST", "/project/orderline", {
    project: { id: projectId },
    description: "Leverandørkostnad Oceano Lda",
    date: "2026-03-21",
    count: 1,
    unitCostCurrency: 56300,
    isChargeable: false,
  });
  console.log("orderline:", JSON.stringify(olRes.data.value, null, 2)?.slice(0, 500));

  // 3. Check overallStatus AFTER adding orderline
  console.log("\n=== Project overallStatus AFTER orderline ===");
  const s2 = await api("GET", `/project/${projectId}/period/overallStatus?dateFrom=2026-01-01&dateTo=2026-12-31&fields=*`);
  console.log("costs after:", s2.data.value?.costs, "income:", s2.data.value?.income);

  // 4. Now check invoice projectInvoiceDetails expansion
  console.log("\n=== Invoice with projectInvoiceDetails expansion ===");
  const invRes = await api("GET", `/invoice/2147644038?fields=*,projectInvoiceDetails(*),orders(*)`);
  if (invRes.status === 200) {
    const inv = invRes.data.value;
    console.log("invoice:", JSON.stringify(inv, null, 2)?.slice(0, 3000));
  }

  // 5. Check order details
  console.log("\n=== Order details ===");
  const orderRes = await api("GET", `/order/402041131?fields=*,orderLines(*)`);
  if (orderRes.status === 200) {
    console.log("order:", JSON.stringify(orderRes.data.value, null, 2)?.slice(0, 2000));
  }

  // 6. Read postings with date range to see voucher postings
  console.log("\n=== Postings (with date params) ===");
  const postRes = await api("GET", `/ledger/posting?dateFrom=2026-03-21&dateTo=2026-03-21&fields=*&count=100`);
  if (postRes.status === 200) {
    for (const p of postRes.data.values || []) {
      if (p.project?.id === projectId || p.supplier?.id === suppId) {
        console.log(`  posting row=${p.row} account=${p.account?.number} (${p.account?.id}) amount=${p.amount} project=${p.project?.id} supplier=${p.supplier?.id} voucher=${p.voucher?.id}`);
      }
    }
  }

  // 7. Check if there's a supplier invoice endpoint that works
  console.log("\n=== Checking /supplierInvoice endpoint ===");
  const siRes = await api("GET", `/supplierInvoice?supplierId=${suppId}&count=1&fields=*`);
  console.log("supplierInvoice:", JSON.stringify(siRes.data, null, 2)?.slice(0, 500));

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
