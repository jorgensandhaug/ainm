// VERIFY: Correct rate selection logic for travel expenses
// The key question: how should the agent pick the right rateType?
// Answer: for multi-day (isDayTrip=false, overnight), pick the rate where
// rateCategory has isValidAccommodation=true AND isRequiresOvernightAccommodation=true
// AND the highest daily rate (which is the "Overnatting over 12 timer" one)
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: H });
  const data = await res.json();
  return data;
}

async function main() {
  // Get all domestic per-diem rates with full category info
  const rateData = await api("GET", "/travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=2026-03-17&dateTo=2026-03-21&count=1000&fields=*");

  console.log("=== Complete rate type catalog ===\n");
  console.log("ID    | Rate | Category Name                                        | DayTrip | Accommodation | OvernightReq");
  console.log("------|------|------------------------------------------------------|---------|---------------|-------------");

  for (const r of (rateData.values || [])) {
    const catData = await api("GET", `/travelExpense/rateCategory/${r.rateCategory?.id}?fields=*`);
    const c = catData.value;
    console.log(`${String(r.id).padEnd(5)} | ${String(r.rate).padEnd(4)} | ${(c?.name || '').padEnd(52)} | ${String(c?.isValidDayTrip).padEnd(7)} | ${String(c?.isValidAccommodation).padEnd(13)} | ${c?.isRequiresOvernightAccommodation}`);
  }

  console.log("\n=== Selection logic ===\n");
  console.log("For MULTI-DAY (overnight) trip:");
  console.log("  Filter: isValidAccommodation=true AND isRequiresOvernightAccommodation=true");
  console.log("  Then pick the one with the HIGHEST rate (Overnatting over 12 timer)");

  // Also verify: does the query param isValidAccommodation work?
  console.log("\n=== Test: filter by isValidAccommodation=true ===");
  const accRates = await api("GET", "/travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=2026-03-17&dateTo=2026-03-21&count=1000&fields=*");
  // No such filter param exists on the rate endpoint. We need to filter locally
  // after fetching rate categories

  // Better approach: can we query rateCategory directly?
  console.log("\n=== Test: filter rate categories ===");
  const catRes = await api("GET", "/travelExpense/rateCategory?isValidAccommodation=true&isValidDomestic=true&count=100&fields=*");
  console.log("Accommodation categories:", catRes.fullResultSize || catRes.values?.length || 0);
  for (const c of (catRes.values || [])) {
    console.log(`  id=${c.id} name="${c.name}" isRequiresOvernightAccommodation=${c.isRequiresOvernightAccommodation}`);
  }

  // Key finding: the correct approach is:
  // 1. GET /travelExpense/rate?type=PER_DIEM&isValidDomestic=true&...
  // 2. For each rate, check its rateCategory
  // 3. For multi-day trips: pick the rate whose category has isValidAccommodation=true
  //    AND the name contains "Overnatting" or has the highest rate among accommodation categories
  //
  // BUT: this requires N+1 API calls (one per rate to get category)
  // Can we avoid that? Let's check if rateCategory is expanded in the rate response

  console.log("\n=== Test: rate with expanded rateCategory ===");
  const expandedRates = await api("GET", "/travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=2026-03-17&dateTo=2026-03-21&count=1000&fields=*,rateCategory(*)");
  for (const r of (expandedRates.values || [])) {
    const c = r.rateCategory;
    console.log(`  id=${r.id} rate=${r.rate} cat.name="${c?.name || 'NOT EXPANDED'}" cat.isValidAccommodation=${c?.isValidAccommodation}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
