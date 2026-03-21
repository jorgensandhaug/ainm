// Sandbox test: Can we combine tax + disposition into a single 4-line voucher?
// If yes, this saves 1 call in profit scenarios (8 instead of 9)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// First, get account IDs for 8700, 2920, 8800, 2050
const acctRes = await fetch(
  `${BASE}/ledger/account?number=8700,2920,8800,2050&fields=id,number,name&count=100`,
  { headers: H }
);
const acctData = await acctRes.json();
console.log("Accounts found:", acctData.values?.map((a: any) => `${a.number}=${a.id} (${a.name})`));

const acctMap = new Map(acctData.values.map((a: any) => [a.number, a]));

// Check if 8700 exists — it may need to be created
if (!acctMap.has(8700)) {
  console.log("Creating account 8700...");
  const cr = await fetch(`${BASE}/ledger/account`, {
    method: "POST", headers: H,
    body: JSON.stringify({ number: 8700, name: "Skattekostnad på ordinært resultat" }),
  });
  if (!cr.ok) {
    console.log("8700 create failed:", cr.status, await cr.text());
  } else {
    const created = (await cr.json()).value;
    acctMap.set(8700, created);
    console.log("Created 8700:", created.id);
  }
}

const id = (n: number) => acctMap.get(n)!.id;

// Test: Combined tax + disposition as a single 4-line voucher
const taxAmount = 100000;
const postTaxResult = 350000;

const combinedVoucher = {
  date: "2025-12-31",
  description: "Skattekostnad og disponering av årsresultat 2025",
  postings: [
    { row: 1, account: { id: id(8700) }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
    { row: 2, account: { id: id(2920) }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
    { row: 3, account: { id: id(8800) }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
    { row: 4, account: { id: id(2050) }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
  ],
};

console.log("\nTesting combined 4-line voucher (tax + disposition)...");
const r = await fetch(`${BASE}/ledger/voucher`, {
  method: "POST", headers: H, body: JSON.stringify(combinedVoucher),
});
const txt = await r.text();
console.log(`Status: ${r.status}`);
console.log(`Response: ${txt.substring(0, 500)}`);

if (r.ok) {
  console.log("\n✅ Combined voucher SUCCEEDED — can save 1 call in profit scenarios!");
} else {
  console.log("\n❌ Combined voucher FAILED — must keep separate vouchers");
}
