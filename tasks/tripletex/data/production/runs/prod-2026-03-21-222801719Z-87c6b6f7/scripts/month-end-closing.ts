const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ewaUBaWwMHWBDH4eQiPd1UbmYXaDTN9WxYpPjFfCHCw";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Accounts needed: 1710(prepaid), 6390(expense), 6020(dep expense), 1029(accum dep), 5000(salary exp), 2900(salary liab)
const needed = [1710, 6390, 6020, 1029, 5000, 2900];

// Step 1: GET all accounts
const acctRes = await fetch(`${BASE}/ledger/account?number=${needed.join(",")}&fields=id,number,name&count=100`, { headers: H });
if (!acctRes.ok) { console.error("GET accounts failed:", acctRes.status, await acctRes.text()); process.exit(1); }
const acctData = await acctRes.json();
console.log("GET accounts:", acctRes.status, JSON.stringify(acctData.values?.map((a: any) => ({ id: a.id, number: a.number }))));

const acctMap: Record<number, number> = {};
for (const a of acctData.values) acctMap[a.number] = a.id;

// Dynamically detect ALL missing accounts
const missing = needed.filter(n => !acctMap[n]);
console.log("Missing accounts:", missing);

// Step 2: Create missing accounts if any
if (missing.length > 0) {
  const names: Record<number, string> = {
    1029: "Akk. avskr. immaterielle eiendeler",
    1109: "Akk. avskr. bygninger",
    1209: "Akk. avskr. maskiner og anlegg",
    6030: "Avskr. maskiner og anlegg",
  };
  const toCreate = missing.map(n => ({ number: n, name: names[n] || `Account ${n}` }));

  let createRes: Response;
  if (toCreate.length === 1) {
    createRes = await fetch(`${BASE}/ledger/account`, { method: "POST", headers: H, body: JSON.stringify(toCreate[0]) });
  } else {
    createRes = await fetch(`${BASE}/ledger/account/list`, { method: "POST", headers: H, body: JSON.stringify(toCreate) });
  }
  if (!createRes.ok) { console.error("Create accounts failed:", createRes.status, await createRes.text()); process.exit(1); }
  const created = await createRes.json();
  console.log("Created accounts:", createRes.status);

  if (Array.isArray(created)) {
    for (const a of created) acctMap[a.value.number] = a.value.id;
  } else {
    acctMap[created.value.number] = created.value.id;
  }
}

// Calculations
const accrualAmt = 12250;
const depAmt = Math.round((144950 / (9 * 12)) * 100) / 100; // 1342.13
const salaryAmt = 45000;
console.log("Depreciation:", depAmt);

// Step 3: POST combined voucher
const voucher = {
  date: "2026-03-31",
  description: "Månedsavslutning mars 2026",
  postings: [
    { row: 1, account: { id: acctMap[6390] }, amountGross: accrualAmt, amountGrossCurrency: accrualAmt, description: "Periodisering forskuddsbetalt kostnad" },
    { row: 2, account: { id: acctMap[1710] }, amountGross: -accrualAmt, amountGrossCurrency: -accrualAmt, description: "Forskuddsbetalt kostnad" },
    { row: 3, account: { id: acctMap[6020] }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
    { row: 4, account: { id: acctMap[1029] }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
    { row: 5, account: { id: acctMap[5000] }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
    { row: 6, account: { id: acctMap[2900] }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
  ],
};

const vRes = await fetch(`${BASE}/ledger/voucher`, { method: "POST", headers: H, body: JSON.stringify(voucher) });
const vBody = await vRes.json();
console.log("POST voucher:", vRes.status, JSON.stringify({ id: vBody.value?.id, postings: vBody.value?.postings?.length }));
if (!vRes.ok) { console.error("Voucher error:", JSON.stringify(vBody)); process.exit(1); }
console.log("DONE. Voucher ID:", vBody.value?.id, "with", vBody.value?.postings?.length, "postings");
