const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}/${path}`, { headers: h });
  return (await r.json() as any);
}

// Verify the imported statement
const stmt = await get("bank/statement/123943126?fields=*");
console.log("Statement:", JSON.stringify(stmt.value, null, 2));

// Check transactions
const txns = await get("bank/statement/transaction?bankStatementId=123943126&count=100&fields=*");
console.log("\nTransactions:", JSON.stringify(txns.values, null, 2));
