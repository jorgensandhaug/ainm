// Deep investigation: check what yearEnd API shows for different account combinations
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Check current yearEnd state
console.log("=== Current yearEnd state ===");
const yeRes = await fetch(`${BASE}/yearEnd?year=2025&fields=taxCost,annualResult,yearEndReportPosting`, { headers: H });
const ye = await yeRes.json();
console.log("taxCost:", JSON.stringify(ye.value.taxCost));
console.log("annualResult:", ye.value.annualResult);
console.log("yearEndReportPosting:", JSON.stringify(ye.value.yearEndReportPosting));

// Check what a posting to 8300/2500 does to the yearEnd
console.log("\n=== Testing tax posting to 8300/2500 ===");
const acctRes = await fetch(`${BASE}/ledger/account?number=8300,2500&fields=id,number&count=10`, { headers: H });
const acctData = await acctRes.json();
const accts: Record<number, number> = {};
for (const a of acctData.values) accts[a.number] = a.id;
console.log("Account IDs:", accts);

const taxVoucher = {
  date: "2025-12-31",
  description: "Test skattekostnad 8300/2500",
  postings: [
    { row: 1, account: { id: accts[8300] }, amountGross: 50000, amountGrossCurrency: 50000, description: "Skattekostnad" },
    { row: 2, account: { id: accts[2500] }, amountGross: -50000, amountGrossCurrency: -50000, description: "Betalbar skatt" },
  ]
};
const tvRes = await fetch(`${BASE}/ledger/voucher`, { method: "POST", headers: H, body: JSON.stringify(taxVoucher) });
if (tvRes.ok) {
  const tvData = await tvRes.json();
  console.log("Tax voucher created:", tvData.value.id);
} else {
  console.log("Failed:", tvRes.status, await tvRes.text());
}

// Now check yearEnd again
console.log("\n=== yearEnd AFTER 8300/2500 posting ===");
const yeRes2 = await fetch(`${BASE}/yearEnd?year=2025&fields=taxCost,annualResult,yearEndReportPosting`, { headers: H });
const ye2 = await yeRes2.json();
console.log("taxCost:", JSON.stringify(ye2.value.taxCost));
console.log("annualResult:", ye2.value.annualResult);
console.log("yearEndReportPosting:", JSON.stringify(ye2.value.yearEndReportPosting));

// Check balance sheet to see where 8300 and 2500 appear
console.log("\n=== Balance sheet for accounts 8300 and 2500 ===");
const bs8300 = await fetch(`${BASE}/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8300&accountNumberTo=8300&fields=account(number,name),balanceOut&count=10`, { headers: H });
if (bs8300.ok) {
  const bs = await bs8300.json();
  for (const r of bs.values || []) {
    console.log(`  ${r.account?.number} ${r.account?.name}: balanceOut=${r.balanceOut}`);
  }
}
const bs2500 = await fetch(`${BASE}/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=2500&accountNumberTo=2500&fields=account(number,name),balanceOut&count=10`, { headers: H });
if (bs2500.ok) {
  const bs = await bs2500.json();
  for (const r of bs.values || []) {
    console.log(`  ${r.account?.number} ${r.account?.name}: balanceOut=${r.balanceOut}`);
  }
}

// Also check 8700 and 2920 current state
console.log("\n=== Balance sheet for accounts 8700 and 2920 ===");
const bs8700 = await fetch(`${BASE}/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8700&accountNumberTo=8700&fields=account(number,name),balanceOut&count=10`, { headers: H });
if (bs8700.ok) {
  const bs = await bs8700.json();
  for (const r of bs.values || []) {
    console.log(`  ${r.account?.number} ${r.account?.name}: balanceOut=${r.balanceOut}`);
  }
}

// Check annualAccounts after posting
console.log("\n=== yearEnd/annualAccounts AFTER 8300/2500 posting ===");
const aaRes = await fetch(`${BASE}/yearEnd/annualAccounts?year=2025&fields=ordinaryResultBeforeTaxes,ordinaryResultAfterTaxes,netProfitOrLossForTheYear,transfers`, { headers: H });
if (aaRes.ok) {
  const aa = await aaRes.json();
  console.log("ordinaryResultBeforeTaxes:", JSON.stringify(aa.value.ordinaryResultBeforeTaxes));
  console.log("ordinaryResultAfterTaxes:", JSON.stringify(aa.value.ordinaryResultAfterTaxes));
  console.log("netProfitOrLossForTheYear:", JSON.stringify(aa.value.netProfitOrLossForTheYear));
  console.log("transfers:", JSON.stringify(aa.value.transfers));
}

console.log("\nDONE");
