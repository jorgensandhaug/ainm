const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "xdomkQbc-E1KiSFcis1eCbXb169feQK6eL7O8FQjrmQ";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const j = await r.json();
  if (!r.ok) { console.error("ERROR", r.status, JSON.stringify(j)); process.exit(1); }
  return j;
}

// Calculations
const prepaidAmt = 11150;
const depAmt = Math.round((147250 / 60) * 100) / 100; // 2454.17
const salaryAmt = 45000;
console.log("Depreciation:", depAmt);

// Call 1: GET all needed accounts
const needed = [1700, 6300, 6020, 1029, 5000, 2900];
const acctRes = await api("GET", `/ledger/account?number=${needed.join(",")}&fields=id,number,name&count=100`);
const accts: Record<number, number> = {};
for (const a of acctRes.values) accts[a.number] = a.id;
console.log("Found accounts:", Object.keys(accts).map(Number).sort((a,b)=>a-b).join(", "));

// Call 2 (conditional): Create missing accounts
const missing = needed.filter(n => !accts[n]);
if (missing.length > 0) {
  console.log("Missing accounts:", missing.join(", "));
  const names: Record<number, string> = {
    1029: "Akk. avskr. immaterielle eiendeler",
    1109: "Akk. avskr. bygninger",
    1209: "Akk. avskr. maskiner og anlegg",
    6030: "Avskr. maskiner og anlegg",
    1700: "Forskuddsbetalt leiekostnad",
    6300: "Leie lokale",
    6020: "Avskrivning på immaterielle eiendeler",
    5000: "Lønn til ansatte",
    2900: "Påløpt lønn",
  };
  if (missing.length === 1) {
    const n = missing[0];
    const created = await api("POST", "/ledger/account", { number: n, name: names[n] || `Konto ${n}` });
    accts[n] = created.value.id;
  } else {
    const batch = missing.map(n => ({ number: n, name: names[n] || `Konto ${n}` }));
    const created = await api("POST", "/ledger/account/list", batch);
    for (const a of created.values) accts[a.number] = a.id;
  }
  console.log("Created missing accounts");
}

// Call 3 (or 2): POST combined voucher
const voucher = await api("POST", "/ledger/voucher", {
  date: "2026-03-31",
  description: "Månedsavslutning mars 2026",
  postings: [
    { row: 1, account: { id: accts[6300] }, amountGross: prepaidAmt, amountGrossCurrency: prepaidAmt, description: "Periodisering forskuddsbetalt kostnad" },
    { row: 2, account: { id: accts[1700] }, amountGross: -prepaidAmt, amountGrossCurrency: -prepaidAmt, description: "Forskuddsbetalt kostnad" },
    { row: 3, account: { id: accts[6020] }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
    { row: 4, account: { id: accts[1029] }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
    { row: 5, account: { id: accts[5000] }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
    { row: 6, account: { id: accts[2900] }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
  ],
});
console.log("Voucher created:", voucher.value.id, "number:", voucher.value.number);
console.log("Done. Calls:", missing.length > 0 ? 3 : 2);
