// Sandbox test: Can we skip the GET /travelExpense/rate call
// by posting perDiemCompensations without rateType and still deliver?
// Also test: Can we combine costCategory+paymentType lookups somehow?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers: H });
  const body = await r.json();
  console.log(`  -> ${r.status} (${(body.values||[]).length} values)`);
  if (!r.ok) { console.error("FAIL", JSON.stringify(body).slice(0, 500)); }
  return { status: r.status, body };
}

async function post(path: string, payload: any) {
  const url = `${BASE}${path}`;
  console.log(`POST ${url}`);
  const r = await fetch(url, { method: "POST", headers: H, body: JSON.stringify(payload) });
  const body = await r.json();
  console.log(`  -> ${r.status}`);
  if (!r.ok) { console.error("FAIL", JSON.stringify(body).slice(0, 800)); }
  return { status: r.status, body };
}

async function put(path: string) {
  const url = `${BASE}${path}`;
  console.log(`PUT ${url}`);
  const r = await fetch(url, { method: "PUT", headers: H });
  const body = await r.json();
  console.log(`  -> ${r.status}`);
  if (!r.ok) { console.error("FAIL", JSON.stringify(body).slice(0, 800)); }
  return { status: r.status, body };
}

async function del(path: string) {
  const url = `${BASE}${path}`;
  console.log(`DELETE ${url}`);
  const r = await fetch(url, { method: "DELETE", headers: H });
  console.log(`  -> ${r.status}`);
  return r.status;
}

async function main() {
  // Known sandbox employee
  const empId = 18478235;
  const departureFrom = "Oslo";

  // Get lookups to know IDs
  const [catRes, ptRes] = await Promise.all([
    get("/travelExpense/costCategory?count=1000&fields=*"),
    get("/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const travelCats = catRes.body.values.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = travelCats.find((c: any) => c.description === "Fly");
  const taxiCat = travelCats.find((c: any) => c.description === "Taxi");
  const travelPt = ptRes.body.values.find((p: any) => p.showOnTravelExpenses);
  console.log("\nFly:", flyCat?.id, "Taxi:", taxiCat?.id, "PT:", travelPt?.id);

  // TEST 1: Create with perDiemCompensations WITHOUT rateType, then try deliver
  console.log("\n=== TEST 1: POST without rateType, then deliver ===");
  const payload1 = {
    employee: { id: empId },
    title: "Test skip rate",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: "2026-03-17",
      returnDate: "2026-03-21",
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom,
      destination: "Ålesund",
      detailedJourneyDescription: "Test skip rate",
      purpose: "Test skip rate",
    },
    perDiemCompensations: [
      {
        location: "Ålesund",
        count: 5,
        rate: 800,
        amount: 4000,
        overnightAccommodation: "HOTEL",
        // No rateType!
      },
    ],
    costs: [
      {
        costCategory: { id: flyCat.id },
        paymentType: { id: travelPt.id },
        comments: "flight",
        amountCurrencyIncVat: 2750,
        amountNOKInclVAT: 2750,
        vatType: { id: 0 },
        date: "2026-03-17",
      },
      {
        costCategory: { id: taxiCat.id },
        paymentType: { id: travelPt.id },
        comments: "taxi",
        amountCurrencyIncVat: 700,
        amountNOKInclVAT: 700,
        vatType: { id: 0 },
        date: "2026-03-21",
      },
    ],
  };

  const res1 = await post("/travelExpense", payload1);
  if (res1.status === 201) {
    const teId = res1.body.value.id;
    console.log("Created without rateType, id:", teId, "state:", res1.body.value.state);

    // Try to deliver
    const deliverRes = await put(`/travelExpense/:deliver?id=${teId}`);
    if (deliverRes.status === 200) {
      console.log("DELIVERED without rateType! This means rate lookup is unnecessary.");
      const d = deliverRes.body.values?.[0] || deliverRes.body.value;
      console.log("state:", d?.state);
      // Clean up
      // Can't delete delivered, so leave it
    } else {
      console.log("Deliver failed without rateType - rate lookup IS needed.");
      // Clean up the OPEN expense
      await del(`/travelExpense/${teId}`);
    }
  } else {
    console.log("POST failed without rateType");
  }

  // TEST 2: Check if we can skip costCategory + paymentType lookups
  // by using ID=0 or some default
  console.log("\n=== TEST 2: POST with costCategory id=0 (default) ===");
  const payload2 = {
    employee: { id: empId },
    title: "Test default category",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: false,
      departureDate: "2026-03-17",
      returnDate: "2026-03-17",
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom,
      destination: "Ålesund",
      detailedJourneyDescription: "Test",
      purpose: "Test",
    },
    costs: [
      {
        costCategory: { id: 0 },
        paymentType: { id: 0 },
        comments: "flight",
        amountCurrencyIncVat: 100,
        amountNOKInclVAT: 100,
        vatType: { id: 0 },
        date: "2026-03-17",
      },
    ],
  };
  const res2 = await post("/travelExpense", payload2);
  if (res2.status === 201) {
    console.log("Created with id=0 category/pt! Might not need lookups.");
    await del(`/travelExpense/${res2.body.value.id}`);
  } else {
    console.log("Failed with id=0 - lookups ARE needed.");
  }
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
