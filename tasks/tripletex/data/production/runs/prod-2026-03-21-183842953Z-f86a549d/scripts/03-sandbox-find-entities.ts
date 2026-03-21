const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Find any customer
const custRes = await fetch(`${BASE}/customer?count=3&fields=id,name,organizationNumber`, { headers: H });
const custData = await custRes.json();
console.log("=== Customers ===");
console.log(JSON.stringify(custData.values, null, 2));

// Find any assignable project manager
const mgrRes = await fetch(`${BASE}/employee?assignableProjectManagers=true&count=3&fields=id,email,firstName,lastName`, { headers: H });
const mgrData = await mgrRes.json();
console.log("\n=== Assignable Managers ===");
console.log(JSON.stringify(mgrData.values, null, 2));
