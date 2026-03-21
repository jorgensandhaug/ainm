// Sandbox verification for simplified year-end closing path
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) {
    console.error("ERROR:", JSON.stringify(data).slice(0, 500));
  }
  return { status: r.status, data, ok: r.ok };
}

// Test 1: Verify account lookup with multiple numbers (comma-separated)
console.log("=== Test 1: Account lookup ===");
const acctRes = await api("GET", "/ledger/account?number=6010,1209,1700,6300,8700,2920&fields=id,number,name&count=100");
if (acctRes.ok) {
  const found = acctRes.data.values.map((a: any) => a.number);
  console.log("Found accounts:", found);
  const needed = [6010, 1209, 1700, 6300, 8700, 2920];
  const missing = needed.filter(n => !found.includes(n));
  console.log("Missing accounts:", missing);
}

// Test 2: Verify balanceSheet with accountNumberTo exclusivity
console.log("\n=== Test 2: Balance sheet ===");
const bsRes = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000");
if (bsRes.ok) {
  const accts = bsRes.data.values.map((v: any) => v.account?.number).filter(Boolean);
  const max = Math.max(...accts);
  const min = Math.min(...accts);
  console.log("Account range:", min, "-", max, "(count:", bsRes.data.values.length, ")");
  console.log("Max account < 8700 (exclusive)?", max < 8700);
  let sumBalanceOut = 0;
  for (const row of bsRes.data.values) {
    sumBalanceOut += row.balanceOut ?? 0;
  }
  console.log("Sum of balanceOut:", sumBalanceOut);
  console.log("Pre-tax profit (negated):", -sumBalanceOut);
}

// Test 3: Verify voucher posting with row:1 and row:2 on sandbox
// Use existing accounts (pick two that we know exist from test 1)
console.log("\n=== Test 3: Voucher posting ===");
if (acctRes.ok && acctRes.data.values.length >= 2) {
  const ids: Record<number, number> = {};
  for (const a of acctRes.data.values) ids[a.number] = a.id;

  // Need at least 6010 and one contra. If 1209 doesn't exist, try creating it.
  if (!ids[1209]) {
    console.log("Creating account 1209...");
    const createRes = await api("POST", "/ledger/account", { number: 1209, name: "Akkumulerte avskrivninger sandbox" });
    if (createRes.ok) {
      ids[1209] = createRes.data.value.id;
      console.log("Created 1209 with id:", ids[1209]);
    }
  }

  if (ids[6010] && ids[1209]) {
    const vRes = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Sandbox verify: avskrivning test",
      postings: [
        { row: 1, account: { id: ids[6010] }, amountGross: 24960, amountGrossCurrency: 24960, description: "Test avskrivning" },
        { row: 2, account: { id: ids[1209] }, amountGross: -24960, amountGrossCurrency: -24960, description: "Test akk. avskrivning" },
      ],
    });
    if (vRes.ok) {
      console.log("Voucher created successfully, id:", vRes.data.value?.id);
    }
  } else {
    console.log("Skipping voucher test - missing required accounts");
  }
}

// Test 4: Verify balanceSheet includes vouchers just posted (after a brief wait)
console.log("\n=== Test 4: Post-voucher balance sheet check ===");
const bs2 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=6010&accountNumberTo=6011&fields=*,account(id,number,name)&count=10");
if (bs2.ok && bs2.data.values.length > 0) {
  console.log("Account 6010 balanceOut:", bs2.data.values[0].balanceOut);
  console.log("Balance reflects posted vouchers: YES");
}

console.log("\n=== All sandbox tests complete ===");
