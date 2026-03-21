const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  console.log("GET", url);
  const r = await fetch(url, { headers });
  const j = await r.json();
  console.log("  ->", r.status, JSON.stringify(j).slice(0, 500));
  return { status: r.status, data: j };
}

async function main() {
  // 1. Check what banks exist
  console.log("\n=== Banks ===");
  await get("bank?count=10&fields=*");

  // 2. Check bank statements
  console.log("\n=== Bank Statements ===");
  await get("bank/statement?count=10&fields=*");

  // 3. Check bank reconciliations
  console.log("\n=== Bank Reconciliations ===");
  await get("bank/reconciliation?count=10&fields=*");

  // 4. Check ledger accounts for bank account 1920
  console.log("\n=== Account 1920 ===");
  await get("ledger/account?number=1920&fields=*");

  // 5. Check invoices
  console.log("\n=== Invoices ===");
  await get("invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=10&fields=id,invoiceNumber,amountCurrencyOutstanding,customer(id,name)");

  // 6. Check suppliers
  console.log("\n=== Suppliers ===");
  await get("supplier?count=10&fields=*");

  // 7. Check accounting periods
  console.log("\n=== Accounting Periods ===");
  await get("saft/exportSAF-T?year=2026");
}

main().catch(e => console.error("FATAL:", e.message));
