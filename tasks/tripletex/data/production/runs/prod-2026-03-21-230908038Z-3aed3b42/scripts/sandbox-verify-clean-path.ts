// Sandbox verification: prove the clean 6-call path for a 4-day trip
// with all required fields, no avoidable errors
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function main() {
  let callCount = 0;
  let errorCount = 0;

  // Step 1 (parallel): employee + costCategory + paymentType
  const [empRes, costCatRes, payTypeRes] = await Promise.all([
    get("/employee?email=astrid.larsen@example.org&count=10&fields=*"),
    get("/travelExpense/costCategory?count=1000&fields=*"),
    get("/travelExpense/paymentType?count=1000&fields=*"),
  ]);
  callCount += 3;

  // Try to find the employee. If not found, use the known sandbox employee
  let emp = empRes.values?.[0];
  if (!emp) {
    console.log("Employee astrid.larsen not found in sandbox, using known employee 18478235");
    const empRes2 = await get("/employee/18478235?fields=*");
    callCount++;
    emp = empRes2.value;
  }
  console.log("Employee:", emp.id, emp.firstName, emp.lastName);
  console.log("Employee address:", JSON.stringify(emp.address));

  // Step 2 (conditional): company address fallback
  let departureFrom: string | null = null;
  if (emp.address?.city) {
    departureFrom = emp.address.city;
  } else if (emp.address?.addressLine1) {
    departureFrom = emp.address.addressLine1;
  }

  if (!departureFrom && emp.companyId) {
    const compRes = await get(`/company/${emp.companyId}?fields=*,address(*)`);
    callCount++;
    const addr = compRes.value?.address;
    departureFrom = addr?.city || addr?.addressLine1 || addr?.displayName || addr?.addressAsString;
    console.log("Company address fallback:", departureFrom);
  }

  if (!departureFrom) throw new Error("No departureFrom — blocked");
  console.log("departureFrom:", departureFrom);

  // Resolve categories
  const cats = costCatRes.values?.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = cats?.find((c: any) => c.description === "Fly");
  const taxiCat = cats?.find((c: any) => c.description === "Taxi");
  console.log("Fly:", flyCat?.id, "Taxi:", taxiCat?.id);

  const payTypes = payTypeRes.values?.filter((p: any) => p.showOnTravelExpenses);
  const payType = payTypes?.find((p: any) => p.description === "Privat utlegg") || payTypes?.[0];
  console.log("PayType:", payType?.id, payType?.description);

  // 4-day trip, 3 overnights
  const departureDate = "2026-03-18";
  const returnDate = "2026-03-21";
  const perDiemCount = 3; // overnights = days - 1
  const perDiemRate = 800;
  const perDiemAmount = perDiemCount * perDiemRate; // 2400

  const payload = {
    employee: { id: emp.id },
    title: "Konferanse Ålesund",
    travelDetails: {
      departureDate,
      returnDate,
      departureFrom,
      destination: "Ålesund",
      purpose: "Konferanse Ålesund",
      detailedJourneyDescription: "Konferanse Ålesund",
      isDayTrip: false,
      isCompensationFromRates: true,
    },
    costs: [
      {
        costCategory: { id: flyCat!.id },
        paymentType: { id: payType!.id },
        comments: "Flybillett",
        amountCurrencyIncVat: 6750,
        amountNOKInclVAT: 6750,
        vatType: { id: 0 },
        date: departureDate,
      },
      {
        costCategory: { id: taxiCat!.id },
        paymentType: { id: payType!.id },
        comments: "Taxi",
        amountCurrencyIncVat: 500,
        amountNOKInclVAT: 500,
        vatType: { id: 0 },
        date: departureDate,
      },
    ],
    perDiemCompensations: [
      {
        location: "Ålesund",
        count: perDiemCount,
        rate: perDiemRate,
        amount: perDiemAmount,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    ],
  };

  // POST
  const postRes = await fetch(`${BASE}/travelExpense`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(payload),
  });
  callCount++;

  if (!postRes.ok) {
    errorCount++;
    const errText = await postRes.text();
    console.error("POST failed:", postRes.status, errText);
    throw new Error(`POST /travelExpense → ${postRes.status}`);
  }

  const created = await postRes.json();
  const expenseId = created.value?.id;
  console.log("Created:", expenseId, "state:", created.value?.state);

  // Deliver
  const deliverRes = await fetch(`${BASE}/travelExpense/:deliver?id=${expenseId}`, {
    method: "PUT",
    headers: H,
  });
  callCount++;

  if (!deliverRes.ok) {
    errorCount++;
    const errText = await deliverRes.text();
    console.error("Deliver failed:", deliverRes.status, errText);
    throw new Error(`PUT :deliver → ${deliverRes.status}: ${errText}`);
  }

  const delivered = await deliverRes.json();
  const exp = delivered.values?.[0];
  console.log("\n=== DELIVERED ===");
  console.log("ID:", exp?.id);
  console.log("State:", exp?.state);
  console.log("Title:", exp?.title);
  console.log("Employee:", exp?.employee?.id);
  console.log("Departure:", exp?.travelDetails?.departureDate);
  console.log("Return:", exp?.travelDetails?.returnDate);
  console.log("DepartureFrom:", exp?.travelDetails?.departureFrom);
  console.log("Destination:", exp?.travelDetails?.destination);
  console.log("Costs:", exp?.costs?.length);
  console.log("PerDiem:", exp?.perDiemCompensations?.length);
  console.log("Amount:", exp?.amount);

  // Verify per-diem details
  const pdRes = await get(`/travelExpense/perDiemCompensation?travelExpenseId=${expenseId}&count=20&fields=*`);
  callCount++;
  const pd = pdRes.values?.[0];
  console.log("\n=== PER-DIEM DETAILS ===");
  console.log("Location:", pd?.location);
  console.log("Count:", pd?.count);
  console.log("Rate:", pd?.rate);
  console.log("Amount:", pd?.amount);
  console.log("RateType ID:", pd?.rateType?.id);
  console.log("RateCategory ID:", pd?.rateCategory?.id);
  console.log("OvernightAccommodation:", pd?.overnightAccommodation);

  console.log(`\nTotal API calls: ${callCount}, errors: ${errorCount}`);
  console.log("(verification GET not counted toward optimal path)");
}

main().catch((e) => { console.error(e); process.exit(1); });
