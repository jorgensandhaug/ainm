// Hypothesis 3: Close postings needed
// Maybe after posting all vouchers, the postings need to be "closed"
// via PUT /ledger/posting/:closePostings

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) {
    console.error("ERROR:", typeof data === 'string' ? data.slice(0, 1000) : JSON.stringify(data).slice(0, 1000));
  }
  return { status: res.status, data };
}

async function main() {
  // First, get recent postings
  console.log("=== Recent postings on 2025-12-31 ===");
  const postings = await api("GET", "/ledger/posting?dateFrom=2025-12-31&dateTo=2026-01-01&count=50&fields=id,date,description,account(number,name),amount,amountGross,closedDate,closeGroup(*)");

  if (postings.status === 200 && postings.data.values) {
    console.log(`Found ${postings.data.values.length} postings`);
    for (const p of postings.data.values.slice(0, 20)) {
      console.log(`  id=${p.id}, acct=${p.account?.number} (${p.account?.name}), amount=${p.amount}, gross=${p.amountGross}, desc="${p.description}", closedDate=${p.closedDate}, closeGroup=${JSON.stringify(p.closeGroup)}`);
    }
  }

  // Try PUT /ledger/posting/:closePostings
  console.log("\n=== Try PUT /ledger/posting/:closePostings ===");
  // First, try with a date range
  const closeRes = await api("PUT", "/ledger/posting/:closePostings?dateFrom=2025-12-31&dateTo=2026-01-01");

  // Also try with posting IDs
  if (postings.status === 200 && postings.data.values?.length > 0) {
    const ids = postings.data.values.slice(0, 5).map((p: any) => p.id).join(",");
    console.log(`\n=== Try PUT /ledger/posting/:closePostings with IDs: ${ids} ===`);
    const closeRes2 = await api("PUT", `/ledger/posting/:closePostings?postingId=${ids}`);
  }

  // Check if there's a /ledger/posting/closePostings (no colon)
  console.log("\n=== Try PUT /ledger/posting/closePostings (no colon) ===");
  const closeRes3 = await api("PUT", "/ledger/posting/closePostings?dateFrom=2025-12-31&dateTo=2026-01-01");

  // Check if there's any period-closing endpoint
  console.log("\n=== Check /ledger/openPeriod (period management) ===");
  const openPeriod = await api("GET", "/ledger/openPeriod?fields=*");

  // Check voucher/:closePostings
  console.log("\n=== Check /ledger/voucher/:closePostings ===");
  const closeVoucher = await api("PUT", "/ledger/voucher/:closePostings?dateFrom=2025-12-31&dateTo=2026-01-01");
}

main().catch(e => { console.error(e); process.exit(1); });
