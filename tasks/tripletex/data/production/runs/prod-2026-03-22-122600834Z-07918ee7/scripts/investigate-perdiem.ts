// Deep investigation: explore all perDiem rate categories and types
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(json, null, 2)); return null; }
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

async function run() {
  // 1. Explore all rate categories
  console.log("=== RATE CATEGORIES ===");
  const cats = await api("GET", "/travelExpense/rateCategory?count=1000&fields=*");
  if (cats) {
    for (const c of cats) {
      console.log(`  id=${c.id} name="${c.name}" type=${c.type} isValidDomestic=${c.isValidDomestic} isValidDayTrip=${c.isValidDayTrip} isValidAccommodation=${c.isValidAccommodation} isRequiresOvernightAccommodation=${c.isRequiresOvernightAccommodation}`);
    }
  }

  // 2. Explore all rate types for domestic, non-day-trip
  console.log("\n=== RATE TYPES (domestic, not day trip) ===");
  const rates = await api("GET", "/travelExpense/rateCategory?isValidDomestic=true&isValidDayTrip=false&count=1000&fields=*");
  if (rates) {
    for (const r of rates) {
      console.log(`  id=${r.id} name="${r.name}" type=${r.type} fromDate=${r.fromDate} toDate=${r.toDate}`);
    }
  }

  // 3. Specifically look for "Kost" or "Diett" categories
  console.log("\n=== SEARCHING FOR KOST/DIETT CATEGORIES ===");
  if (cats) {
    for (const c of cats) {
      if (c.name?.toLowerCase().includes("kost") || c.name?.toLowerCase().includes("diett") || c.name?.toLowerCase().includes("diet") || c.name?.toLowerCase().includes("måltid") || c.name?.toLowerCase().includes("meal")) {
        console.log(`  MATCH: id=${c.id} name="${c.name}" type=${c.type}`);
      }
    }
  }

  // 4. Look at the specific rate types under each category
  console.log("\n=== RATE TYPES (all) ===");
  // Try to get rate types
  const rateTypes = await api("GET", "/travelExpense/rateCategory?count=1000&fields=*");

  // 5. Also explore perDiemCompensation endpoint for available options
  console.log("\n=== PER DIEM COMPENSATION TYPES ===");
  // Check if there's a rateType endpoint
  const rateTypesAll = await api("GET", "/travelExpense/rate?count=1000&fields=*");
  if (rateTypesAll) {
    for (const rt of rateTypesAll) {
      console.log(`  id=${rt.id} rate=${rt.rate} breakfastRate=${rt.breakfastDeductionRate} lunchRate=${rt.lunchDeductionRate} dinnerRate=${rt.dinnerDeductionRate} zone=${rt.zone?.id || 'none'} category=${rt.rateCategory?.id || 'none'}`);
    }
  }

  // 6. Look at accommodation allowance types
  console.log("\n=== ACCOMMODATION ALLOWANCE ENDPOINT ===");
  const accom = await api("GET", "/travelExpense/accommodationAllowance?count=10&fields=*");

  console.log("\nINVESTIGATION DONE");
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
