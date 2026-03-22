const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "3RowdHOHVYowvwH4hfslHjjiWQ5IBIxI164I5o7Mww0";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Calculations
const prepaidAmt = 10150;
const depAmt = Math.round((120100 / 48) * 100) / 100; // 2502.08
const salaryAmt = 45000;

console.log("Depreciation amount:", depAmt);

// Step 1: GET all needed accounts
const acctNums = [1720, 6300, 6020, 1029, 5000, 2900];
const acctRes = await fetch(`${BASE}/ledger/account?number=${acctNums.join(",")}&fields=id,number,name&count=100`, { headers: H });
const acctData = await acctRes.json();
console.log("GET accounts:", acctRes.status);

const acctMap: Record<number, number> = {};
for (const a of acctData.values) {
  acctMap[a.number] = a.id;
  console.log(`  ${a.number} ${a.name} → id ${a.id}`);
}

// Detect missing accounts
const missing = acctNums.filter(n => !acctMap[n]);
console.log("Missing accounts:", missing.length ? missing.join(", ") : "none");

const missingNames: Record<number, string> = {
  1029: "Akk. avskr. immaterielle eiendeler",
  1109: "Akk. avskr. bygninger",
  1209: "Akk. avskr. maskiner og anlegg",
  6030: "Avskr. maskiner og anlegg",
};

// Step 1b: Create missing accounts
if (missing.length === 1) {
  const num = missing[0];
  const createRes = await fetch(`${BASE}/ledger/account`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ number: num, name: missingNames[num] || `Konto ${num}` }),
  });
  const created = await createRes.json();
  console.log("POST create account:", createRes.status, created.value?.id);
  acctMap[num] = created.value.id;
} else if (missing.length > 1) {
  const batch = missing.map(num => ({ number: num, name: missingNames[num] || `Konto ${num}` }));
  const createRes = await fetch(`${BASE}/ledger/account/list`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(batch),
  });
  const created = await createRes.json();
  console.log("POST batch create accounts:", createRes.status);
  for (const a of created.values) {
    acctMap[a.number] = a.id;
    console.log(`  Created ${a.number} → id ${a.id}`);
  }
}

// Step 2: Combined voucher
const voucher = {
  date: "2026-03-31",
  description: "Månedsavslutning mars 2026",
  postings: [
    { row: 1, account: { id: acctMap[6300] }, amountGross: prepaidAmt, amountGrossCurrency: prepaidAmt, description: "Periodisering forskuddsbetalt kostnad" },
    { row: 2, account: { id: acctMap[1720] }, amountGross: -prepaidAmt, amountGrossCurrency: -prepaidAmt, description: "Forskuddsbetalt kostnad" },
    { row: 3, account: { id: acctMap[6020] }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
    { row: 4, account: { id: acctMap[1029] }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
    { row: 5, account: { id: acctMap[5000] }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
    { row: 6, account: { id: acctMap[2900] }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
  ],
};

const vRes = await fetch(`${BASE}/ledger/voucher`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(voucher),
});
const vData = await vRes.json();
console.log("POST voucher:", vRes.status);

if (vRes.ok) {
  const v = vData.value;
  console.log(`Voucher created: id=${v.id}, number=${v.number}, date=${v.date}`);
  console.log(`Description: ${v.description}`);
  if (v.postings) {
    for (const p of v.postings) {
      console.log(`  Row ${p.row}: ${p.account?.number} ${p.account?.name} → ${p.amountGross}`);
    }
  }
  // Verification GET (free)
  const verifyRes = await fetch(`${BASE}/ledger/voucher/${v.id}?fields=id,number,date,description,postings(row,account(number,name),amountGross,amountGrossCurrency)`, { headers: H });
  const verifyData = await verifyRes.json();
  console.log("\nVerification GET:", verifyRes.status);
  for (const p of verifyData.value.postings) {
    console.log(`  Row ${p.row}: ${p.account.number} ${p.account.name} → ${p.amountGross} / ${p.amountGrossCurrency}`);
  }
} else {
  console.log("Voucher error:", JSON.stringify(vData));
}
