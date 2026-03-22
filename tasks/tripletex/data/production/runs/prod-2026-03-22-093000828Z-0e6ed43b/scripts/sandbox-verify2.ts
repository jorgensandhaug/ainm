// Clean sandbox verification: create voucher, read back with postings, verify, delete
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (method === "DELETE") { console.log(`${method} ${path} → ${r.status}`); return null; }
  const j = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.error("ERROR", JSON.stringify(j)); process.exit(1); }
  return j;
}

const prepaidAmt = 11150;
const depAmt = Math.round((147250 / 60) * 100) / 100;
const salaryAmt = 45000;
console.log(`Prepaid: ${prepaidAmt}, Dep: ${depAmt}, Salary: ${salaryAmt}`);

// GET accounts
const acctRes = await api("GET", `/ledger/account?number=1700,6300,6020,1029,5000,2900&fields=id,number,name&count=100`);
const accts: Record<number, number> = {};
for (const a of acctRes.values) accts[a.number] = a.id;
console.log("Accounts:", JSON.stringify(accts));

// POST voucher
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
console.log("Voucher ID:", vid);

// Read back the voucher with postings expanded
const readback = await api("GET", `/ledger/voucher/${vid}?fields=id,date,description,postings(id,row,account(id,number,name),amountGross,amountGrossCurrency,description)`);
const v = readback.value;
console.log(`\nVoucher: date=${v.date} desc="${v.description}"`);
console.log(`Postings (${v.postings.length}):`);
let sum = 0;
for (const p of v.postings) {
  console.log(`  row=${p.row} acct=${p.account.number} (${p.account.name}) gross=${p.amountGross} desc="${p.description}"`);
  sum += p.amountGross;
}
console.log(`Sum: ${sum} ${sum === 0 ? "✓ BALANCED" : "✗ UNBALANCED"}`);

// Delete
await api("DELETE", `/ledger/voucher/${vid}`);
console.log("Done - voucher deleted");
