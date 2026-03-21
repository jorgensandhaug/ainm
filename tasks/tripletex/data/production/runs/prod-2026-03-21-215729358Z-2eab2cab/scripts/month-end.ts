const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "k_s-bv6jg4yG9wFDXO0f5g2e5zsfyJa9e4Hiq3ipxMc";
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
  if (!r.ok) { console.error(JSON.stringify(data, null, 2)); throw new Error(`${r.status}`); }
  return data;
}

async function main() {
  // Step 1: GET all needed accounts
  const accts = await api("GET", "/ledger/account?number=1700,6300,6020,1029,5000,2900&fields=id,number,name&count=100");
  const byNum: Record<number, number> = {};
  for (const a of accts.values) byNum[a.number] = a.id;
  console.log("Accounts found:", Object.keys(byNum).map(Number).sort().join(", "));

  // Step 2: Create 1029 if missing
  if (!byNum[1029]) {
    console.log("Creating account 1029...");
    const created = await api("POST", "/ledger/account", { number: 1029, name: "Akk. avskr. immaterielle eiendeler" });
    byNum[1029] = created.value.id;
    console.log("Created 1029 with id", byNum[1029]);
  }

  // Verify all accounts resolved
  for (const n of [1700, 6300, 6020, 1029, 5000, 2900]) {
    if (!byNum[n]) throw new Error(`Account ${n} not found`);
  }

  // Calculations
  const prepaidAmt = 12000;
  const depAmt = Math.round((278500 / 48) * 100) / 100; // 5802.08
  const salaryAmt = 45000;
  console.log(`Amounts: prepaid=${prepaidAmt}, depreciation=${depAmt}, salary=${salaryAmt}`);

  // Step 3: Combined voucher
  const voucher = await api("POST", "/ledger/voucher", {
    date: "2026-03-31",
    description: "Månedsavslutning mars 2026",
    postings: [
      { row: 1, account: { id: byNum[6300] }, amountGross: prepaidAmt, amountGrossCurrency: prepaidAmt, description: "Periodisering forskuddsbetalt kostnad" },
      { row: 2, account: { id: byNum[1700] }, amountGross: -prepaidAmt, amountGrossCurrency: -prepaidAmt, description: "Forskuddsbetalt kostnad" },
      { row: 3, account: { id: byNum[6020] }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
      { row: 4, account: { id: byNum[1029] }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
      { row: 5, account: { id: byNum[5000] }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
      { row: 6, account: { id: byNum[2900] }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
    ],
  });

  console.log("Voucher created:", voucher.value.id, "with", voucher.value.postings?.length, "postings");
  console.log("Done. 3 calls, 0 errors.");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
