const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}/${path}`, { headers: h });
  return await r.json();
}

// Check all reconciliations with period details
const recons = await get("bank/reconciliation?count=100&fields=*,accountingPeriod(*)");
console.log("=== ALL BANK RECONCILIATIONS ===");
for (const r of (recons.values || [])) {
  console.log(`  id=${r.id} period=${r.accountingPeriod?.id} start=${r.accountingPeriod?.start} end=${r.accountingPeriod?.end} closed=${r.isClosed} balance=${r.bankAccountClosingBalanceCurrency}`);
}

// Check periods
const periods = await get("ledger/accountingPeriod?count=20&fields=*");
console.log("\n=== ACCOUNTING PERIODS ===");
for (const p of (periods.values || [])) {
  console.log(`  id=${p.id} start=${p.start} end=${p.end}`);
}

// Try to reopen/delete a reconciliation for testing
console.log("\n=== Trying to delete last reconciliation ===");
const delR = await fetch(`${BASE}/bank/reconciliation/12705478`, {
  method: "DELETE",
  headers: { Authorization: AUTH },
});
console.log(`DELETE -> ${delR.status}`);
if (!delR.ok) {
  const j = await delR.json();
  console.log(`  Error: ${JSON.stringify(j).slice(0, 500)}`);
}

// Try to reopen by PUT with isClosed=false
console.log("\n=== Trying to reopen last reconciliation ===");
const reopenR = await fetch(`${BASE}/bank/reconciliation/12705478`, {
  method: "PUT",
  headers: { ...h },
  body: JSON.stringify({ id: 12705478, isClosed: false, account: { id: 424190862 }, accountingPeriod: { id: 23726305 }, type: "MANUAL", bankAccountClosingBalanceCurrency: -65026.22 }),
});
console.log(`PUT -> ${reopenR.status}`);
const rj = await reopenR.json();
console.log(JSON.stringify(rj).slice(0, 500));
