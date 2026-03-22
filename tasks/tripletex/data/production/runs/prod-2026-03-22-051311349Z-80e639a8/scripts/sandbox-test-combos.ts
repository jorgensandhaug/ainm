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
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) console.error("ERROR:", typeof data === 'string' ? data : JSON.stringify(data).slice(0, 200));
  return { ok: res.ok, data };
}

const acctRes = await api("GET", "/ledger/account?number=8700,2500,2920,8300,6300,7500,1700&fields=id,number,name&count=20");
const a: Record<number, number> = {};
for (const acc of acctRes.data.values) a[acc.number] = acc.id;

// Test 1: 8700/2500 (task's expense + correct liability)
console.log("\n=== Test: 8700/2500 ===");
const t1 = await api("POST", "/ledger/voucher", {
  date: "2025-12-31",
  description: "TEST TAX 8700/2500",
  postings: [
    { row: 1, account: { id: a[8700] }, amountGross: 5555, amountGrossCurrency: 5555, description: "Skattekostnad" },
    { row: 2, account: { id: a[2500] }, amountGross: -5555, amountGrossCurrency: -5555, description: "Betalbar skatt" },
  ],
});
console.log("8700/2500 created:", t1.ok);
if (t1.ok) {
  const ye = await api("GET", "/yearEnd?year=2025&fields=taxCost,currentDebt");
  console.log("taxCost.sumAmount:", ye.data?.value?.taxCost?.sumAmount);
  // Check where 8700 appears
  console.log("currentDebt posts:", JSON.stringify(ye.data?.value?.currentDebt?.posts?.map((p:any) => ({name: p.name, amount: p.sumAmount})), null, 2));
  await api("DELETE", `/ledger/voucher/${t1.data.value.id}`);
}

// Test 2: Tax with r2() rounding vs Math.round()
console.log("\n=== Tax rounding comparison ===");
const testProfit = 544499.10;
console.log(`Profit: ${testProfit}`);
console.log(`Math.round(${testProfit} * 0.22) = ${Math.round(testProfit * 0.22)}`);
console.log(`r2(${testProfit} * 0.22) = ${Math.round(testProfit * 0.22 * 100) / 100}`);
console.log(`Math.floor(${testProfit} * 0.22) = ${Math.floor(testProfit * 0.22)}`);

// Test 3: Check what account 7500 is (insurance) and if it could be the prepaid contra
console.log("\n=== Account details ===");
for (const num of [6300, 7500, 1700]) {
  if (a[num]) {
    const detail = await api("GET", `/ledger/account/${a[num]}?fields=id,number,name,type`);
    console.log(`Account ${num}: ${detail.data?.value?.name} type=${detail.data?.value?.type}`);
  }
}

// Test 4: Check what accounts are in the 6050-6099 range (depreciation-related expense grouping)
console.log("\n=== Accounts in 6050-6099 (depreciation grouping gap) ===");
const depAccts = await api("GET", "/ledger/account?number=6050,6060,6070,6080,6090,6099&fields=id,number,name,type&count=20");
for (const acc of (depAccts.data?.values || [])) {
  console.log(`  ${acc.number} ${acc.name} type=${acc.type}`);
}

// Test 5: What does 6010 map to in yearEnd?
console.log("\n=== yearEnd operatingExpense groupings ===");
const ye5 = await api("GET", "/yearEnd?year=2025&fields=operatingExpense");
for (const p of (ye5.data?.value?.operatingExpense?.posts || [])) {
  console.log(`  ${p.name}: grouping=${p.grouping} amount=${p.sumAmount}`);
}

// Key insight test: does 6010 cover ALL depreciation? grouping=6000-6049,6060-6099
// 6010 IS in 6000-6049 range ✓
// But 6050-6059 is EXCLUDED from this grouping!

// Test 6: What about account 6050?
console.log("\n=== Checking account 6050 ===");
const a6050 = await api("GET", "/ledger/account?number=6050&fields=id,number,name,type&count=1");
console.log("Account 6050:", a6050.data?.values?.[0]?.name || "NOT FOUND");

console.log("\nDone.");
