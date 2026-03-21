const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}/${path}`, { headers: h });
  return await r.json();
}

// There's an open reconciliation for Aug 2026 (id=12705483, not closed)
// Let me try creating a match for it

// First, get some postings on account 1920
const postings = await get("ledger/posting?accountNumberFrom=1920&accountNumberTo=1920&dateFrom=2026-08-01&dateTo=2026-09-01&count=5&fields=*");
console.log("Postings in Aug:", postings.values?.length || 0);
for (const p of (postings.values || []).slice(0, 3)) {
  console.log(`  id=${p.id} date=${p.date} amount=${p.amount} desc="${p.description}"`);
}

// Try to create a match with just postings (no bank transactions)
const matchBody = {
  bankReconciliation: { id: 12705483 },
  type: "MANUAL",
  postings: (postings.values || []).slice(0, 1).map((p: any) => ({ id: p.id })),
};

console.log("\n=== Trying to create match ===");
console.log("Body:", JSON.stringify(matchBody));
const matchR = await fetch(`${BASE}/bank/reconciliation/match`, {
  method: "POST",
  headers: h,
  body: JSON.stringify(matchBody),
});
const matchJ = await matchR.json();
console.log(`POST match -> ${matchR.status}`);
console.log(JSON.stringify(matchJ, null, 2).slice(0, 1500));

// Also try the suggest endpoint
console.log("\n=== Trying suggest ===");
const suggestR = await fetch(`${BASE}/bank/reconciliation/match/:suggest?bankReconciliationId=12705483`, {
  method: "PUT",
  headers: h,
});
const suggestJ = await suggestR.json();
console.log(`PUT suggest -> ${suggestR.status}`);
console.log(JSON.stringify(suggestJ, null, 2).slice(0, 1000));

// Check the adjustment endpoint
console.log("\n=== Check BankReconciliationAdjustment schema ===");
// Get the schema via a GET first
const reconDetail = await get("bank/reconciliation/12705483?fields=*");
console.log("Recon:", JSON.stringify(reconDetail.value, null, 2).slice(0, 500));
