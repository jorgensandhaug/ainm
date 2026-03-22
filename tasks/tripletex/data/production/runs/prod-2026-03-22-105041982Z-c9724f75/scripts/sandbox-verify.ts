const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Same task: 1720→6300, 6020→1029, 5000→2900
const prepaidAmt = 10150;
const depAmt = Math.round((120100 / 48) * 100) / 100; // 2502.08
const salaryAmt = 45000;

console.log("=== Sandbox verification: month-end closing 1720→6300 + 6020→1029 ===");
console.log("Depreciation:", depAmt);

// Step 1: GET accounts
const acctNums = [1720, 6300, 6020, 1029, 5000, 2900];
const r1 = await fetch(`${BASE}/ledger/account?number=${acctNums.join(",")}&fields=id,number,name&count=100`, { headers: H });
const d1 = await r1.json();
console.log("\nGET accounts:", r1.status);

const acctMap: Record<number, number> = {};
for (const a of d1.values) {
  acctMap[a.number] = a.id;
  console.log(`  ${a.number} ${a.name} → id ${a.id}`);
}

const missing = acctNums.filter(n => !acctMap[n]);
console.log("Missing:", missing.length ? missing.join(", ") : "none");

// In sandbox, 1029 may exist from prior tests. If missing, create it.
if (missing.length === 1) {
  const missingNames: Record<number, string> = { 1029: "Akk. avskr. immaterielle eiendeler" };
  const num = missing[0];
  const r = await fetch(`${BASE}/ledger/account`, {
    method: "POST", headers: H,
    body: JSON.stringify({ number: num, name: missingNames[num] || `Konto ${num}` }),
  });
  const d = await r.json();
  console.log("POST create account:", r.status, d.value?.id);
  acctMap[num] = d.value.id;
} else if (missing.length > 1) {
  const missingNames: Record<number, string> = {
    1029: "Akk. avskr. immaterielle eiendeler",
    1109: "Akk. avskr. bygninger",
    1209: "Akk. avskr. maskiner og anlegg",
    6030: "Avskr. maskiner og anlegg",
  };
  const batch = missing.map(num => ({ number: num, name: missingNames[num] || `Konto ${num}` }));
  const r = await fetch(`${BASE}/ledger/account/list`, {
    method: "POST", headers: H, body: JSON.stringify(batch),
  });
  const d = await r.json();
  console.log("POST batch create:", r.status);
  for (const a of d.values) {
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

const r2 = await fetch(`${BASE}/ledger/voucher`, {
  method: "POST", headers: H,
  body: JSON.stringify(voucher),
});
const d2 = await r2.json();
console.log("\nPOST voucher:", r2.status);

if (r2.ok) {
  const v = d2.value;
  console.log(`Voucher id=${v.id}, number=${v.number}, date=${v.date}`);

  // Verification GET
  const r3 = await fetch(`${BASE}/ledger/voucher/${v.id}?fields=id,number,date,description,postings(row,account(number,name),amountGross,amountGrossCurrency)`, { headers: H });
  const d3 = await r3.json();
  console.log("\nVerification:");
  let sum = 0;
  for (const p of d3.value.postings) {
    console.log(`  Row ${p.row}: ${p.account.number} ${p.account.name} → ${p.amountGross}`);
    sum += p.amountGross;
  }
  console.log(`\nBalance check: sum = ${sum} (should be 0)`);
  console.log(sum === 0 ? "✓ BALANCED" : "✗ IMBALANCED");

  // Clean up: delete the sandbox voucher
  const delRes = await fetch(`${BASE}/ledger/voucher/${v.id}`, { method: "DELETE", headers: H });
  console.log(`\nCleanup: DELETE voucher ${v.id} → ${delRes.status}`);
} else {
  console.log("Voucher error:", JSON.stringify(d2));
}
