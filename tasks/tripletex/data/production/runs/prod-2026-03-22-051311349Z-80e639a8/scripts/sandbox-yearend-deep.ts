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
  if (!res.ok) console.log(`${method} ${path} → ${res.status} ERROR: ${typeof data === 'string' ? data : JSON.stringify(data).slice(0, 300)}`);
  else console.log(`${method} ${path} → ${res.status}`);
  return data;
}

// 1. Check full yearEnd report
console.log("=== Full yearEnd report ===");
const ye = await api("GET", "/yearEnd?year=2025&fields=*");
if (ye.value) {
  const v = ye.value;
  console.log("annualResult:", v.annualResult);
  console.log("asset:", v.asset);
  console.log("equityAndDebt:", v.equityAndDebt);
  console.log("taxCost:", JSON.stringify(v.taxCost, null, 2));
  console.log("operatingExpense:", JSON.stringify(v.operatingExpense?.posts?.map((p: any) => ({name: p.name, amount: p.sumAmount})), null, 2));
  console.log("yearEndReportPosting:", JSON.stringify(v.yearEndReportPosting, null, 2));
  console.log("fixedAsset:", JSON.stringify(v.fixedAsset?.posts?.map((p: any) => ({name: p.name, amount: p.sumAmount})), null, 2));

  // Show sections with non-zero amounts
  for (const key of Object.keys(v)) {
    if (v[key]?.sumAmount && v[key].sumAmount !== 0) {
      console.log(`  ${key}.sumAmount = ${v[key].sumAmount}`);
    }
  }
}

// 2. Check annualAccounts report
console.log("\n=== annualAccounts for 2025 ===");
const aa = await api("GET", "/yearEnd/annualAccounts?year=2025&fields=*");
if (aa.value) {
  const v = aa.value;
  // Show key sections
  for (const key of ['ordinaryResultBeforeTaxes', 'ordinaryResultAfterTaxes', 'netProfitOrLossForTheYear', 'transfers']) {
    if (v[key]) {
      console.log(`\n${key}:`);
      console.log(`  sumOpeningBalance: ${v[key].sumOpeningBalance}, sumClosingBalance: ${v[key].sumClosingBalance}`);
      for (const line of (v[key].subTotalLines || [])) {
        if (line.closingBalance !== 0) {
          console.log(`    ${line.name}: closing=${line.closingBalance} opening=${line.openingBalance}`);
        }
      }
    }
  }
}

// 3. Check what vouchers exist for 2025-12-31
console.log("\n=== Vouchers on 2025-12-31 ===");
const vouchers = await api("GET", "/ledger/voucher?dateFrom=2025-12-31&dateTo=2026-01-01&fields=id,description,date&count=100");
for (const v of (vouchers.values || []).slice(0, 20)) {
  console.log(`  ${v.id}: ${v.description} (${v.date})`);
}

// 4. Check balance sheet accounts 1200-1300 (asset accounts)
console.log("\n=== Balance sheet for asset accounts 1200-1300 ===");
const bsAssets = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1200&accountNumberTo=1299&fields=*,account(id,number,name)&count=100");
for (const row of (bsAssets.values || [])) {
  if (row.balanceOut !== 0 || row.balanceIn !== 0) {
    console.log(`  ${row.account?.number} ${row.account?.name}: in=${row.balanceIn} out=${row.balanceOut}`);
  }
}
