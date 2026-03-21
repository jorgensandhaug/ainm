const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "yFKm4GJdCEKRD0HhDhLfMBh5effn5muoUi35ygJWf2Q";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Calculations
const accrualAmt = 3400;
const depAmt = Math.round((289700 / (7 * 12)) * 100) / 100; // 3448.81
const salaryAmt = 45000;

console.log("Depreciation amount:", depAmt);

// Step 1: GET all needed accounts
const acctNums = [1700, 6300, 6020, 1029, 5000, 2900];
const r1 = await fetch(`${BASE}/ledger/account?number=${acctNums.join(",")}&fields=id,number,name&count=100`, { headers: H });
const d1 = await r1.json();
console.log("GET accounts:", r1.status);

const acctMap: Record<number, number> = {};
for (const a of d1.values) {
  acctMap[a.number] = a.id;
}
console.log("Found accounts:", Object.keys(acctMap).map(Number));

// Step 2: Create missing accounts
const missing = acctNums.filter(n => !acctMap[n]);
console.log("Missing accounts:", missing);

if (missing.length > 0) {
  const nameMap: Record<number, string> = {
    1029: "Akk. avskr. immaterielle eiendeler",
    1109: "Akk. avskr. bygninger",
    1209: "Akk. avskr. maskiner og anlegg",
    6030: "Avskr. maskiner og anlegg",
    6300: "Leie lokale",
    6390: "Annen kostnad lokaler",
    8150: "Rentekostnad",
  };
  const toCreate = missing.map(n => ({ number: n, name: nameMap[n] || `Account ${n}` }));

  if (toCreate.length === 1) {
    const r2 = await fetch(`${BASE}/ledger/account`, { method: "POST", headers: H, body: JSON.stringify(toCreate[0]) });
    const d2 = await r2.json();
    console.log("POST create account:", r2.status, d2.value?.id);
    acctMap[d2.value.number] = d2.value.id;
  } else {
    const r2 = await fetch(`${BASE}/ledger/account/list`, { method: "POST", headers: H, body: JSON.stringify(toCreate) });
    const d2 = await r2.json();
    console.log("POST create accounts:", r2.status);
    for (const a of d2.values) {
      acctMap[a.number] = a.id;
    }
  }
}

// Step 3: POST combined voucher
const voucher = {
  date: "2026-03-31",
  description: "Månedsavslutning mars 2026",
  postings: [
    { row: 1, account: { id: acctMap[6300] }, amountGross: accrualAmt, amountGrossCurrency: accrualAmt, description: "Periodisering forskuddsbetalt kostnad" },
    { row: 2, account: { id: acctMap[1700] }, amountGross: -accrualAmt, amountGrossCurrency: -accrualAmt, description: "Forskuddsbetalt kostnad" },
    { row: 3, account: { id: acctMap[6020] }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
    { row: 4, account: { id: acctMap[1029] }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
    { row: 5, account: { id: acctMap[5000] }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
    { row: 6, account: { id: acctMap[2900] }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
  ],
};

const r3 = await fetch(`${BASE}/ledger/voucher`, { method: "POST", headers: H, body: JSON.stringify(voucher) });
const d3 = await r3.json();
console.log("POST voucher:", r3.status);
if (r3.ok) {
  console.log("Voucher ID:", d3.value.id, "Number:", d3.value.number);
  console.log("Postings:", d3.value.postings?.length);
} else {
  console.log("Error:", JSON.stringify(d3));
}
