// Test: does the task expect us to create assets in the asset register?
// And/or does it expect a result disposition voucher?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.log("  ERROR:", JSON.stringify(data).slice(0, 500));
  }
  return { ok: res.ok, data };
}

async function main() {
  // 1. Check existing assets
  console.log("=== Existing assets ===");
  const assets = await api("GET", "/asset?fields=*&count=100");
  console.log(`  Found ${assets.data?.values?.length || 0} assets`);
  for (const a of assets.data?.values || []) {
    console.log(`  id=${a.id} name="${a.name}" cost=${a.acquisitionCost} lifetime=${a.lifetime} method=${a.depreciationMethod} acct=${a.account?.number} depAcct=${a.depreciationAccount?.number}`);
  }

  // 2. Look up accounts we need
  const acctRes = await api("GET", "/ledger/account?number=1200,1209,1230,1240,1250,6010&fields=id,number,name&count=100");
  const accounts: Record<number, any> = {};
  for (const a of acctRes.data?.values || []) accounts[a.number] = a;
  console.log("\nAccounts found:", Object.keys(accounts).map(Number));

  // 3. Create 1209 if missing
  if (!accounts[1209]) {
    console.log("\nCreating account 1209...");
    const created = await api("POST", "/ledger/account", { number: 1209, name: "Akkumulerte avskrivninger" });
    if (created.ok) accounts[1209] = created.data.value;
  }

  // 4. Try creating an asset
  console.log("\n=== Creating test asset ===");
  const testAsset = await api("POST", "/asset", {
    name: "Test Kontormaskiner",
    dateOfAcquisition: "2025-01-01",
    acquisitionCost: 351450,
    account: { id: accounts[1200]?.id },
    lifetime: 108, // 9 years * 12 months
    depreciationMethod: "STRAIGHT_LINE",
    depreciationAccount: { id: accounts[1209]?.id },
    depreciationFrom: "2025-01-01",
  });
  if (testAsset.ok) {
    console.log("  Asset created:", JSON.stringify(testAsset.data.value, null, 2));
  }

  // 5. Check for /asset/depreciate or similar endpoints
  console.log("\n=== Try depreciate endpoint ===");
  const dep1 = await api("POST", "/asset/depreciate");
  const dep2 = await api("PUT", "/asset/depreciate");

  // 6. Try listing asset endpoints
  console.log("\n=== Check /yearEnd endpoints ===");
  const ye1 = await api("GET", "/yearEnd");

  // 7. Check amortization-related posting fields
  console.log("\n=== Test posting with amortization fields ===");
  if (accounts[6010]?.id && accounts[1200]?.id) {
    const testVoucher = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Test amortization posting",
      postings: [
        {
          row: 1,
          account: { id: accounts[6010].id },
          amountGross: 1000,
          amountGrossCurrency: 1000,
          description: "Test debit with amortization",
          amortizationAccount: { id: accounts[1200].id },
          amortizationStartDate: "2025-01-01",
          amortizationEndDate: "2025-12-31",
        },
        {
          row: 2,
          account: { id: accounts[1209]?.id || accounts[1200].id },
          amountGross: -1000,
          amountGrossCurrency: -1000,
          description: "Test credit",
        },
      ],
    });
    if (testVoucher.ok) {
      console.log("  Amortization posting created OK!");
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
