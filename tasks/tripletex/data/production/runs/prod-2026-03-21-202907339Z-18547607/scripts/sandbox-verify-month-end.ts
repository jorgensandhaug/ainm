const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.error(JSON.stringify(data)); }
  return { status: r.status, data, ok: r.ok };
}

async function main() {
  // Verify the exact production flow in sandbox
  // Step 1: Account lookup - same accounts as production run
  const acctResp = await api("GET", "/ledger/account?number=1700,6300,6020,1029,5000,2900&fields=id,number,name&count=100");
  if (!acctResp.ok) return;

  const accounts: Record<number, number> = {};
  for (const a of acctResp.data.values) {
    accounts[a.number] = a.id;
    console.log(`  Account ${a.number} (${a.name}) → id ${a.id}`);
  }

  const allExist = [1700, 6300, 6020, 1029, 5000, 2900].every(n => accounts[n]);
  console.log("\nAll 6 accounts exist:", allExist);
  if (!allExist) {
    console.log("Missing:", [1700, 6300, 6020, 1029, 5000, 2900].filter(n => !accounts[n]));
  }

  // Verify depreciation calculation
  const depAmt = Math.round((278500 / 48) * 100) / 100;
  console.log("\nDepreciation 278500/48 =", depAmt, "(expected 5802.08)");

  // Step 2: Create combined voucher with same values as production
  const voucher = {
    date: "2026-03-31",
    description: "Sandbox verify: Månedsavslutning mars 2026",
    postings: [
      { row: 1, account: { id: accounts[6300] }, amountGross: 12000, amountGrossCurrency: 12000, description: "Periodisering forskuddsbetalt kostnad" },
      { row: 2, account: { id: accounts[1700] }, amountGross: -12000, amountGrossCurrency: -12000, description: "Forskuddsbetalt kostnad" },
      { row: 3, account: { id: accounts[6020] }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
      { row: 4, account: { id: accounts[1029] }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
      { row: 5, account: { id: accounts[5000] }, amountGross: 45000, amountGrossCurrency: 45000, description: "Lønn til ansatte" },
      { row: 6, account: { id: accounts[2900] }, amountGross: -45000, amountGrossCurrency: -45000, description: "Påløpt lønn" },
    ],
  };

  const voucherResp = await api("POST", "/ledger/voucher", voucher);
  if (!voucherResp.ok) return;

  console.log("\nVoucher created:", voucherResp.data.value.id);
  console.log("Postings count:", voucherResp.data.value.postings?.length);

  // Verify each posting
  for (const p of voucherResp.data.value.postings || []) {
    console.log(`  Row ${p.row}: account ${p.account?.number} amount ${p.amountGross} "${p.description}"`);
  }

  // Verify balance: sum of all postings should be 0
  const sum = (voucherResp.data.value.postings || []).reduce((s: number, p: any) => s + p.amountGross, 0);
  console.log("\nSum of all postings:", sum, sum === 0 ? "✓ BALANCED" : "✗ UNBALANCED");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
