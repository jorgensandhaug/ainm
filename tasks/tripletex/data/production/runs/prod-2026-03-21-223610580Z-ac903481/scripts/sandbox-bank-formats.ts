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

// Check bank ID 76
const bank76 = await get("bank/76?fields=*");
console.log("Bank 76:", JSON.stringify(bank76?.value));

// Look for DNB bank
const dnb = await get("bank?name=DNB&count=10&fields=*");
console.log("DNB banks:", JSON.stringify(dnb?.values));

// Look for Nordea
const nordea = await get("bank?name=Nordea&count=10&fields=*");
console.log("Nordea banks:", JSON.stringify(nordea?.values));

// Look for Danske Bank
const danske = await get("bank?name=Danske&count=10&fields=*");
console.log("Danske banks:", JSON.stringify(danske?.values));

// Look for Sbanken
const sbanken = await get("bank?name=Sbanken&count=10&fields=*");
console.log("Sbanken banks:", JSON.stringify(sbanken?.values));

// Check an existing bank statement transaction for details
const txn = await get("bank/statement/transaction/189465762?fields=*");
console.log("Transaction:", JSON.stringify(txn?.value));
