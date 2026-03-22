const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) console.log(`${method} ${path} → ${res.status} ERROR: ${JSON.stringify(data).slice(0, 200)}`);
  return { ok: res.ok, data };
}

// Get all needed account IDs
const acctRes = await api("GET", "/ledger/account?number=6010,1209,1700,6300,7500,8300,2500,8700,2920,8800,2050&fields=id,number,name&count=100");
const accts: Record<number, { id: number; name: string }> = {};
for (const a of acctRes.data.values) accts[a.number] = { id: a.id, name: a.name };

console.log("Account 1700:", accts[1700]?.name);
console.log("Account 8700:", accts[8700]?.name);
console.log("Account 2920:", accts[2920]?.name);
console.log("Account 8300:", accts[8300]?.name);
console.log("Account 2500:", accts[2500]?.name);

// Test 1: What does account 1700 balance look like?
console.log("\n=== Account 1700 balance ===");
const bs1700 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1700&accountNumberTo=1700&fields=*,account(number,name)&count=10");
for (const r of (bs1700.data?.values || [])) {
  console.log(`  ${r.account?.number} ${r.account?.name}: in=${r.balanceIn} change=${r.balanceChange} out=${r.balanceOut}`);
}

// Test 2: Check ALL balance sheet 3000-8999 to see what accounts have data
console.log("\n=== All P&L + tax accounts with balances ===");
const bsAll = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8999&fields=*,account(number,name)&count=1000");
for (const r of (bsAll.data?.values || [])) {
  if (r.balanceOut !== 0) {
    console.log(`  ${r.account?.number} ${r.account?.name}: out=${r.balanceOut}`);
  }
}

// Test 3: Check the yearEnd report structure more carefully
console.log("\n=== Full yearEnd report structure ===");
const ye = await api("GET", "/yearEnd?year=2025&fields=*");
if (ye.data?.value) {
  const v = ye.data.value;
  // Check all top-level YearEndReportType fields
  for (const key of Object.keys(v)) {
    if (v[key] && typeof v[key] === 'object') {
      if ('sumAmount' in v[key]) {
        console.log(`  ${key}.sumAmount = ${v[key].sumAmount}`);
        if (v[key].posts?.length > 0) {
          for (const post of v[key].posts) {
            if (post.sumAmount !== 0) {
              console.log(`    post: ${post.name} grouping=${post.grouping} amount=${post.sumAmount}`);
            }
          }
        }
      }
    }
  }
}

// Test 4: Try posting with 8700/2500 combo (task's expense + correct liability)
console.log("\n=== Test: 8700/2500 tax posting ===");
const t4 = await api("POST", "/ledger/voucher", {
  date: "2025-12-31",
  description: "Test skattekostnad 8700/2500",
  postings: [
    { row: 1, account: { id: accts[8700].id }, amountGross: 10000, amountGrossCurrency: 10000, description: "Skattekostnad" },
    { row: 2, account: { id: accts[2500].id }, amountGross: -10000, amountGrossCurrency: -10000, description: "Betalbar skatt" },
  ],
});
const t4id = t4.data?.value?.id;
console.log(`Created voucher ${t4id || 'FAILED'}`);

// Check yearEnd after 8700/2500 posting
const ye2 = await api("GET", "/yearEnd?year=2025&fields=taxCost,operatingExpense");
console.log("taxCost after 8700/2500:", JSON.stringify(ye2.data?.value?.taxCost));

// Check where 8700 shows up in yearEnd
const ye3 = await api("GET", "/yearEnd?year=2025&fields=extraordinaryCost");
console.log("extraordinaryCost:", JSON.stringify(ye3.data?.value?.extraordinaryCost));

// Clean up test voucher
if (t4id) await api("DELETE", `/ledger/voucher/${t4id}`);

// Test 5: Check if 8700 is in the "operating expense" section
console.log("\n=== yearEnd operating expense detail ===");
const ye4 = await api("GET", "/yearEnd?year=2025&fields=operatingExpense");
const oe = ye4.data?.value?.operatingExpense;
if (oe?.posts) {
  for (const p of oe.posts) {
    console.log(`  ${p.name}: grouping=${p.grouping} amount=${p.sumAmount}`);
  }
}
