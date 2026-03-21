const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { headers: h });
  const j = await r.json();
  console.log(`GET ${path} -> ${r.status}`);
  return j;
}

// Check company info for bank details
const company = await get("company?fields=*");
console.log("\n=== COMPANY ===");
console.log(JSON.stringify(company.value, null, 2).slice(0, 2000));

// Check if there's a bank account set up
const bankAccounts = await get("bank?accountId=424190862&count=100&fields=*");
console.log("\n=== BANK ACCOUNTS linked to 1920 ===");
console.log(JSON.stringify(bankAccounts, null, 2).slice(0, 1000));

// Check bank reconciliation payment types
const reconPayTypes = await get("bank/reconciliation/paymentType?count=100&fields=*");
console.log("\n=== BANK RECON PAYMENT TYPES ===");
for (const pt of (reconPayTypes.values || []).slice(0, 10)) {
  console.log(`  id=${pt.id} desc=${pt.description} ${JSON.stringify(pt)}`);
}

// Check the suggest endpoint
const suggestSpec = await get("bank/reconciliation/match/:suggest?bankReconciliationId=12705478");
console.log("\n=== SUGGEST ===");
console.log(JSON.stringify(suggestSpec, null, 2).slice(0, 1000));

// Get reconciliation settings
const settings = await get("bank/reconciliation/settings?count=100&fields=*");
console.log("\n=== RECON SETTINGS ===");
console.log(JSON.stringify(settings, null, 2).slice(0, 1000));

// Check ledger postings on 1920 for recent entries
const postings = await get("ledger/posting?accountNumberFrom=1920&accountNumberTo=1920&dateFrom=2026-01-01&dateTo=2026-03-01&count=20&fields=*");
console.log("\n=== POSTINGS on 1920 ===");
console.log(`Count: ${postings.values?.length}`);
for (const p of (postings.values || []).slice(0, 10)) {
  console.log(`  id=${p.id} date=${p.date} amount=${p.amount} desc=${p.description} voucherId=${p.voucher?.id}`);
}
