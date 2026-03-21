// Sandbox verification: test year-end closing flow and investigate prepaid contra
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${path}`);
  const res = await fetch(url, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`  → ${res.status}`);
  if (!res.ok) {
    console.log(`  ERR: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  // 1. Check what accounts exist
  console.log("\n=== ACCOUNT EXISTENCE CHECK ===");
  const acctRes = await api("GET", "/ledger/account?number=1209,6010,1700,6300,7500,8700,2920&fields=id,number,name");
  if (acctRes.ok) {
    console.log("Found accounts:");
    for (const a of acctRes.data.values) {
      console.log(`  ${a.number}: ${a.name} (id=${a.id})`);
    }
    const found = new Set(acctRes.data.values.map((a: any) => a.number));
    for (const n of [1209, 6010, 1700, 6300, 7500, 8700, 2920]) {
      if (!found.has(n)) console.log(`  ${n}: MISSING`);
    }
  }

  // 2. Check account 1700 name specifically
  console.log("\n=== ACCOUNT 1700 DETAILS ===");
  const a1700 = await api("GET", "/ledger/account?number=1700&fields=*");
  if (a1700.ok && a1700.data.values.length > 0) {
    const acct = a1700.data.values[0];
    console.log(`  Name: ${acct.name}`);
    console.log(`  Type: ${JSON.stringify(acct.type)}`);
    console.log(`  Full: ${JSON.stringify(acct).slice(0, 500)}`);
  }

  // 3. Check if there's a "resultatkonto" mapping for 1700
  // Look at account 6300 details
  console.log("\n=== ACCOUNT 6300 DETAILS ===");
  const a6300 = await api("GET", "/ledger/account?number=6300&fields=*");
  if (a6300.ok && a6300.data.values.length > 0) {
    console.log(`  Name: ${a6300.data.values[0].name}`);
  }

  // 4. Look at balance sheet to understand the sandbox state
  console.log("\n=== BALANCE SHEET (3000-8700, 2025) ===");
  const bs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000");
  if (bs.ok) {
    let sum = 0;
    for (const row of bs.data.values) {
      sum += row.balanceOut || 0;
      console.log(`  ${row.account?.number} ${row.account?.name}: balIn=${row.balanceIn}, balOut=${row.balanceOut}`);
    }
    console.log(`  SUM balanceOut: ${sum}`);
    console.log(`  preTaxProfit: ${-sum}`);
  }

  // 5. Check if 7500 exists (alternative prepaid contra)
  console.log("\n=== ACCOUNT 7500 CHECK ===");
  const a7500 = await api("GET", "/ledger/account?number=7500&fields=id,number,name");
  if (a7500.ok) {
    console.log(`  Result: ${JSON.stringify(a7500.data.values)}`);
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
