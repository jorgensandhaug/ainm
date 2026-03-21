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

// Use March 2026 dates (no reconciliation exists for this period)
const result = await post("ledger/voucher", {
  date: "2026-03-10",
  description: "Bank reconciliation - test verification",
  postings: [
    // Supplier payment (amountGross only — like production script)
    { row: 1, date: "2026-03-10", description: "Betaling Supplier Test", account: { id: a2400 }, amountGross: 10850, amountGrossCurrency: 10850 },
    { row: 2, date: "2026-03-10", description: "Betaling Supplier Test", account: { id: a1920 }, amountGross: -10850, amountGrossCurrency: -10850 },
    // Non-invoice: Renteinntekter Ut (all amount fields — like production script)
    { row: 3, date: "2026-03-11", description: "Renteinntekter", account: { id: a8050 }, amount: 1495.08, amountCurrency: 1495.08, amountGross: 1495.08, amountGrossCurrency: 1495.08 },
    { row: 4, date: "2026-03-11", description: "Renteinntekter", account: { id: a1920 }, amount: -1495.08, amountCurrency: -1495.08, amountGross: -1495.08, amountGrossCurrency: -1495.08 },
    // Non-invoice: Skattetrekk Ut
    { row: 5, date: "2026-03-12", description: "Skattetrekk", account: { id: a2600 }, amount: 1819.20, amountCurrency: 1819.20, amountGross: 1819.20, amountGrossCurrency: 1819.20 },
    { row: 6, date: "2026-03-12", description: "Skattetrekk", account: { id: a1920 }, amount: -1819.20, amountCurrency: -1819.20, amountGross: -1819.20, amountGrossCurrency: -1819.20 },
    // Non-invoice: Skattetrekk Inn
    { row: 7, date: "2026-03-13", description: "Skattetrekk", account: { id: a1920 }, amount: 1947.28, amountCurrency: 1947.28, amountGross: 1947.28, amountGrossCurrency: 1947.28 },
    { row: 8, date: "2026-03-13", description: "Skattetrekk", account: { id: a2600 }, amount: -1947.28, amountCurrency: -1947.28, amountGross: -1947.28, amountGrossCurrency: -1947.28 },
  ],
});

if (result.ok) {
  const voucherId = result.data.value?.id;
  console.log("\nVoucher created:", voucherId);

  // Read back the postings
  const postings = await get(`ledger/posting?voucherId=${voucherId}&count=20&fields=*`);
  console.log("\n=== POSTINGS ===");
  for (const p of (postings.values || [])) {
    console.log(`  row=${p.row} date=${p.date} acct=${p.account?.number} amount=${p.amount} amountCurrency=${p.amountCurrency} amountGross=${p.amountGross} amountGrossCurrency=${p.amountGrossCurrency} desc="${p.description}"`);
  }
}
