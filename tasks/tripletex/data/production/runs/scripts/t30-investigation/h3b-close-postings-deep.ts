// Deep investigation of close postings and close groups
// The closeGroup endpoint returned actual postings — let's see what they look like
// And figure out what PUT /ledger/posting/:closePostings expects as a body

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
    console.error("ERROR:", typeof data === 'string' ? data.slice(0, 1500) : JSON.stringify(data).slice(0, 1500));
  }
  return { status: res.status, data };
}

async function main() {
  // Get the close group postings with full details
  console.log("=== Close group postings details ===");
  const postingIds = [3845718462, 3845718464, 3845718466, 3845718468, 3845718470, 3845718472, 3845718474, 3845718476, 3845718478, 3845718480, 3845718482, 3845718484, 3845718459];

  // Get all postings in detail
  const idStr = postingIds.join(",");
  const postingsRes = await api("GET", `/ledger/posting?id=${idStr}&fields=*,account(number,name)&count=50`);
  if (postingsRes.status === 200) {
    for (const p of (postingsRes.data.values || [])) {
      console.log(`  id=${p.id}, acct=${p.account?.number} (${p.account?.name}), amount=${p.amount}, amountGross=${p.amountGross}, desc="${p.description}", date=${p.date}, voucher id=${p.voucher?.id}`);
    }
  }

  // Get all postings on 2025-12-31 without closedDate (which doesn't exist)
  console.log("\n=== All postings on 2025-12-31 ===");
  const allPostings = await api("GET", "/ledger/posting?dateFrom=2025-12-31&dateTo=2026-01-01&count=100&fields=*,account(number,name)");
  if (allPostings.status === 200) {
    console.log(`Total: ${allPostings.data.values?.length}`);
    for (const p of (allPostings.data.values || []).slice(0, 30)) {
      console.log(`  id=${p.id}, acct=${p.account?.number} (${p.account?.name}), amount=${p.amount}, gross=${p.amountGross}, desc="${p.description}", voucher=${p.voucher?.id}, closeGroup=${p.closeGroup?.id || 'null'}`);
    }
  }

  // Now check the openapi.json for the closePostings endpoint
  console.log("\n=== Checking OpenAPI spec for closePostings ===");
  // This is what the endpoint expects. Let's try different body shapes.

  // Try with posting IDs in body
  console.log("\n=== PUT /ledger/posting/:closePostings with postingIds in body ===");
  const r1 = await api("PUT", "/ledger/posting/:closePostings", {
    postingIds: [3845718462]
  });

  // Try with date
  console.log("\n=== PUT /ledger/posting/:closePostings with date ===");
  const r2 = await api("PUT", "/ledger/posting/:closePostings", {
    date: "2025-12-31"
  });

  // Try with a list of posting objects
  console.log("\n=== PUT /ledger/posting/:closePostings with posting list ===");
  const r3 = await api("PUT", "/ledger/posting/:closePostings", [
    { id: 3845718462 }
  ]);

  // Try passing just a date string as body
  console.log("\n=== PUT /ledger/posting/:closePostings with date string ===");
  const r4 = await api("PUT", "/ledger/posting/:closePostings", "2025-12-31");

  // Try with query params for posting IDs
  console.log("\n=== PUT /ledger/posting/:closePostings?postingIds=... ===");
  const r5 = await api("PUT", "/ledger/posting/:closePostings?postingIds=3845718462");
}

main().catch(e => { console.error(e); process.exit(1); });
