const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Get postings for voucher 609371919 via individual GET
const voucherId = 609371919;

// Get posting IDs from the voucher
const postingIds = [3846385708, 3846385709, 3846385714];

for (const pid of postingIds) {
  console.log(`\n=== Posting ${pid} ===`);
  const r = await fetch(`${BASE}/ledger/posting/${pid}?fields=*`, {
    headers: { Authorization: AUTH }
  });
  if (r.ok) {
    const d = await r.json();
    console.log(JSON.stringify(d.value, null, 2));
  } else {
    // Try searching
    console.log("Direct GET failed:", r.status);
  }
}

// Also try the search endpoint for postings
console.log("\n=== POSTINGS VIA SEARCH ===");
const sr = await fetch(`${BASE}/ledger/posting?dateFrom=2026-01-01&dateTo=2026-12-31&voucherId=${voucherId}&fields=id,row,date,description,account(id,number,name),amount,amountCurrency,amountGross,amountGrossCurrency,amountVat,vatType(id,number,name,percentage),supplier(id,name),invoiceNumber,termOfPayment`, {
  headers: { Authorization: AUTH }
});
if (sr.ok) {
  const sd = await sr.json();
  console.log("Count:", sd.count);
  for (const p of sd.values) {
    console.log(JSON.stringify(p, null, 2));
  }
} else {
  console.log("Search failed:", sr.status, await sr.text());
}
