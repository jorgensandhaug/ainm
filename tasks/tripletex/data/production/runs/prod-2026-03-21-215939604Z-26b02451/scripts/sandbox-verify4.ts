const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

// Find incoming payment types via the correct endpoint
const ptR = await fetch(`${BASE}/ledger/paymentTypeOut?count=50&fields=*`, { headers: h });
const ptD = await ptR.json();
console.log("All paymentTypeOut:", ptD.count);
ptD.values?.forEach((pt: any) => console.log("  ", pt.id, JSON.stringify(pt)));

// Also check if there are separate "in" types
const ptR2 = await fetch(`${BASE}/ledger/paymentTypeOut?description=Innbetaling&count=50&fields=*`, { headers: h });
const ptD2 = await ptR2.json();
console.log("\nInnbetaling types:", ptD2.count);
ptD2.values?.forEach((pt: any) => console.log("  ", pt.id, JSON.stringify(pt)));

// The trusted standard for register-customer-invoice-payment should tell us
// Let's just search for the correct endpoint
