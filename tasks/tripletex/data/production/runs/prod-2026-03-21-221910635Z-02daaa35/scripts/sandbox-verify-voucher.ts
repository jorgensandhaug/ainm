const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { headers: h });
  return await r.json();
}

async function post(path: string, body: any) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { method: "POST", headers: h, body: JSON.stringify(body) });
  const j = await r.json();
  console.log(`POST ${path} -> ${r.status}`);
  if (!r.ok) console.log("  Error:", JSON.stringify(j).slice(0, 500));
  return { ok: r.ok, data: j };
}

// Get account IDs
const accts = await get("ledger/account?number=1920,2400,2600,7770,8050&fields=*");
const acct = (num: number) => (accts.values || []).find((a: any) => a.number === num)?.id;
const a1920 = acct(1920)!;
const a2400 = acct(2400)!;
const a2600 = acct(2600)!;
const a8050 = acct(8050)!;

// Get suppliers
const suppliers = await get("supplier?count=1000&fields=*");
const suppId = suppliers.values?.[0]?.id;
console.log("Supplier:", suppId, suppliers.values?.[0]?.name);

// Create a test voucher mimicking our production script exactly
const result = await post("ledger/voucher", {
  date: "2026-01-24",
  description: "Bank reconciliation - test verification",
  postings: [
    // Supplier payment (like production script)
    { row: 1, date: "2026-01-24", description: "Betaling Supplier Test", account: { id: a2400 }, amountGross: 10850, amountGrossCurrency: 10850, supplier: { id: suppId } },
    { row: 2, date: "2026-01-24", description: "Betaling Supplier Test", account: { id: a1920 }, amountGross: -10850, amountGrossCurrency: -10850 },
    // Non-invoice: Renteinntekter Ut (like production script)
    { row: 3, date: "2026-01-30", description: "Renteinntekter", account: { id: a8050 }, amount: 1495.08, amountCurrency: 1495.08, amountGross: 1495.08, amountGrossCurrency: 1495.08 },
    { row: 4, date: "2026-01-30", description: "Renteinntekter", account: { id: a1920 }, amount: -1495.08, amountCurrency: -1495.08, amountGross: -1495.08, amountGrossCurrency: -1495.08 },
    // Non-invoice: Skattetrekk Ut (like production script)
    { row: 5, date: "2026-01-31", description: "Skattetrekk", account: { id: a2600 }, amount: 1819.20, amountCurrency: 1819.20, amountGross: 1819.20, amountGrossCurrency: 1819.20 },
    { row: 6, date: "2026-01-31", description: "Skattetrekk", account: { id: a1920 }, amount: -1819.20, amountCurrency: -1819.20, amountGross: -1819.20, amountGrossCurrency: -1819.20 },
    // Non-invoice: Skattetrekk Inn (like production script)
    { row: 7, date: "2026-02-02", description: "Skattetrekk", account: { id: a1920 }, amount: 1947.28, amountCurrency: 1947.28, amountGross: 1947.28, amountGrossCurrency: 1947.28 },
    { row: 8, date: "2026-02-02", description: "Skattetrekk", account: { id: a2600 }, amount: -1947.28, amountCurrency: -1947.28, amountGross: -1947.28, amountGrossCurrency: -1947.28 },
  ],
});

if (result.ok) {
  const voucherId = result.data.value?.id;
  console.log("\nVoucher created:", voucherId);

  // Read back the voucher postings to see what was actually stored
  const voucher = await get(`ledger/voucher/${voucherId}?fields=*`);
  console.log("\nVoucher:", JSON.stringify(voucher.value, null, 2).slice(0, 1000));

  // Read the individual postings
  const postings = await get(`ledger/posting?voucherId=${voucherId}&count=20&fields=*`);
  console.log("\n=== POSTINGS ===");
  for (const p of (postings.values || [])) {
    console.log(`  row=${p.row} date=${p.date} acct=${p.account?.number} amount=${p.amount} amountCurrency=${p.amountCurrency} amountGross=${p.amountGross} amountGrossCurrency=${p.amountGrossCurrency} desc="${p.description}" supplier=${p.supplier?.id || 'none'}`);
  }
}
