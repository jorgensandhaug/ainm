// Check all rate types and their rates
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // Check rates for 5-day domestic travel
  const res = await fetch(`${BASE}/travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=2026-03-17&dateTo=2026-03-21&count=1000&fields=*`, {
    headers: H
  });
  const data = await res.json();
  console.log("=== Per diem rates ===");
  console.log("Total:", data.fullResultSize);
  for (const r of (data.values || [])) {
    console.log(`  id=${r.id} rate=${r.rate} description="${r.description || ''}" type=${r.type}`);
    console.log(`    rateCategory id=${r.rateCategory?.id}`);
    // Get full rate category
    const catRes = await fetch(`${BASE}/travelExpense/rateCategory/${r.rateCategory?.id}?fields=*`, { headers: H });
    const cat = await catRes.json();
    console.log(`    rateCategory: ${JSON.stringify(cat.value, null, 2).slice(0, 300)}`);
  }

  // Also check: what rate types exist for all types?
  console.log("\n=== ALL rate types ===");
  const allRes = await fetch(`${BASE}/travelExpense/rate?count=1000&fields=*`, { headers: H });
  const allData = await allRes.json();
  console.log("Total:", allData.fullResultSize);
  for (const r of (allData.values || [])) {
    console.log(`  id=${r.id} rate=${r.rate} type=${r.type} description="${r.description || ''}"`)
  }

  // Check the specific rateType we used (25886)
  console.log("\n=== RateType 25886 ===");
  const rt = await fetch(`${BASE}/travelExpense/rate/25886?fields=*`, { headers: H });
  const rtData = await rt.json();
  console.log(JSON.stringify(rtData.value, null, 2));
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
