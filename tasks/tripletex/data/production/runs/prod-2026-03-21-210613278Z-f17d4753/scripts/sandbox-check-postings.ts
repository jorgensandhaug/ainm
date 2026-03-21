// Check voucher postings to see if supplier and project links persist

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
  const projectId = 402041590;
  const voucherId = 609183761;
  const suppId = 108440592;

  // 1. Read voucher with postings expansion
  console.log("=== Voucher with postings expansion ===");
  const vRes = await api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*)`);
  if (vRes.status === 200) {
    console.log("voucher:", JSON.stringify(vRes.data.value, null, 2)?.slice(0, 2000));
  }

  // 2. Read postings with date range and project filter
  console.log("\n=== Postings for project ===");
  const postRes = await api("GET", `/ledger/posting?dateFrom=2026-03-21&dateTo=2026-03-21&projectId=${projectId}&fields=*&count=100`);
  if (postRes.status === 200) {
    console.log("Found", postRes.data.values?.length, "postings for project");
    for (const p of postRes.data.values || []) {
      console.log(`  row=${p.row} acc=${p.account?.number} amount=${p.amount} project=${p.project?.id} supplier=${p.supplier?.id} voucher=${p.voucher?.id}`);
    }
  }

  // 3. Read ALL postings for today to find the voucher ones
  console.log("\n=== ALL postings for today ===");
  const allPostRes = await api("GET", `/ledger/posting?dateFrom=2026-03-21&dateTo=2026-03-21&fields=*&count=200`);
  if (allPostRes.status === 200) {
    for (const p of allPostRes.data.values || []) {
      if (p.voucher?.id === voucherId) {
        console.log(`  VOUCHER POSTING: row=${p.row} acc=${p.account?.number} (${p.account?.id}) amount=${p.amount} project=${p.project?.id} supplier=${p.supplier?.id}`);
      }
    }
  }

  // 4. Read postings for supplier
  console.log("\n=== Postings for supplier ===");
  const suppPostRes = await api("GET", `/ledger/posting?dateFrom=2026-03-21&dateTo=2026-03-21&supplierId=${suppId}&fields=*&count=100`);
  if (suppPostRes.status === 200) {
    console.log("Found", suppPostRes.data.values?.length, "postings for supplier");
    for (const p of suppPostRes.data.values || []) {
      console.log(`  row=${p.row} acc=${p.account?.number} amount=${p.amount} project=${p.project?.id} supplier=${p.supplier?.id} voucher=${p.voucher?.id}`);
    }
  }

  // 5. Check the openapi for what the project/period endpoints return
  // Try alternative budget/cost check paths
  console.log("\n=== Project budget endpoint ===");
  const budgetRes = await api("GET", `/project/${projectId}/period/overallStatus?dateFrom=2026-01-01&dateTo=2026-12-31&fields=*`);
  console.log("overallStatus:", JSON.stringify(budgetRes.data.value, null, 2));

  // 6. Check if project has a totalBudget or similar field
  console.log("\n=== Project with budget-related fields ===");
  const projRes = await api("GET", `/project/${projectId}?fields=id,name,fixedprice,isFixedPrice,contributionMarginPercent,invoiceReserveTotalAmountCurrency,markUpOrderLines,markUpFeesEarned,priceCeilingAmount,isPriceCeiling`);
  console.log("project:", JSON.stringify(projRes.data.value, null, 2));

  // 7. Check what happens with the order line on the project
  // (different from project/orderline -- check if the order created by invoice shows on project)
  console.log("\n=== Project with order expansion ===");
  const projOrders = await api("GET", `/project/${projectId}?fields=orderLines(*)`);
  console.log("project orderLines:", JSON.stringify(projOrders.data.value?.orderLines, null, 2)?.slice(0, 1000));

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
