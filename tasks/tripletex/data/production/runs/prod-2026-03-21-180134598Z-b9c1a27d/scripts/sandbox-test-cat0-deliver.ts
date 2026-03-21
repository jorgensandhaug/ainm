// Test: Can we POST with costCategory id=0 and paymentType id=0 then deliver?
// And if so, what category does it map to?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  return r.json();
}
async function post(path: string, payload: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(payload) });
  const body = await r.json();
  console.log(`POST ${path} -> ${r.status}`);
  if (!r.ok) console.error(JSON.stringify(body).slice(0, 500));
  return { ok: r.ok, body };
}
async function put(path: string) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: H });
  const body = await r.json();
  console.log(`PUT ${path} -> ${r.status}`);
  if (!r.ok) console.error(JSON.stringify(body).slice(0, 500));
  return { ok: r.ok, body };
}
async function del(path: string) {
  await fetch(`${BASE}${path}`, { method: "DELETE", headers: H });
}

async function main() {
  const empId = 18478235;

  // First get a valid rateType
  const rateRes = await get("/travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=2026-03-17&dateTo=2026-03-21&count=1000&fields=*");
  const rateType = rateRes.values[0];
  console.log("rateType:", rateType.id);

  // Test: POST with costCategory id=0 and paymentType id=0, WITH rateType, then deliver
  const res = await post("/travelExpense", {
    employee: { id: empId },
    title: "Test cat0 deliver",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: "2026-03-17",
      returnDate: "2026-03-21",
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom: "Oslo",
      destination: "Ålesund",
      detailedJourneyDescription: "Test",
      purpose: "Test",
    },
    perDiemCompensations: [{
      location: "Ålesund",
      count: 5,
      rate: 800,
      amount: 4000,
      rateType: { id: rateType.id },
      overnightAccommodation: "HOTEL",
    }],
    costs: [
      {
        costCategory: { id: 0 },
        paymentType: { id: 0 },
        comments: "flight",
        amountCurrencyIncVat: 2750,
        amountNOKInclVAT: 2750,
        vatType: { id: 0 },
        date: "2026-03-17",
      },
    ],
  });

  if (res.ok) {
    const teId = res.body.value.id;
    console.log("Created with id=0 cat/pt. id:", teId);

    // Try deliver
    const deliverRes = await put(`/travelExpense/:deliver?id=${teId}`);
    if (deliverRes.ok) {
      console.log("DELIVERED with id=0 cat/pt!");
      // Check what category it got
      const costsRes = await get(`/travelExpense/cost?travelExpenseId=${teId}&count=20&fields=*`);
      const cost = costsRes.values[0];
      console.log("Cost category:", JSON.stringify(cost.costCategory));
      console.log("Payment type:", JSON.stringify(cost.paymentType));
    } else {
      console.log("Deliver FAILED with id=0 cat/pt");
      await del(`/travelExpense/${teId}`);
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
