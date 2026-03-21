// Test bank reconciliation on a period AFTER the existing one
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${path}`);
  const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  console.log(`  → ${r.status} ${text.substring(0, 500)}`);
  if (!r.ok) return null;
  return JSON.parse(text);
}

async function main() {
  const acctId = 424190862; // account 1920

  // Try March 2026 (period id=23726302, 2026-03-01..2026-04-01)
  // First get balance sheet
  const balR = await api("GET", "/balanceSheet?dateFrom=2026-03-01&dateTo=2026-04-01&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*");
  const closingBalance = balR?.values?.[0]?.balanceOut ?? 0;
  console.log(`\nMarch balance: ${closingBalance}`);

  // Create + close reconciliation for March
  const reconResult = await api("POST", "/bank/reconciliation", {
    account: { id: acctId },
    accountingPeriod: { id: 23726302 },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: closingBalance,
    isClosed: true,
  });

  if (reconResult) {
    console.log(`\nCreated: id=${reconResult.value?.id} isClosed=${reconResult.value?.isClosed}`);
  }

  // Now test: what happens if we try to use an INCORRECT balance? Let's try April with wrong balance
  const balR2 = await api("GET", "/balanceSheet?dateFrom=2026-04-01&dateTo=2026-05-01&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*");
  const realBal = balR2?.values?.[0]?.balanceOut ?? 0;
  console.log(`\nApril real balance: ${realBal}`);

  // Try with a WRONG balance to see the error
  const wrongResult = await api("POST", "/bank/reconciliation", {
    account: { id: acctId },
    accountingPeriod: { id: 23726303 }, // April
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: realBal + 1000, // wrong
    isClosed: true,
  });

  // Try with CORRECT balance
  const correctResult = await api("POST", "/bank/reconciliation", {
    account: { id: acctId },
    accountingPeriod: { id: 23726303 }, // April
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: realBal,
    isClosed: true,
  });

  if (correctResult) {
    console.log(`\nApril created: id=${correctResult.value?.id} isClosed=${correctResult.value?.isClosed}`);
  }

  console.log("\nDone.");
}

main().catch(e => console.error(e));
