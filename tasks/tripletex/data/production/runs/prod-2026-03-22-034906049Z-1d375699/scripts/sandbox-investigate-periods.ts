// Investigate: bank reconciliation matching requires transactions to be in the same accounting period
// The production run created ONE reconciliation for February, but 8/11 bank txns were in January
// Result: 8 x 422 "Banktransaksjoner er ikke en del av bankavstemmingen"

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any, isFormData = false): Promise<any> {
  const url = `${BASE}/${path}`;
  const headers: any = { Authorization: AUTH };
  if (body && !isFormData) headers["Content-Type"] = "application/json";
  const opts: any = { method, headers };
  if (body) opts.body = isFormData ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) console.error(`ERROR ${res.status} ${method} ${path}:`, JSON.stringify(data).substring(0, 300));
  return data;
}

const get = (p: string) => api("GET", p);

// Check what accounting periods exist for January and February
console.log("=== Accounting Periods ===");
const janPeriods = await get("ledger/accountingPeriod?startFrom=2026-01-01&startTo=2026-01-02&count=1&fields=*");
console.log("January period:", JSON.stringify(janPeriods.values?.[0]));

const febPeriods = await get("ledger/accountingPeriod?startFrom=2026-02-01&startTo=2026-02-02&count=1&fields=*");
console.log("February period:", JSON.stringify(febPeriods.values?.[0]));

// Check existing reconciliations
console.log("\n=== Existing Bank Reconciliations ===");
const existingRecons = await get("bank/reconciliation?count=100&fields=*");
console.log("Count:", existingRecons.fullResultSize);
for (const r of (existingRecons.values || [])) {
  console.log(`  Recon id=${r.id}, period=${r.accountingPeriod?.id}, isClosed=${r.isClosed}, closingBalance=${r.bankAccountClosingBalanceCurrency}`);
}

// Check bank statements
console.log("\n=== Existing Bank Statements ===");
const bankStatements = await get("bank/statement?count=100&fields=*");
console.log("Count:", bankStatements.fullResultSize);
for (const s of (bankStatements.values || []).slice(0, 5)) {
  console.log(`  Statement id=${s.id}, from=${s.fromDate}, to=${s.toDate}, opening=${s.openingBalanceCurrency}, closing=${s.closingBalanceCurrency}`);
}

// Check bank statement transactions
console.log("\n=== Bank Statement Transactions (latest) ===");
if (bankStatements.values?.length > 0) {
  const latestId = bankStatements.values[bankStatements.values.length - 1].id;
  const txns = await get(`bank/statement/transaction?bankStatementId=${latestId}&count=100&fields=id,postedDate,amountCurrency,description,matched,matchType`);
  console.log("Count:", txns.fullResultSize);
  for (const t of (txns.values || [])) {
    console.log(`  txn id=${t.id}, date=${t.postedDate}, amt=${t.amountCurrency}, matched=${t.matched}, desc=${t.description?.substring(0, 50)}`);
  }
}
