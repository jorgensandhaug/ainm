// Sandbox verification: confirm the 3-call path for month-end closing 6020→1029 variant
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.error(JSON.stringify(data, null, 2)); return null; }
  return data;
}

async function main() {
  // Step 1: GET all needed accounts (same as production)
  const accts = await api("GET", "/ledger/account?number=1700,6300,6020,1029,5000,2900&fields=id,number,name&count=100");
  if (!accts) { console.error("Failed to get accounts"); return; }

  const byNum: Record<number, number> = {};
  for (const a of accts.values) {
    byNum[a.number] = a.id;
    console.log(`  Account ${a.number} (${a.name}): id=${a.id}`);
  }
  console.log("Accounts found:", Object.keys(byNum).map(Number).sort().join(", "));

  // In sandbox, 1029 may already exist from prior runs
  const missing1029 = !byNum[1029];
  console.log(`1029 missing: ${missing1029}`);

  if (missing1029) {
    const created = await api("POST", "/ledger/account", { number: 1029, name: "Akk. avskr. immaterielle eiendeler" });
    if (!created) { console.error("Failed to create 1029"); return; }
    byNum[1029] = created.value.id;
    console.log("Created 1029 with id", byNum[1029]);
  }

  // Step 2: Combined voucher (using a different date to avoid conflicts with prior sandbox runs)
  const depAmt = Math.round((278500 / 48) * 100) / 100; // 5802.08
  console.log(`Depreciation: 278500/48 = ${depAmt}`);

  const voucher = await api("POST", "/ledger/voucher", {
    date: "2026-03-31",
    description: "Sandbox verification: Månedsavslutning mars 2026",
    postings: [
      { row: 1, account: { id: byNum[6300] }, amountGross: 12000, amountGrossCurrency: 12000, description: "Periodisering forskuddsbetalt kostnad" },
      { row: 2, account: { id: byNum[1700] }, amountGross: -12000, amountGrossCurrency: -12000, description: "Forskuddsbetalt kostnad" },
      { row: 3, account: { id: byNum[6020] }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
      { row: 4, account: { id: byNum[1029] }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
      { row: 5, account: { id: byNum[5000] }, amountGross: 45000, amountGrossCurrency: 45000, description: "Lønn til ansatte" },
      { row: 6, account: { id: byNum[2900] }, amountGross: -45000, amountGrossCurrency: -45000, description: "Påløpt lønn" },
    ],
  });

  if (voucher) {
    console.log("\nVoucher created successfully:");
    console.log(`  ID: ${voucher.value.id}`);
    console.log(`  Date: ${voucher.value.date}`);
    console.log(`  Description: ${voucher.value.description}`);
    console.log(`  Postings: ${voucher.value.postings?.length}`);
    for (const p of voucher.value.postings || []) {
      console.log(`    Row ${p.row}: account ${p.account?.id} (${p.account?.number}), gross=${p.amountGross}, desc="${p.description}"`);
    }
  }

  // Verify: total calls
  const totalCalls = missing1029 ? 3 : 2;
  console.log(`\nTotal calls: ${totalCalls} (${missing1029 ? "1029 was missing" : "all accounts existed"})`);
  console.log("Sandbox verification complete.");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
