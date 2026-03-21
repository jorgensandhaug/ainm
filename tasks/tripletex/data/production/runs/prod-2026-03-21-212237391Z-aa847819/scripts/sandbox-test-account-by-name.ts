// Test whether we can skip GET /ledger/account by providing account number+name in PUT postings
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// First, look up what account 6540 is actually called
console.log("=== Lookup account 6540 ===");
const acctRes = await fetch(`${BASE}/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*`, { headers: H });
const acctData = await acctRes.json();
console.log("Status:", acctRes.status);
if (acctData.values && acctData.values[0]) {
  console.log("Account ID:", acctData.values[0].id);
  console.log("Account number:", acctData.values[0].number);
  console.log("Account name:", acctData.values[0].name);
}
