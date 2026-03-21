// Quick check: GET /ledger/account?number=1920 vs ?isBankAccount=true
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const [r1, r2] = await Promise.all([
  fetch(`${BASE}/ledger/account?number=1920&fields=id,number,name,isBankAccount,bankAccountNumber`, { headers: H }).then(r => r.json()),
  fetch(`${BASE}/ledger/account?isBankAccount=true&fields=id,number,name,isBankAccount,bankAccountNumber`, { headers: H }).then(r => r.json()),
]);

console.log("number=1920:", JSON.stringify(r1.values?.map((a: any) => ({id: a.id, num: a.number, bank: a.bankAccountNumber})), null, 2));
console.log("\nisBankAccount=true:", JSON.stringify(r2.values?.map((a: any) => ({id: a.id, num: a.number, bank: a.bankAccountNumber})), null, 2));
