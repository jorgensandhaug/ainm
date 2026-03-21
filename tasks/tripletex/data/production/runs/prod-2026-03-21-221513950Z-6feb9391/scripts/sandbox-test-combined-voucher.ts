// Test: Can we combine tax + disposition into a single 4-line voucher?
// If yes, this saves 1 API call in profit scenarios.
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// First get account IDs for 8700, 2920, 8800, 2050
const acctRes = await fetch(
  `${BASE}/ledger/account?number=8700,2920,8800,2050&fields=id,number,name`,
  { headers: H }
);
const acctData = await acctRes.json();
console.log("Accounts:", acctRes.status);
const acctMap = new Map<number, number>();
for (const a of (acctData.values || [])) {
  acctMap.set(a.number, a.id);
  console.log(`  ${a.number} (${a.name}): id=${a.id}`);
}

const id = (n: number) => acctMap.get(n)!;

// Check if 8700 exists — it may not in sandbox
if (!acctMap.has(8700)) {
  console.log("Creating account 8700...");
  const createRes = await fetch(`${BASE}/ledger/account`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ number: 8700, name: "Skattekostnad på ordinært resultat" }),
  });
  const createData = await createRes.json();
  console.log("Created 8700:", createRes.status);
  if (createRes.ok) {
    acctMap.set(8700, createData.value.id);
  } else {
    console.log("Create 8700 response:", JSON.stringify(createData));
  }
}

// Test: 4-line combined tax+disposition voucher (profit scenario)
// Tax: DR 8700 / CR 2920
// Disposition: DR 8800 / CR 2050
const taxAmount = 10000;
const postTaxResult = 35000; // profit

const combinedRes = await fetch(`${BASE}/ledger/voucher`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    date: "2025-12-31",
    description: "Skattekostnad og disponering av årsresultat 2025",
    postings: [
      { row: 1, account: { id: id(8700) }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
      { row: 2, account: { id: id(2920) }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      { row: 3, account: { id: id(8800) }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
      { row: 4, account: { id: id(2050) }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
    ],
  }),
});
const combinedData = await combinedRes.json();
console.log("\nCombined 4-line voucher:", combinedRes.status);
if (combinedRes.ok) {
  console.log("SUCCESS — combined voucher works!");
  console.log("Voucher ID:", combinedData.value?.id);
  console.log("Postings count:", combinedData.value?.postings?.length);
  // Check that all 4 postings are there
  for (const p of (combinedData.value?.postings || [])) {
    console.log(`  Row ${p.row}: acct=${p.account?.id} amount=${p.amountGross} desc="${p.description}"`);
  }
} else {
  console.log("FAILED — combined voucher rejected");
  console.log(JSON.stringify(combinedData));
}
