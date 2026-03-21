// Test bank statement import with different file formats
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any, formData?: FormData) {
  const url = `${BASE}/${path}`;
  const opts: any = { method, headers: { Authorization: AUTH } };
  if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  if (formData) { opts.body = formData; }
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log("  ERROR:", JSON.stringify(json).slice(0, 800));
  return { status: r.status, data: json };
}

async function get(path: string) { return api("GET", path); }

// Get account 1920 ID
const accts = await get("ledger/account?number=1920&fields=*");
const acct1920 = accts.data.values?.[0];
console.log(`Account 1920 id=${acct1920?.id}`);

// Get bank list to find a suitable bank
const banks = await get("bank?count=100&fields=*");
console.log(`\nAvailable banks (${banks.data.fullResultSize}):`);
for (const b of banks.data.values || []) {
  console.log(`  id=${b.id}, name=${b.name}, formats=${JSON.stringify(b.bankStatementFileFormatSupport)}`);
}

// Look at the existing bank statement more closely
console.log("\n=== Existing bank statement details ===");
const stmt = await get("bank/statement/123943025?fields=*");
console.log("Statement:", JSON.stringify(stmt.data.value || stmt.data).slice(0, 500));

// Look at existing transactions
const txns = await get("bank/statement/transaction?bankStatementId=123943025&count=10&fields=*");
console.log("\nTransactions:");
for (const t of txns.data.values || []) {
  console.log(`  id=${t.id}, date=${t.postedDate}, desc=${t.description}, amount=${t.amountCurrency}, matched=${t.matched}`);
}

// Check if we can see what the bank/statement/transaction/details looks like
if (txns.data.values?.length > 0) {
  const details = await get(`bank/statement/transaction/${txns.data.values[0].id}/details?fields=*`);
  console.log("\nTransaction details:", JSON.stringify(details.data).slice(0, 500));
}

// Try DANSKE_BANK_CSV format with our CSV shape
console.log("\n=== Test DANSKE_BANK_CSV import ===");
const csvContent = `Dato;Forklaring;Inn;Ut;Saldo
2026-03-01;Test transaction;500.00;;100500.00
`;
const form1 = new FormData();
form1.append("file", new Blob([csvContent], { type: "text/csv" }), "test.csv");
const imp1 = await api("POST", `bank/statement/import?bankId=76&accountId=${acct1920.id}&fromDate=2026-03-01&toDate=2026-03-02&fileFormat=DANSKE_BANK_CSV`, undefined, form1);
console.log("DANSKE_BANK_CSV:", imp1.status, JSON.stringify(imp1.data).slice(0, 500));

// Try NORDEA_CSV
console.log("\n=== Test NORDEA_CSV import ===");
const form2 = new FormData();
form2.append("file", new Blob([csvContent], { type: "text/csv" }), "test.csv");
const imp2 = await api("POST", `bank/statement/import?bankId=76&accountId=${acct1920.id}&fromDate=2026-03-01&toDate=2026-03-02&fileFormat=NORDEA_CSV`, undefined, form2);
console.log("NORDEA_CSV:", imp2.status, JSON.stringify(imp2.data).slice(0, 500));

// Try SBANKEN_BEDRIFT_CSV
console.log("\n=== Test SBANKEN_BEDRIFT_CSV import ===");
const form3 = new FormData();
form3.append("file", new Blob([csvContent], { type: "text/csv" }), "test.csv");
const imp3 = await api("POST", `bank/statement/import?bankId=76&accountId=${acct1920.id}&fromDate=2026-03-01&toDate=2026-03-02&fileFormat=SBANKEN_BEDRIFT_CSV`, undefined, form3);
console.log("SBANKEN_BEDRIFT_CSV:", imp3.status, JSON.stringify(imp3.data).slice(0, 500));

// Try HAUGESUND_SPAREBANK_CSV
console.log("\n=== Test HAUGESUND_SPAREBANK_CSV ===");
const form4 = new FormData();
form4.append("file", new Blob([csvContent], { type: "text/csv" }), "test.csv");
const imp4 = await api("POST", `bank/statement/import?bankId=76&accountId=${acct1920.id}&fromDate=2026-03-01&toDate=2026-03-02&fileFormat=HAUGESUND_SPAREBANK_CSV`, undefined, form4);
console.log("HAUGESUND:", imp4.status, JSON.stringify(imp4.data).slice(0, 500));

console.log("\nDone.");
