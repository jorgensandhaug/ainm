const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "1U8hAQjTpcN7Dco7oOvu5QJm17hDcvnVJ82Q7y0fwPY";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { headers: h });
  const j = await r.json();
  console.log(`GET ${path} → ${r.status}`);
  console.log(JSON.stringify(j, null, 2));
  if (!r.ok) throw new Error(`GET ${path} failed: ${r.status}`);
  return j.values ?? j.value ?? j;
}

async function post(path: string, body: any) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { method: "POST", headers: h, body: JSON.stringify(body) });
  const j = await r.json();
  console.log(`POST ${path} → ${r.status}`);
  console.log(JSON.stringify(j, null, 2));
  if (!r.ok) throw new Error(`POST ${path} failed: ${r.status}`);
  return j.values ?? j.value ?? j;
}

// Calculations
const accrualAmt = 12400;
const depAmt = Math.round((164250 / 72) * 100) / 100; // 2281.25
const salaryAmt = 45000;
console.log(`Accrual: ${accrualAmt}, Depreciation: ${depAmt}, Salary: ${salaryAmt}`);

// Step 1: GET all needed accounts
const accounts = await get("ledger/account?number=1710,6390,6010,1249,5000,2900&fields=id,number,name&count=100");

const acctMap = new Map<number, number>();
for (const a of accounts) {
  acctMap.set(a.number, a.id);
}
console.log("Account map:", Object.fromEntries(acctMap));

// Check for missing accounts
const needed = [1710, 6390, 6010, 1249, 5000, 2900];
const missing = needed.filter(n => !acctMap.has(n));

if (missing.length > 0) {
  console.log("Missing accounts:", missing);
  const nameMap: Record<number, string> = {
    1249: "Andre transportmidler",
    1710: "Forskuddsbetalte forsikringspremier",
    6390: "Annen kostnad lokaler",
    6010: "Avskr. transportmidler",
    5000: "Lønn til ansatte",
    2900: "Forskudd fra kunder",
  };
  const toCreate = missing.map(n => ({ number: n, name: nameMap[n] || `Account ${n}` }));
  if (toCreate.length === 1) {
    const created = await post("ledger/account", toCreate[0]);
    acctMap.set(created.number, created.id);
  } else {
    const created = await post("ledger/account/list", toCreate);
    for (const a of created) acctMap.set(a.number, a.id);
  }
}

// Step 2: POST combined voucher
const voucher = await post("ledger/voucher", {
  date: "2026-03-31",
  description: "Månedsavslutning mars 2026",
  postings: [
    { row: 1, account: { id: acctMap.get(6390) }, amountGross: accrualAmt, amountGrossCurrency: accrualAmt, description: "Periodisering forskuddsbetalt kostnad" },
    { row: 2, account: { id: acctMap.get(1710) }, amountGross: -accrualAmt, amountGrossCurrency: -accrualAmt, description: "Forskuddsbetalt kostnad" },
    { row: 3, account: { id: acctMap.get(6010) }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
    { row: 4, account: { id: acctMap.get(1249) }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
    { row: 5, account: { id: acctMap.get(5000) }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
    { row: 6, account: { id: acctMap.get(2900) }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
  ],
});

const voucherId = voucher.id;
console.log(`Voucher created: id=${voucherId}`);

// Verification GETs (free)
await get(`ledger/voucher/${voucherId}?fields=id,number,date,description,postings(row,account(number,name),amountGross,amountGrossCurrency)`);

// Trial balance verification
await get("balanceSheet?dateFrom=2026-03-01&dateTo=2026-04-01&accountNumberFrom=1000&accountNumberTo=9999&fields=account(number,name),balanceOut&count=500");

console.log("Done.");
