// Check: does costCategory response contain paymentType info?
// Also check if paymentType can be embedded in costCategory lookup.
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(BASE + path, { headers: H });
  if (!r.ok) { console.log(`GET ${path} → ${r.status}: ${(await r.text()).slice(0,200)}`); return null; }
  return r.json();
}

async function main() {
  // Test 1: costCategory with expanded fields
  console.log("=== costCategory fields ===");
  const cats = await get("/travelExpense/costCategory?count=5&fields=*");
  if (cats?.values?.[0]) {
    const cat = cats.values.find((c: any) => c.description === "Fly") ?? cats.values[0];
    console.log("Full Fly category:", JSON.stringify(cat, null, 2));
  }

  // Test 2: check paymentType response
  console.log("\n=== paymentType response ===");
  const pts = await get("/travelExpense/paymentType?count=5&fields=*");
  if (pts?.values) {
    for (const p of pts.values) {
      console.log(`  PayType ${p.id}: ${p.description}, showOnTE=${p.showOnTravelExpenses}`);
    }
  }

  // Test 3: Can we POST with paymentType omitted but costCategory set?
  // The standard says this gives 422, but let's reconfirm
  console.log("\n=== Test: POST without paymentType ===");
  const empRes = await get("/employee?count=1&fields=id,companyId");
  const emp = empRes?.values?.[0];
  if (!emp) { console.log("No employee"); return; }

  // Get company for departureFrom
  const compRes = await get(`/company/${emp.companyId}?fields=*,address(*)`);
  const city = compRes?.value?.address?.city ?? "Oslo";

  const flyCat = cats?.values?.find((c: any) => c.description === "Fly");
  if (!flyCat) { console.log("No Fly category"); return; }

  // Try POST with paymentType: { id: 0 } — maybe the system auto-fills?
  const r = await fetch(BASE + "/travelExpense", {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      employee: { id: emp.id },
      title: "Test no payType",
      travelDetails: {
        isForeignTravel: false,
        isDayTrip: false,
        isCompensationFromRates: true,
        departureDate: "2026-03-19",
        returnDate: "2026-03-20",
        departureTime: "08:00",
        returnTime: "18:00",
        departureFrom: city,
        destination: "Bergen",
        detailedJourneyDescription: "Test",
        purpose: "Test",
      },
      perDiemCompensations: [{
        location: "Bergen",
        count: 2,
        rate: 800,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      }],
      costs: [{
        costCategory: { id: flyCat.id },
        // NO paymentType
        comments: "Test flight",
        amountCurrencyIncVat: 1000,
        amountNOKInclVAT: 1000,
        vatType: { id: flyCat.vatType?.id ?? 12 },
        date: "2026-03-19",
      }],
    }),
  });
  console.log(`POST /travelExpense (no payType) → ${r.status}`);
  const body = await r.text();
  console.log(body.slice(0, 500));
}

main().catch(e => console.error("FATAL:", e));
