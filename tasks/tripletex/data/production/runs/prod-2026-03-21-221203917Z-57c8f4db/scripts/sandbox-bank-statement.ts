// Investigate bank statement endpoints for Check 1 fix
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any, formData?: FormData) {
  const url = `${BASE}/${path}`;
  const opts: any = { method, headers: { Authorization: AUTH } };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  if (formData) {
    opts.body = formData;
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log("ERROR:", JSON.stringify(json).slice(0, 500));
  return { status: r.status, data: json };
}

async function get(path: string) { return api("GET", path); }
async function post(path: string, body?: any, formData?: FormData) { return api("POST", path, body, formData); }

// 1. Check existing bank statements
console.log("=== Existing bank statements ===");
const stmts = await get("bank/statement?count=10&fields=*");
console.log("Bank statements:", stmts.data.values?.length);
if (stmts.data.values?.length > 0) {
  for (const s of stmts.data.values.slice(0, 3)) {
    console.log(`  id=${s.id}, from=${s.fromDate}, to=${s.toDate}, file=${s.fileName}, bank=${JSON.stringify(s.bank)}, openBal=${s.openingBalanceCurrency}, closeBal=${s.closingBalanceCurrency}`);
  }
}

// 2. Check bank reconciliation details
console.log("\n=== Bank reconciliation with transactions ===");
const recons = await get("bank/reconciliation?count=10&fields=*");
if (recons.data.values?.length > 0) {
  const r = recons.data.values[0];
  console.log(`recon id=${r.id}, closed=${r.isClosed}, balance=${r.bankAccountClosingBalanceCurrency}`);
  console.log(`transactions count: ${r.transactions?.length}`);
  if (r.transactions?.length > 0) {
    console.log("First transaction:", JSON.stringify(r.transactions[0]).slice(0, 300));
  }
}

// 3. Check if there are bank/statement/transaction endpoints
console.log("\n=== Bank statement transactions (if any statements exist) ===");
if (stmts.data.values?.length > 0) {
  const txns = await get(`bank/statement/transaction?bankStatementId=${stmts.data.values[0].id}&count=10&fields=*`);
  console.log("Transactions:", txns.data.values?.length);
  if (txns.data.values?.length > 0) {
    console.log("First:", JSON.stringify(txns.data.values[0]).slice(0, 300));
  }
}

// 4. Check what /company looks like for bank info
console.log("\n=== Company info ===");
const company = await get("company?fields=*");
console.log("Company:", JSON.stringify(company.data).slice(0, 500));

// 5. Try to find what bank IDs are available
console.log("\n=== Looking for bank endpoint ===");
const bankSearch = await get("bank?count=10&fields=*");
console.log("Banks:", bankSearch.status, JSON.stringify(bankSearch.data).slice(0, 500));

// 6. Try the bank/statement/import approach with a test CSV
// Create a simple CSV in the format Tripletex expects
console.log("\n=== Attempting bank statement import ===");
// The CSV from the task uses semicolons and Norwegian headers
const csvContent = `Dato;Forklaring;Inn;Ut;Saldo
2026-01-18;Innbetaling fra Test SL;1000.00;;101000.00
`;

// We need bankId and accountId
// First, let's check what accounts look like
const accts = await get("ledger/account?number=1920&fields=*");
const acct1920 = accts.data.values?.[0];
console.log("Account 1920:", acct1920?.id);

// Try with DNB_CSV format first (common Norwegian bank)
if (acct1920) {
  const form = new FormData();
  const blob = new Blob([csvContent], { type: "text/csv" });
  form.append("file", blob, "test-bank-statement.csv");

  // Try without bankId first to see error
  const importR = await post(
    `bank/statement/import?bankId=0&accountId=${acct1920.id}&fromDate=2026-01-18&toDate=2026-01-19&fileFormat=DNB_CSV`,
    undefined,
    form
  );
  console.log("Import attempt:", importR.status, JSON.stringify(importR.data).slice(0, 500));
}

// 7. Check if there's a /bank path
console.log("\n=== Check /bank root ===");
const bankR = await get("bank?name=DNB&count=10&fields=*");
console.log("Bank search:", bankR.status, JSON.stringify(bankR.data).slice(0, 500));

console.log("\nDone.");
