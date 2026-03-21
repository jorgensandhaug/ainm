// Follow-up: Test 1 succeeded without costCategory. Can it deliver?
// Also: what costCategory did it default to?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log("Error:", JSON.stringify(json, null, 2).substring(0, 500));
  return { status: r.status, ok: r.ok, data: json };
}

async function main() {
  // First, get the most recently created travel expenses to find Test 1's ID
  const listRes = await api("GET", "/travelExpense?employeeId=18478235&count=5&sorting=-id&fields=*");
  const expenses = listRes.data.values;

  // Find the "Test no costCategory" expense
  const testExpense = expenses.find((e: any) => e.title === "Test no costCategory");
  if (!testExpense) {
    console.log("Test no costCategory expense not found. Creating a new one...");
    // Recreate it
    const ptRes = await api("GET", "/travelExpense/paymentType?count=1000&fields=*");
    const payType = ptRes.data.values.filter((p: any) => p.showOnTravelExpenses)[0];

    const createRes = await api("POST", "/travelExpense", {
      employee: { id: 18478235 },
      title: "Test no costCategory v2",
      travelDetails: {
        isForeignTravel: false, isDayTrip: false, isCompensationFromRates: true,
        departureDate: "2026-03-17", returnDate: "2026-03-21",
        departureTime: "08:00", returnTime: "18:00",
        departureFrom: "Oslo", destination: "Tromsø",
        purpose: "Test", detailedJourneyDescription: "Test"
      },
      costs: [{
        comments: "flight", amountCurrencyIncVat: 2600, amountNOKInclVAT: 2600,
        vatType: { id: 0 }, date: "2026-03-17",
        paymentType: { id: payType.id }
        // NO costCategory
      }],
      perDiemCompensations: [{
        location: "Tromsø", count: 5, rate: 800, amount: 4000,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL"
      }]
    });

    if (!createRes.ok) {
      console.log("Failed to create test expense");
      return;
    }

    const teId = createRes.data.value.id;
    console.log(`Created expense ${teId}, state=${createRes.data.value.state}`);

    // Check what costCategory it defaulted to
    const costsRes = await api("GET", `/travelExpense/cost?travelExpenseId=${teId}&count=20&fields=*`);
    console.log("Cost details:", JSON.stringify(costsRes.data.values?.map((c: any) => ({
      id: c.id,
      costCategory: c.costCategory,
      paymentType: c.paymentType,
      comments: c.comments,
      amount: c.amountCurrencyIncVat
    })), null, 2));

    // Try to deliver
    console.log("\n=== Attempting deliver ===");
    const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${teId}`);
    if (deliverRes.ok) {
      const delivered = deliverRes.data.values?.[0];
      console.log(`DELIVERED! id=${delivered.id}, state=${delivered.state}`);
      console.log("This means we can skip costCategory lookup! Saves 1 call!");

      // Check costs after delivery to see costCategory
      const costsAfter = await api("GET", `/travelExpense/cost?travelExpenseId=${teId}&count=20&fields=*`);
      console.log("Cost after delivery:", JSON.stringify(costsAfter.data.values?.map((c: any) => ({
        id: c.id,
        costCategory: c.costCategory,
        comments: c.comments
      })), null, 2));
    } else {
      console.log("Deliver FAILED without costCategory — still need the lookup");
    }
    return;
  }

  console.log(`Found expense: id=${testExpense.id}, state=${testExpense.state}`);

  if (testExpense.state === "OPEN") {
    // Try to deliver
    console.log("\n=== Attempting deliver ===");
    const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${testExpense.id}`);
    if (deliverRes.ok) {
      console.log("DELIVERED without costCategory! Saves 1 call!");
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
