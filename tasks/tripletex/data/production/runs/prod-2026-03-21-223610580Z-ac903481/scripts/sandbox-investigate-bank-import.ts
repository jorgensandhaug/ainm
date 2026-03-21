const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}/${path}`, { headers: h });
  const t = await r.text();
  console.log(`GET ${path} → ${r.status}`);
  try { return JSON.parse(t); } catch { console.log(t.substring(0, 500)); return null; }
}

// 1. Check what banks exist
const banks = await get("bank?count=100&fields=*");
console.log("Banks:", JSON.stringify(banks?.values?.slice(0, 5)));

// 2. Check what bank statements exist already
const stmts = await get("bank/statement?count=10&fields=*");
console.log("Statements:", JSON.stringify(stmts?.values?.slice(0, 5)));

// 3. Check ledger account 1920 for bank account details
const accts = await get("ledger/account?number=1920&fields=*");
console.log("Account 1920:", JSON.stringify(accts?.values));

// 4. Check if there's a company bank account
const company = await get("company/1?fields=*");
console.log("Company:", JSON.stringify(company?.value).substring(0, 1000));
