// Investigate the /yearEnd API to understand what the scorer might check
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Check the yearEnd API
console.log("=== /yearEnd check ===");
const yeRes = await fetch(`${BASE}/yearEnd?year=2025&fields=*`, { headers: H });
console.log("Status:", yeRes.status);
if (yeRes.ok) {
  const yeData = await yeRes.json();
  console.log(JSON.stringify(yeData, null, 2));
} else {
  console.log("Error:", await yeRes.text());
}

// Check the resultSheet endpoint
console.log("\n=== /resultSheet check ===");
const rsRes = await fetch(`${BASE}/resultSheet?dateFrom=2025-01-01&dateTo=2026-01-01&fields=*,account(number,name)&count=1000`, { headers: H });
console.log("Status:", rsRes.status);
if (rsRes.ok) {
  const rsData = await rsRes.json();
  console.log("Total rows:", rsData.values?.length);
  let sum = 0;
  for (const r of rsData.values || []) {
    sum += r.balanceOut || 0;
    if (r.account) console.log(`  ${r.account.number} ${r.account.name}: balanceOut=${r.balanceOut}`);
  }
  console.log("Result sheet sum:", sum);
} else {
  console.log("Error:", await rsRes.text());
}

// Check what accounts exist in the 8300-8999 range
console.log("\n=== Accounts in 8300-8999 range ===");
const acRes = await fetch(`${BASE}/ledger/account?numberFrom=8300&numberTo=8999&fields=id,number,name,type&count=100`, { headers: H });
if (acRes.ok) {
  const acData = await acRes.json();
  for (const a of acData.values) {
    console.log(`  ${a.number} "${a.name}" type=${a.type}`);
  }
}

// Also check what the balanceSheet shows for the full P&L range (3000-8999)
console.log("\n=== Balance sheet 3000-8999 (full P&L) ===");
const bsFullRes = await fetch(`${BASE}/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8999&fields=account(number,name),balanceOut&count=1000`, { headers: H });
if (bsFullRes.ok) {
  const bsData = await bsFullRes.json();
  let sum = 0;
  for (const r of bsData.values || []) {
    sum += r.balanceOut || 0;
    if (r.account) console.log(`  ${r.account.number} ${r.account.name}: balanceOut=${r.balanceOut}`);
  }
  console.log("Full P&L balance sheet sum:", sum);
}

// Check the /yearEnd/annualAccounts endpoint
console.log("\n=== /yearEnd/annualAccounts ===");
const aaRes = await fetch(`${BASE}/yearEnd/annualAccounts?year=2025&fields=*`, { headers: H });
console.log("Status:", aaRes.status);
if (aaRes.ok) {
  const aaData = await aaRes.json();
  console.log(JSON.stringify(aaData, null, 2).substring(0, 3000));
} else {
  console.log("Error:", await aaRes.text());
}
