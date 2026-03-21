const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "aS02ngjnB-8kWEe0nFhr-3_NBhgycfooxzTVzL-1hFo";
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
  if (!r.ok) { console.error(JSON.stringify(data)); throw new Error(`${r.status}`); }
  return data;
}

async function main() {
  // Step 1: Look up all 6 accounts
  const acctResp = await api("GET", "/ledger/account?number=1700,6300,6020,1029,5000,2900&fields=id,number,name&count=100");
  const accounts: Record<number, number> = {};
  for (const a of acctResp.values) {
    accounts[a.number] = a.id;
  }
  console.log("Found accounts:", Object.keys(accounts).map(Number).sort().join(", "));

  // Step 2: Create missing accounts (expect 1029 missing)
  const missing: { number: number; name: string }[] = [];
  if (!accounts[1029]) missing.push({ number: 1029, name: "Akk. avskr. immaterielle eiendeler" });

  if (missing.length === 1) {
    const created = await api("POST", "/ledger/account", missing[0]);
    accounts[created.value.number] = created.value.id;
    console.log("Created account:", created.value.number, "→ id", created.value.id);
  } else if (missing.length > 1) {
    const created = await api("POST", "/ledger/account/list", missing);
    for (const a of created.values) {
      accounts[a.number] = a.id;
      console.log("Created account:", a.number, "→ id", a.id);
    }
  }

  // Verify all accounts resolved
  for (const n of [1700, 6300, 6020, 1029, 5000, 2900]) {
    if (!accounts[n]) throw new Error(`Account ${n} not found and not created`);
  }

  // Calculations
  const prepaidAmt = 12000;
  const depAmt = Math.round((278500 / 48) * 100) / 100; // 5802.08
  const salaryAmt = 45000;
  console.log("Depreciation amount:", depAmt);

  // Step 3: Combined voucher
  const voucher = {
    date: "2026-03-31",
    description: "Månedsavslutning mars 2026",
    postings: [
      { row: 1, account: { id: accounts[6300] }, amountGross: prepaidAmt, amountGrossCurrency: prepaidAmt, description: "Periodisering forskuddsbetalt kostnad" },
      { row: 2, account: { id: accounts[1700] }, amountGross: -prepaidAmt, amountGrossCurrency: -prepaidAmt, description: "Forskuddsbetalt kostnad" },
      { row: 3, account: { id: accounts[6020] }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
      { row: 4, account: { id: accounts[1029] }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
      { row: 5, account: { id: accounts[5000] }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
      { row: 6, account: { id: accounts[2900] }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
    ],
  };

  const result = await api("POST", "/ledger/voucher", voucher);
  console.log("Voucher created, id:", result.value.id);
  console.log("Postings:", result.value.postings?.length ?? "unknown");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
