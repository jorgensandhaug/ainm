const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "LcTUXfHnNhunDI8YTlPKpjJVCVVl7DvjXuKgfi9_89M";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function main() {
  // Step 1: parallel GETs — employee, costCategory, paymentType
  const [empRes, costCatRes, payTypeRes] = await Promise.all([
    get("/employee?email=astrid.larsen@example.org&count=10&fields=*"),
    get("/travelExpense/costCategory?count=1000&fields=*"),
    get("/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = empRes.values?.[0];
  if (!emp) throw new Error("Employee not found");
  console.log("Employee:", emp.id, emp.firstName, emp.lastName);
  console.log("Employee address:", JSON.stringify(emp.address));

  // Step 2: If no address, get company
  let departureFrom: string | null = null;
  if (emp.address?.city) {
    departureFrom = emp.address.city;
  } else if (emp.address?.addressLine1) {
    departureFrom = emp.address.addressLine1;
  }

  let companyCallNeeded = false;
  if (!departureFrom && emp.companyId) {
    companyCallNeeded = true;
    const compRes = await get(`/company/${emp.companyId}?fields=*,address(*)`);
    const addr = compRes.value?.address;
    departureFrom = addr?.city || addr?.addressLine1 || addr?.displayName || addr?.addressAsString;
    console.log("Company address fallback:", departureFrom);
  }

  if (!departureFrom) throw new Error("No departureFrom available — blocked");
  console.log("departureFrom:", departureFrom);

  // Find cost categories for Fly and Taxi
  const cats = costCatRes.values?.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = cats?.find((c: any) => c.description === "Fly");
  const taxiCat = cats?.find((c: any) => c.description === "Taxi");
  if (!flyCat) throw new Error("No Fly cost category");
  if (!taxiCat) throw new Error("No Taxi cost category");
  console.log("Fly category:", flyCat.id, "Taxi category:", taxiCat.id);

  // Find payment type
  const payTypes = payTypeRes.values?.filter((p: any) => p.showOnTravelExpenses);
  const payType = payTypes?.find((p: any) => p.description === "Privat utlegg") || payTypes?.[0];
  if (!payType) throw new Error("No payment type");
  console.log("Payment type:", payType.id, payType.description);

  // Dates: 4-day trip, deterministic
  const departureDate = "2026-03-18";
  const returnDate = "2026-03-21";

  // Per-diem: 4 days = 3 overnights
  const perDiemCount = 3;
  const perDiemRate = 800;
  const perDiemAmount = perDiemCount * perDiemRate; // 2400

  // POST travel expense
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
        costCategory: { id: flyCat.id },
        paymentType: { id: payType.id },
        category: "Fly",
        comments: "Flybillett",
        amountCurrencyIncVat: 6750,
        amountNOKInclVAT: 6750,
        vatType: { id: 0 },
        date: departureDate,
      },
      {
        costCategory: { id: taxiCat.id },
        paymentType: { id: payType.id },
        category: "Taxi",
        comments: "Taxi",
        amountCurrencyIncVat: 500,
        amountNOKInclVAT: 500,
        vatType: { id: 0 },
        date: departureDate,
      },
    ],
    perDiemCompensations: [
      {
        count: perDiemCount,
        rate: perDiemRate,
        amount: perDiemAmount,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
        location: "Ålesund",
      },
    ],
  };

  console.log("POST /travelExpense payload:", JSON.stringify(payload, null, 2));

  const postRes = await fetch(`${BASE}/travelExpense`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(payload),
  });

  if (!postRes.ok) {
    const errText = await postRes.text();
    console.error("POST failed:", postRes.status, errText);
    throw new Error(`POST /travelExpense → ${postRes.status}: ${errText}`);
  }

  const created = await postRes.json();
  const expenseId = created.value?.id;
  console.log("Created expense:", expenseId, "state:", created.value?.state);

  // PUT deliver
  const deliverRes = await fetch(`${BASE}/travelExpense/:deliver?id=${expenseId}`, {
    method: "PUT",
    headers: H,
  });

  if (!deliverRes.ok) {
    const errText = await deliverRes.text();
    console.error("Deliver failed:", deliverRes.status, errText);
    throw new Error(`PUT /travelExpense/:deliver → ${deliverRes.status}: ${errText}`);
  }

  const delivered = await deliverRes.json();
  const exp = delivered.values?.[0];
  console.log("=== DELIVERED ===");
  console.log("ID:", exp?.id);
  console.log("State:", exp?.state);
  console.log("Title:", exp?.title);
  console.log("Employee ID:", exp?.employee?.id);
  console.log("Departure:", exp?.travelDetails?.departureDate);
  console.log("Return:", exp?.travelDetails?.returnDate);
  console.log("DepartureFrom:", exp?.travelDetails?.departureFrom);
  console.log("Costs count:", exp?.costs?.length);
  console.log("PerDiem count:", exp?.perDiemCompensations?.length);
  console.log("Amount:", exp?.amount);

  const totalCalls = companyCallNeeded ? 6 : 5;
  console.log(`\nTotal API calls: ${totalCalls} (3 parallel GETs${companyCallNeeded ? " + 1 company GET" : ""} + POST + deliver)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
