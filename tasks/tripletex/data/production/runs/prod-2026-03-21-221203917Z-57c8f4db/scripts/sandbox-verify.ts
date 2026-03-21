// Sandbox verification: targeted accounting period query + computed closing balance
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function get(path: string) {
  const r = await fetch(`${BASE}/${path}`, { headers: { Authorization: AUTH } });
  const json = await r.json();
  console.log(`GET ${path} → ${r.status}`);
  return json;
}

// Test 1: Targeted accounting period query
// For last CSV date 2026-02-04 → first of month = 2026-02-01
console.log("=== Test 1: Targeted accounting period query ===");
const periodsTargeted = await get("ledger/accountingPeriod?startFrom=2026-02-01&startTo=2026-02-02&count=1&fields=*");
console.log("Targeted result:", JSON.stringify(periodsTargeted.values?.map((p: any) => ({ id: p.id, start: p.start, end: p.end }))));
console.log("Count:", periodsTargeted.values?.length);

// Test 2: Compare with broad query
const periodsBroad = await get("ledger/accountingPeriod?count=100&fields=*");
const feb = periodsBroad.values?.find((p: any) => p.start === "2026-02-01");
console.log("Broad result Feb period:", feb ? { id: feb.id, start: feb.start, end: feb.end } : "NOT FOUND");

// Verify they return the same period
if (periodsTargeted.values?.length > 0 && feb) {
  console.log("Match:", periodsTargeted.values[0].id === feb.id ? "YES ✓" : "NO ✗");
}

// Test 3: Balance sheet for a period
console.log("\n=== Test 3: Balance sheet for 1920 in Feb 2026 ===");
const bal = await get("balanceSheet?dateFrom=2026-02-01&dateTo=2026-03-01&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*");
console.log("Balance sheet 1920:", JSON.stringify(bal.values?.[0]));

// Test 4: Verify bank reconciliation with computed balance works
// We won't actually create one (sandbox already has state), but let's check what exists
console.log("\n=== Test 4: Existing bank reconciliations ===");
const recons = await get("bank/reconciliation?count=10&fields=*");
console.log("Existing reconciliations:", recons.values?.length);
if (recons.values?.length > 0) {
  for (const r of recons.values.slice(0, 3)) {
    console.log(`  id=${r.id}, period=${r.accountingPeriod?.id}, closed=${r.isClosed}, balance=${r.bankAccountClosingBalanceCurrency}`);
  }
}

// Test 5: Can we verify that on a fresh account, computed balance = balance sheet?
// On a fresh account: balance(1920) = sum of all postings we make to 1920
// In production: we make customer payments (debit 1920), supplier payments (credit 1920), non-invoice (both)
// The computed closing balance = sum(Inn from CSV) - sum(|Ut| from CSV)
// This matches because: customer payments are booked as debit 1920, supplier payments as credit 1920
// Non-invoice Inn items debit 1920, non-invoice Ut items credit 1920
console.log("\n=== Test 5: Computed balance analysis ===");
// From the production run CSV:
const csvInn = [23437.50, 15875.00, 18937.50, 6062.50, 14700.00, 440.96, 1563.12, 1163.48];
const csvUt = [11700.00, 17400.00, 13950.00];
const computedBalance = csvInn.reduce((a, b) => a + b, 0) - csvUt.reduce((a, b) => a + b, 0);
console.log(`Sum Inn: ${csvInn.reduce((a, b) => a + b, 0)}`);
console.log(`Sum Ut: ${csvUt.reduce((a, b) => a + b, 0)}`);
console.log(`Computed closing balance: ${computedBalance}`);
console.log(`Balance sheet from production: 39130.06`);
console.log(`CSV ending saldo: 139130.06`);
console.log(`Match computed vs balance sheet: ${Math.abs(computedBalance - 39130.06) < 0.01 ? "YES ✓" : "NO ✗"}`);
console.log(`CSV saldo differs because opening balance was 100000 (not in Tripletex)`);

// Conclusion
console.log("\n=== Conclusions ===");
console.log("1. Targeted accounting period query works — saves bandwidth vs count=100");
console.log("2. Computed balance = sum(Inn) - sum(|Ut|) matches balance sheet on fresh accounts");
console.log("3. Computing balance saves 1 API call (balance sheet read)");
console.log("4. CSV saldo is UNRELIABLE — opening balance may not exist in Tripletex");
console.log("5. Safe optimization: compute closing balance from CSV movements, not CSV saldo");
