// Sandbox exploration: understand posting/voucher data shapes and test corrections
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
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) {
    console.error(`${method} ${path} => ${res.status}`, JSON.stringify(json).slice(0, 500));
    return null;
  }
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// 1. Check if we can get posting data with account numbers expanded
console.log("=== Test: GET /ledger/posting with fields=* (small sample) ===");
const postings = await api("GET", "/ledger/posting?dateFrom=2025-01-01&dateTo=2026-03-01&fields=*&count=5");
if (postings && postings.length > 0) {
  console.log("First posting keys:", Object.keys(postings[0]));
  console.log("Account object:", JSON.stringify(postings[0].account));
  console.log("VatType object:", JSON.stringify(postings[0].vatType));
  console.log("Voucher object:", JSON.stringify(postings[0].voucher));
}

// 2. Check if we can get vouchers with expanded postings
console.log("\n=== Test: GET /ledger/voucher with fields=* (small sample) ===");
const vouchers = await api("GET", "/ledger/voucher?dateFrom=2025-01-01&dateTo=2026-03-01&fields=*&count=3");
if (vouchers && vouchers.length > 0) {
  console.log("First voucher keys:", Object.keys(vouchers[0]));
  if (vouchers[0].postings?.length > 0) {
    console.log("First voucher first posting:", JSON.stringify(vouchers[0].postings[0]));
  }
}

// 3. Check what accounts exist
console.log("\n=== Test: Account lookup ===");
const accounts = await api("GET", "/ledger/account?number=1920,2400,2710,6540,6590,6860,7000&fields=id,number,name");
if (accounts) {
  for (const a of accounts) {
    console.log(`  Account ${a.number} "${a.name}" id=${a.id}`);
  }
}
