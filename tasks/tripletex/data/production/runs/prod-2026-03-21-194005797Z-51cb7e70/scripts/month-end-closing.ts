const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "RRxG-Rb-vnNp6q3nZu2VaIKYKXcFaqmyG_h9B2xuJmQ";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Calculations
const accrualAmt = 8050;
const depAmt = Math.round((179850 / 48) * 100) / 100; // 3746.88
const salaryAmt = 45000;

console.log("Depreciation amount:", depAmt);

// Step 1: GET all needed accounts
const acctNums = "1720,6300,6020,1029,5000,2900";
const acctRes = await fetch(`${BASE}/ledger/account?number=${acctNums}&fields=id,number,name&count=100`, { headers: H });
const acctData = await acctRes.json();
console.log("Account lookup status:", acctRes.status);
console.log("Accounts found:", JSON.stringify(acctData.values?.map((a: any) => ({ id: a.id, number: a.number, name: a.name }))));

const acctMap = new Map<number, number>();
for (const a of acctData.values || []) {
  acctMap.set(a.number, a.id);
}

// Step 2: Create missing accounts (expect 1029 missing)
const missing: { number: number; name: string }[] = [];
if (!acctMap.has(1029)) missing.push({ number: 1029, name: "Akk. avskr. immaterielle eiendeler" });
if (!acctMap.has(6300)) missing.push({ number: 6300, name: "Leie lokale" });
if (!acctMap.has(6020)) missing.push({ number: 6020, name: "Avskr. immaterielle eiendeler" });
if (!acctMap.has(1720)) missing.push({ number: 1720, name: "Andre depositum" });
if (!acctMap.has(5000)) missing.push({ number: 5000, name: "Lønn til ansatte" });
if (!acctMap.has(2900)) missing.push({ number: 2900, name: "Forskudd fra kunder" });

if (missing.length > 0) {
  console.log("Missing accounts:", missing.map(m => m.number));
  const createUrl = missing.length === 1 ? `${BASE}/ledger/account` : `${BASE}/ledger/account/list`;
  const createBody = missing.length === 1 ? missing[0] : missing;
  const createRes = await fetch(createUrl, { method: "POST", headers: H, body: JSON.stringify(createBody) });
  const createData = await createRes.json();
  console.log("Create accounts status:", createRes.status);
  console.log("Created:", JSON.stringify(createData));

  if (missing.length === 1) {
    acctMap.set(createData.value.number, createData.value.id);
  } else {
    for (const a of createData.values || []) {
      acctMap.set(a.number, a.id);
    }
  }
}

// Verify all IDs resolved
for (const num of [1720, 6300, 6020, 1029, 5000, 2900]) {
  if (!acctMap.has(num)) {
    console.error(`FATAL: Account ${num} not resolved`);
    process.exit(1);
  }
}

// Step 3: POST combined voucher
const voucher = {
  date: "2026-03-31",
  description: "Månedsavslutning mars 2026",
  postings: [
    { row: 1, account: { id: acctMap.get(6300) }, amountGross: accrualAmt, amountGrossCurrency: accrualAmt, description: "Periodisering forskuddsbetalt kostnad" },
    { row: 2, account: { id: acctMap.get(1720) }, amountGross: -accrualAmt, amountGrossCurrency: -accrualAmt, description: "Forskuddsbetalt kostnad" },
    { row: 3, account: { id: acctMap.get(6020) }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
    { row: 4, account: { id: acctMap.get(1029) }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
    { row: 5, account: { id: acctMap.get(5000) }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
    { row: 6, account: { id: acctMap.get(2900) }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
  ],
};

console.log("Posting voucher...");
const voucherRes = await fetch(`${BASE}/ledger/voucher`, { method: "POST", headers: H, body: JSON.stringify(voucher) });
const voucherData = await voucherRes.json();
console.log("Voucher status:", voucherRes.status);
console.log("Voucher response:", JSON.stringify(voucherData.value ? { id: voucherData.value.id, number: voucherData.value.number, postings: voucherData.value.postings?.length } : voucherData));
