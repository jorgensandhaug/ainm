// Verify the delivered expense (11150570) has correct fields
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { headers: H });
  if (!r.ok) { const t = await r.text(); console.error(`GET ${url} ${r.status}: ${t}`); return null; }
  return r.json();
}

async function main() {
  // Read the delivered expense
  const te = await get("travelExpense/11150570?fields=*");
  console.log("Travel expense:", JSON.stringify(te?.value, null, 2));

  // Read per diem compensations
  const pdc = await get("travelExpense/perDiemCompensation?travelExpenseId=11150570&fields=*");
  console.log("\nPer diem compensations:", JSON.stringify(pdc?.values, null, 2));

  // Read costs
  const costs = await get("travelExpense/cost?travelExpenseId=11150570&fields=*");
  console.log("\nCosts:", JSON.stringify(costs?.values, null, 2));
}

main().catch(e => console.error(e));
