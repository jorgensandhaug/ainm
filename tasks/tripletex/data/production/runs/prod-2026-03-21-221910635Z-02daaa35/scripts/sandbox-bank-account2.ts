const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { headers: h });
  const j = await r.json();
  console.log(`GET ${path} -> ${r.status}`);
  if (!r.ok) console.log("  ERROR:", JSON.stringify(j).slice(0, 500));
  return j;
}

// Try to get company with myId
const comp = await get("company/1?fields=*");
console.log("\n=== COMPANY ===");
console.log(JSON.stringify(comp, null, 2).slice(0, 1500));

// Check bank reconciliation payment types
const reconPayTypes = await get("bank/reconciliation/paymentType?count=100&fields=*");
console.log("\n=== BANK RECON PAYMENT TYPES ===");
console.log(`Count: ${reconPayTypes.values?.length}`);
for (const pt of (reconPayTypes.values || []).slice(0, 10)) {
  console.log(`  id=${pt.id} desc=${pt.description} bankAccountId=${pt.bankAccount?.id}`);
}

// Get reconciliation settings
const settings = await get("bank/reconciliation/settings?count=100&fields=*");
console.log("\n=== RECON SETTINGS ===");
console.log(JSON.stringify(settings, null, 2).slice(0, 1500));

// Check the last closed reconciliation in detail
const lastRecon = await get("bank/reconciliation/12705478?fields=*");
console.log("\n=== LAST RECON DETAIL ===");
console.log(JSON.stringify(lastRecon, null, 2).slice(0, 2000));

// Check ledger postings on 1920
const postings = await get("ledger/posting?accountNumberFrom=1920&accountNumberTo=1920&dateFrom=2026-01-01&dateTo=2026-03-01&count=20&fields=*");
console.log("\n=== POSTINGS on 1920 ===");
console.log(`Count: ${postings.values?.length}`);
for (const p of (postings.values || []).slice(0, 10)) {
  console.log(`  id=${p.id} date=${p.date} amount=${p.amount} desc=${p.description}`);
}
