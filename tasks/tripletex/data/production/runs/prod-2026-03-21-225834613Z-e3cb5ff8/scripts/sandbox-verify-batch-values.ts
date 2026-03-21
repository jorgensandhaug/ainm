// Sandbox: try to find any lower-call shortcut for dimension value creation
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(data).slice(0, 500));
  return { status: r.status, data, ok: r.ok };
}

async function main() {
  // Check existing dimensions
  const dims = await api("GET", "/ledger/accountingDimensionName?fields=*");
  if (dims.ok) {
    const existing = dims.data.values || [];
    console.log(`Existing dimensions: ${existing.length}`);
    for (const d of existing) {
      console.log(`  index=${d.dimensionIndex} name=${d.dimensionName} active=${d.active}`);
    }
  }

  // If all 3 slots full, we can't test dimension creation.
  // Instead, test: can we POST two values in one call via any method?
  // Already proven impossible in prior sandbox sessions.

  // Try: can we create a voucher with account number embedded differently?
  // Test with account number as string in a nested object
  const acctTest = await api("POST", "/ledger/voucher", {
    date: "2026-03-22",
    description: "test-number-shortcut",
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { number: 7140 },
        amount: 100,
        amountCurrency: 100,
        amountGross: 100,
        amountGrossCurrency: 100,
      },
      {
        row: 2,
        account: { number: 1920 },
        amount: -100,
        amountCurrency: -100,
        amountGross: -100,
        amountGrossCurrency: -100,
      },
    ],
  });
  console.log(`Number-only voucher result: ${acctTest.status}`);
}

main();
