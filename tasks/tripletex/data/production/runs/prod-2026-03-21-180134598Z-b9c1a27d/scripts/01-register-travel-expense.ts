const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "bnMp770G5UtlQMsbuqiQ7XYXBGlw6zoPUXjaTIkrYp4";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers: H });
  const body = await r.json();
  if (!r.ok) { console.error("GET FAIL", r.status, JSON.stringify(body)); throw new Error(`GET ${r.status}`); }
  return body;
}

async function post(path: string, payload: any) {
  const url = `${BASE}${path}`;
  console.log(`POST ${url}`);
  const r = await fetch(url, { method: "POST", headers: H, body: JSON.stringify(payload) });
  const body = await r.json();
  if (!r.ok) { console.error("POST FAIL", r.status, JSON.stringify(body)); throw new Error(`POST ${r.status}`); }
  return body;
}

async function put(path: string) {
  const url = `${BASE}${path}`;
  console.log(`PUT ${url}`);
  const r = await fetch(url, { method: "PUT", headers: H });
  const body = await r.json();
  if (!r.ok) { console.error("PUT FAIL", r.status, JSON.stringify(body)); throw new Error(`PUT ${r.status}`); }
  return body;
}

async function main() {
  // 1. Get employee
  const empRes = await get("/employee?email=pablo.rodriguez@example.org&count=10&fields=*");
  const employees = empRes.values;
  if (!employees || employees.length === 0) throw new Error("Employee not found");
  const emp = employees.length === 1 ? employees[0] :
    employees.find((e: any) => e.allowInformationRegistration) || employees[0];
  console.log("Employee:", emp.id, emp.firstName, emp.lastName, "address:", JSON.stringify(emp.address), "companyId:", emp.companyId);

  // 2. Resolve departureFrom
  let departureFrom: string | null = null;
  if (emp.address && emp.address.city) departureFrom = emp.address.city;
  else if (emp.address && emp.address.addressLine1) departureFrom = emp.address.addressLine1;
  else if (emp.address && emp.address.displayName) departureFrom = emp.address.displayName;

  if (!departureFrom && emp.companyId) {
    const companyRes = await get(`/company/${emp.companyId}?fields=*,address(*)`);
    const company = companyRes.value;
    console.log("Company address:", JSON.stringify(company.address));
    if (company.address) {
      departureFrom = company.address.city || company.address.addressLine1 || company.address.displayName || company.address.addressAsString || null;
    }
  }

  if (!departureFrom) throw new Error("BLOCKED: no concrete location for departureFrom");
  console.log("departureFrom:", departureFrom);

  // Deterministic dates for 5-day trip
  const departureDate = "2026-03-17";
  const returnDate = "2026-03-21";

  // 3. Get cost categories, payment types, and rates in parallel
  const [catRes, ptRes, rateRes] = await Promise.all([
    get("/travelExpense/costCategory?count=1000&fields=*"),
    get("/travelExpense/paymentType?count=1000&fields=*"),
    get(`/travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=${departureDate}&dateTo=${returnDate}&count=1000&fields=*`),
  ]);

  // Filter cost categories
  const travelCats = catRes.values.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = travelCats.find((c: any) => c.description === "Fly");
  const taxiCat = travelCats.find((c: any) => c.description === "Taxi");
  if (!flyCat) throw new Error("No Fly category found");
  if (!taxiCat) throw new Error("No Taxi category found");
  console.log("Fly category:", flyCat.id, "Taxi category:", taxiCat.id);

  // Filter payment type
  const travelPt = ptRes.values.find((p: any) => p.showOnTravelExpenses);
  if (!travelPt) throw new Error("No travel payment type found");
  console.log("Payment type:", travelPt.id, travelPt.description);

  // Resolve per-diem rate type
  const rates = rateRes.values || [];
  console.log("Rate types found:", rates.length);
  // Prefer rate matching 800
  let rateType = rates.find((r: any) => r.rate === 800);
  if (!rateType) rateType = rates[0];
  if (!rateType) throw new Error("No per-diem rate type found");
  console.log("Using rateType:", rateType.id, "rate:", rateType.rate);

  // 4. POST travel expense
  const payload = {
    employee: { id: emp.id },
    title: "Conferencia Ålesund",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate,
      returnDate,
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom,
      destination: "Ålesund",
      detailedJourneyDescription: "Conferencia Ålesund",
      purpose: "Conferencia Ålesund",
    },
    perDiemCompensations: [
      {
        location: "Ålesund",
        count: 5,
        rate: 800,
        amount: 4000,
        rateType: { id: rateType.id },
        overnightAccommodation: "HOTEL",
      },
    ],
    costs: [
      {
        costCategory: { id: flyCat.id },
        paymentType: { id: travelPt.id },
        comments: "billete de avión",
        amountCurrencyIncVat: 2750,
        amountNOKInclVAT: 2750,
        vatType: { id: 0 },
        date: departureDate,
      },
      {
        costCategory: { id: taxiCat.id },
        paymentType: { id: travelPt.id },
        comments: "taxi",
        amountCurrencyIncVat: 700,
        amountNOKInclVAT: 700,
        vatType: { id: 0 },
        date: returnDate,
      },
    ],
  };

  console.log("POST payload:", JSON.stringify(payload, null, 2));
  const createRes = await post("/travelExpense", payload);
  const te = createRes.value;
  console.log("Created travel expense:", te.id, "state:", te.state);
  console.log("costs count:", te.costs?.length, "perDiemCompensations count:", te.perDiemCompensations?.length);

  // 5. Deliver
  const deliverRes = await put(`/travelExpense/:deliver?id=${te.id}`);
  const delivered = deliverRes.values?.[0] || deliverRes.value;
  console.log("\n=== DELIVERED ===");
  console.log("id:", delivered.id);
  console.log("title:", delivered.title);
  console.log("state:", delivered.state);
  console.log("employee.id:", delivered.employee?.id);
  console.log("travelDetails.departureDate:", delivered.travelDetails?.departureDate);
  console.log("travelDetails.returnDate:", delivered.travelDetails?.returnDate);
  console.log("travelDetails.destination:", delivered.travelDetails?.destination);
  console.log("travelDetails.departureFrom:", delivered.travelDetails?.departureFrom);
  console.log("costs count:", delivered.costs?.length);
  console.log("perDiemCompensations count:", delivered.perDiemCompensations?.length);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
