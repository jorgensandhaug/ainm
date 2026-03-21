// Task 30: Deep investigation of yearEnd API endpoints
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  return { status: res.status, data: json };
}

async function main() {
  // 1. GET /yearEnd with various params
  console.log("=== 1. GET /yearEnd ===");
  const ye1 = await api("GET", "/yearEnd?year=2025&fields=*");
  console.log(JSON.stringify(ye1.data, null, 2).slice(0, 2000));

  // 2. GET /yearEnd/annualAccounts
  console.log("\n=== 2. GET /yearEnd/annualAccounts?year=2025 ===");
  const ye2 = await api("GET", "/yearEnd/annualAccounts?year=2025&fields=*");
  console.log(JSON.stringify(ye2.data, null, 2).slice(0, 2000));

  // 3. Check other yearEnd sub-endpoints
  console.log("\n=== 3. GET /yearEnd/settings ===");
  const ye3 = await api("GET", "/yearEnd/settings?year=2025&fields=*");
  console.log(JSON.stringify(ye3.data, null, 2).slice(0, 1000));

  // 4. Check for year-end closing/locking endpoints
  console.log("\n=== 4. GET /yearEnd/relativeNumbers ===");
  const ye4 = await api("GET", "/yearEnd/relativeNumbers?year=2025&fields=*");
  console.log(JSON.stringify(ye4.data, null, 2).slice(0, 1000));

  // 5. Check YearEnd operations
  console.log("\n=== 5. Check yearEnd POST/send ===");
  const ye5 = await api("GET", "/yearEnd/note?year=2025&fields=*&count=10");
  console.log(JSON.stringify(ye5.data, null, 2).slice(0, 1000));

  // 6. CRITICAL: Check if the depreciation should go to asset-specific acc dep accounts
  // Task says "use 1209" but maybe the scorer expects per-asset accounts
  // Check what accumlated dep accounts exist per asset class
  console.log("\n=== 6. All accounts in 1200-1259 range ===");
  const accRange = await api("GET", "/ledger/account?numberFrom=1200&numberTo=1260&fields=id,number,name&count=100");
  for (const a of (accRange.data?.values || []).sort((a: any, b: any) => a.number - b.number)) {
    console.log(`  ${a.number} "${a.name}" id=${a.id}`);
  }

  // 7. Check all accounts in the 6000-6020 range for depreciation
  console.log("\n=== 7. All accounts in 6000-6020 range ===");
  const depRange = await api("GET", "/ledger/account?numberFrom=6000&numberTo=6020&fields=id,number,name&count=100");
  for (const a of (depRange.data?.values || []).sort((a: any, b: any) => a.number - b.number)) {
    console.log(`  ${a.number} "${a.name}" id=${a.id}`);
  }

  // 8. Check result accounts
  console.log("\n=== 8. All accounts 8700-9000 ===");
  const resRange = await api("GET", "/ledger/account?numberFrom=8700&numberTo=9000&fields=id,number,name&count=100");
  for (const a of (resRange.data?.values || []).sort((a: any, b: any) => a.number - b.number)) {
    console.log(`  ${a.number} "${a.name}" id=${a.id}`);
  }

  // 9. What does GET /yearEnd return? Let me check multiple years
  console.log("\n=== 9. GET /yearEnd list ===");
  const yeList = await api("GET", "/yearEnd?count=10&fields=*");
  console.log(JSON.stringify(yeList.data, null, 2).slice(0, 3000));

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
