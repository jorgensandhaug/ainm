// Now try PUT /ledger/posting/:closePostings with the correct body format:
// an array of integers (posting IDs)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
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
  // First, let's post a test voucher so we have fresh posting IDs to work with
  // Get account IDs first
  console.log("=== Getting account IDs ===");
  const acctRes = await api("GET", "/ledger/account?number=6010,1209&fields=id,number,name");
  const accounts: Record<number, number> = {};
  for (const a of (acctRes.data.values || [])) {
    accounts[a.number] = a.id;
    console.log(`  Account ${a.number} (${a.name}): id=${a.id}`);
  }

  // Post a test depreciation voucher
  console.log("\n=== Posting test voucher ===");
  const voucherRes = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Test closePostings - avskrivning",
    postings: [
      { row: 1, account: { id: accounts[6010] }, amountGross: 1000, amountGrossCurrency: 1000, description: "Test dep" },
      { row: 2, account: { id: accounts[1209] }, amountGross: -1000, amountGrossCurrency: -1000, description: "Test acc dep" },
    ],
  });

  if (voucherRes.status !== 201) return;

  const voucher = voucherRes.data.value;
  console.log(`Voucher created: id=${voucher.id}`);

  // Get the posting IDs from this voucher
  console.log("\n=== Getting posting IDs from voucher ===");
  const vDetailRes = await api("GET", `/ledger/voucher/${voucher.id}?fields=*,postings(*)`);
  const postingIds: number[] = [];
  if (vDetailRes.status === 200) {
    for (const p of (vDetailRes.data.value.postings || [])) {
      console.log(`  Posting id=${p.id}, account=${p.account?.id}, amount=${p.amountGross}`);
      postingIds.push(p.id);
    }
  }

  // Now try to close these postings with PUT /ledger/posting/:closePostings
  // Body should be an array of posting IDs (integers)
  console.log(`\n=== PUT /ledger/posting/:closePostings with body: ${JSON.stringify(postingIds)} ===`);
  const closeRes = await api("PUT", "/ledger/posting/:closePostings", postingIds);
  if (closeRes.status === 200) {
    console.log("SUCCESS! Close postings response:", JSON.stringify(closeRes.data).slice(0, 2000));
  }

  // Now verify: re-read the postings to see if closeGroup is set
  console.log("\n=== Verifying postings after close ===");
  const verifyRes = await api("GET", `/ledger/posting?dateFrom=2025-12-31&dateTo=2026-01-01&count=5&fields=*,account(number,name)&sorting=-id`);
  if (verifyRes.status === 200) {
    for (const p of (verifyRes.data.values || []).slice(0, 4)) {
      console.log(`  id=${p.id}, acct=${p.account?.number}, amount=${p.amountGross}, closeGroup=${p.closeGroup?.id || 'null'}`);
    }
  }

  // Also check close groups after
  console.log("\n=== Close groups after ===");
  const cgRes = await api("GET", "/ledger/closeGroup?dateFrom=2025-01-01&dateTo=2026-01-01&fields=*");
  if (cgRes.status === 200) {
    const groups = cgRes.data.values || [];
    console.log(`Total close groups: ${groups.length}`);
    for (const cg of groups) {
      console.log(`  id=${cg.id}, date=${cg.date}, postings: ${cg.postings?.length || 0}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
