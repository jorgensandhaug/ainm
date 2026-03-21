const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "GrXStD_S5RA2z4MIZjJBObsI1oO4PJaM-sPUdpcM7Vo";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Authorization": AUTH, "Content-Type": "application/json" };

let callCount = 0;
let errorCount = 0;

async function api(method: string, path: string, body?: any) {
  callCount++;
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  if (!r.ok) {
    errorCount++;
    console.error(`ERROR ${r.status} ${method} ${path}:`, JSON.stringify(json).slice(0, 500));
  }
  return { status: r.status, data: json };
}

async function main() {
  // 1. Get employee
  const empRes = await api("GET", "/employee?email=lars.johansen@example.org&count=10&fields=*");
  const employees = empRes.data?.values || [];
  const emp = employees.find((e: any) => e.email?.toLowerCase() === "lars.johansen@example.org")
    || employees.find((e: any) => e.allowInformationRegistration)
    || employees[0];
  if (!emp) { console.error("Employee not found"); return; }
  console.log("Employee:", emp.id, emp.firstName, emp.lastName, "address:", emp.address, "companyId:", emp.companyId);

  // 2. Resolve departureFrom
  let departureFrom: string | null = null;
  if (emp.address?.city) departureFrom = emp.address.city;
  else if (emp.address?.addressLine1) departureFrom = emp.address.addressLine1;
  else if (emp.address?.displayName) departureFrom = emp.address.displayName;

  if (!departureFrom && emp.companyId) {
    const compRes = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
    const comp = compRes.data?.value || compRes.data;
    if (comp?.address?.city) departureFrom = comp.address.city;
    else if (comp?.address?.addressLine1) departureFrom = comp.address.addressLine1;
    else if (comp?.address?.displayName) departureFrom = comp.address.displayName;
    else if (comp?.address?.addressAsString) departureFrom = comp.address.addressAsString;
    console.log("Company address fallback:", departureFrom);
  }

  if (!departureFrom) { console.error("BLOCKED: no concrete departureFrom"); return; }

  // Deterministic dates for 3-day trip
  const departureDate = "2026-03-19";
  const returnDate = "2026-03-21";

  // 3. Parallel: costCategory, paymentType, rate
  const [catRes, ptRes, rateRes] = await Promise.all([
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
    api("GET", `/travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=${departureDate}&dateTo=${returnDate}&count=1000&fields=*`),
  ]);

  // Resolve categories
  const cats = (catRes.data?.values || []).filter((c: any) => c.showOnTravelExpenses);
  const flyCat = cats.find((c: any) => c.description === "Fly") || cats.find((c: any) => /fly/i.test(c.description));
  const taxiCat = cats.find((c: any) => c.description === "Taxi") || cats.find((c: any) => /taxi/i.test(c.description));
  if (!flyCat || !taxiCat) { console.error("Missing cost categories", { flyCat, taxiCat }); return; }
  console.log("Fly cat:", flyCat.id, "Taxi cat:", taxiCat.id);

  // Resolve payment type
  const pts = (ptRes.data?.values || []).filter((p: any) => p.showOnTravelExpenses);
  const payType = pts.find((p: any) => /privat/i.test(p.description)) || pts[0];
  if (!payType) { console.error("No payment type"); return; }
  console.log("Payment type:", payType.id, payType.description);

  // Resolve rate type - values ARE the rate objects, .id is the rateType id
  const rates = rateRes.data?.values || [];
  const matchingRate = rates.find((r: any) => r.rate === 800) || rates[0];
  if (!matchingRate) { console.error("No rate found"); return; }
  console.log("Rate:", matchingRate.id, "rate:", matchingRate.rate, "rateCategory:", matchingRate.rateCategory?.id);

  const rateType: any = { id: matchingRate.id, rateCategory: { id: matchingRate.rateCategory.id } };

  // 4. POST /travelExpense
  const payload = {
    employee: { id: emp.id },
    title: "Kundebesøk Stavanger",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate,
      returnDate,
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom,
      destination: "Stavanger",
      detailedJourneyDescription: "Kundebesøk Stavanger",
      purpose: "Kundebesøk Stavanger",
    },
    perDiemCompensations: [
      {
        location: "Stavanger",
        count: 3,
        rate: 800,
        amount: 2400,
        rateType,
        overnightAccommodation: "HOTEL",
      },
    ],
    costs: [
      {
        costCategory: { id: flyCat.id },
        paymentType: { id: payType.id },
        comments: "flybillett",
        amountCurrencyIncVat: 3900,
        amountNOKInclVAT: 3900,
        vatType: { id: 0 },
        date: departureDate,
      },
      {
        costCategory: { id: taxiCat.id },
        paymentType: { id: payType.id },
        comments: "taxi",
        amountCurrencyIncVat: 350,
        amountNOKInclVAT: 350,
        vatType: { id: 0 },
        date: returnDate,
      },
    ],
  };

  const createRes = await api("POST", "/travelExpense", payload);
  const created = createRes.data?.value || createRes.data;
  if (createRes.status >= 400) { console.error("POST failed"); return; }
  console.log("Created expense:", created?.id, "state:", created?.state);

  // 5. PUT /travelExpense/:deliver
  const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${created.id}`);
  const delivered = deliverRes.data?.values?.[0] || deliverRes.data?.value || deliverRes.data;
  if (deliverRes.status >= 400) { console.error("Deliver failed"); return; }

  console.log("=== DELIVERED ===");
  console.log("ID:", delivered?.id);
  console.log("Title:", delivered?.title);
  console.log("Employee:", delivered?.employee?.id);
  console.log("State:", delivered?.state);
  console.log("DepartureDate:", delivered?.travelDetails?.departureDate);
  console.log("ReturnDate:", delivered?.travelDetails?.returnDate);
  console.log("DepartureFrom:", delivered?.travelDetails?.departureFrom);
  console.log("Destination:", delivered?.travelDetails?.destination);
  console.log("Costs count:", delivered?.costs?.length);
  console.log("PerDiem count:", delivered?.perDiemCompensations?.length);
  console.log(`\nTotal calls: ${callCount}, Errors: ${errorCount}`);
}

main().catch(e => console.error(e));
