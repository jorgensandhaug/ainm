const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "NbUTgSlHH5vWnUcvExTh9h9eV6d43BhzrJFJdSDtMLQ";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Calculations
const accrualAmt = 9200;
const depAmt = Math.round((275800 / 36) * 100) / 100; // 7661.11
const salaryAmt = 45000;

console.log("Depreciation amount:", depAmt);

// Step 1: GET all needed accounts
const acctRes = await fetch(
  `${BASE}/ledger/account?number=1720,6300,6030,1209,5000,2900&fields=id,number,name&count=100`,
  { headers: H }
);
const acctData = await acctRes.json();
console.log("Account lookup:", acctRes.status, JSON.stringify(acctData));

if (!acctRes.ok) {
  console.error("Account lookup failed, aborting");
  process.exit(1);
}

const accounts: Record<number, number> = {};
for (const a of acctData.values) {
  accounts[a.number] = a.id;
}
console.log("Found accounts:", accounts);

// Step 1b: Create missing accounts
const needed = [
  { number: 1209, name: "Akk. avskr. maskiner og anlegg" },
];
const missing = needed.filter((n) => !accounts[n.number]);

if (missing.length === 1) {
  const createRes = await fetch(`${BASE}/ledger/account`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(missing[0]),
  });
  const createData = await createRes.json();
  console.log("Create account:", createRes.status, JSON.stringify(createData));
  if (!createRes.ok) {
    console.error("Account creation failed, aborting");
    process.exit(1);
  }
  accounts[createData.value.number] = createData.value.id;
} else if (missing.length > 1) {
  const createRes = await fetch(`${BASE}/ledger/account/list`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(missing),
  });
  const createData = await createRes.json();
  console.log("Batch create accounts:", createRes.status, JSON.stringify(createData));
  if (!createRes.ok) {
    console.error("Batch account creation failed, aborting");
    process.exit(1);
  }
  for (const a of createData.values) {
    accounts[a.number] = a.id;
  }
}

// Verify all accounts resolved
for (const num of [1720, 6300, 6030, 1209, 5000, 2900]) {
  if (!accounts[num]) {
    console.error(`Account ${num} not resolved, aborting`);
    process.exit(1);
  }
}

// Step 2: Combined voucher
const voucher = {
  date: "2026-03-31",
  description: "Månedsavslutning mars 2026",
  postings: [
    { row: 1, account: { id: accounts[6300] }, amountGross: accrualAmt, amountGrossCurrency: accrualAmt, description: "Periodisering forskuddsbetalt kostnad" },
    { row: 2, account: { id: accounts[1720] }, amountGross: -accrualAmt, amountGrossCurrency: -accrualAmt, description: "Forskuddsbetalt kostnad" },
    { row: 3, account: { id: accounts[6030] }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
    { row: 4, account: { id: accounts[1209] }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
    { row: 5, account: { id: accounts[5000] }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
    { row: 6, account: { id: accounts[2900] }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
  ],
};

const voucherRes = await fetch(`${BASE}/ledger/voucher`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(voucher),
});
const voucherData = await voucherRes.json();
console.log("Voucher:", voucherRes.status, JSON.stringify(voucherData));

if (!voucherRes.ok) {
  console.error("Voucher creation failed");
  process.exit(1);
}

console.log("Done. Voucher ID:", voucherData.value?.id);
console.log("Postings:", voucherData.value?.postings?.length);
