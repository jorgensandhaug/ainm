// Sandbox verification: month-end closing with 147250/5yr depreciation to 6020→1029
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const j = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.error("ERROR", JSON.stringify(j)); process.exit(1); }
  return j;
}

// Same calculations as production
const prepaidAmt = 11150;
const depAmt = Math.round((147250 / 60) * 100) / 100; // 2454.17
const salaryAmt = 45000;
console.log("Depreciation:", depAmt);

// Call 1: GET accounts
const needed = [1700, 6300, 6020, 1029, 5000, 2900];
const acctRes = await api("GET", `/ledger/account?number=${needed.join(",")}&fields=id,number,name&count=100`);
const accts: Record<number, number> = {};
for (const a of acctRes.values) accts[a.number] = a.id;
const found = Object.keys(accts).map(Number).sort((a,b)=>a-b);
console.log("Found accounts:", found.join(", "));

const missing = needed.filter(n => !accts[n]);
console.log("Missing:", missing.length ? missing.join(", ") : "none");

// Call 2 (conditional): Create missing
if (missing.length > 0) {
  const names: Record<number, string> = {
    1029: "Akk. avskr. immaterielle eiendeler",
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
}

// Call 3: POST combined voucher
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

const vid = voucher.value.id;
console.log("Voucher created:", vid, "number:", voucher.value.number);

// Verification GET: read back the voucher postings
const vGet = await api("GET", `/ledger/voucher/${vid}?fields=*`);
console.log("Voucher date:", vGet.value.date, "description:", vGet.value.description);

const postingsGet = await api("GET", `/ledger/posting?voucherId=${vid}&dateFrom=2026-03-01&dateTo=2026-03-31&fields=*&count=100`);
console.log("Postings count:", postingsGet.count);
let sum = 0;
for (const p of postingsGet.values) {
  console.log(`  Row ${p.row}: account ${p.account.number} (${p.account.name}) amount=${p.amountGross} desc="${p.description}"`);
  sum += p.amountGross;
}
console.log("Sum of all postings:", sum, sum === 0 ? "✓ BALANCED" : "✗ UNBALANCED");

// Clean up: delete the sandbox voucher
const delUrl = `/ledger/voucher/${vid}`;
const delR = await fetch(`${BASE}${delUrl}`, { method: "DELETE", headers: H });
console.log(`DELETE ${delUrl} → ${delR.status}`);
