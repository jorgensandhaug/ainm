const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ATw0o5lYAZVlRDPwIj-W9j75zQKOQtLJkUIdwcUEKmw";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) { console.error("GET", path, r.status, await r.text()); process.exit(1); }
  return r.json();
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) { console.error("POST", path, r.status, await r.text()); process.exit(1); }
  return r.json();
}
async function put(path: string, body?: any) {
  const opts: any = { method: "PUT", headers: H };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  if (!r.ok) { console.error("PUT", path, r.status, await r.text()); process.exit(1); }
  return r.json();
}

async function main() {
  // Round 1 — parallel: employee, cost categories, payment types
  const [empRes, catRes, ptRes] = await Promise.all([
    get("/employee?email=bruno.silva@example.org&count=10&fields=*"),
    get("/travelExpense/costCategory?count=1000&fields=*"),
    get("/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = empRes.values[0];
  if (!emp) { console.error("Employee not found"); process.exit(1); }
  console.log("Employee:", emp.id, emp.firstName, emp.lastName);

  // Find Fly and Taxi categories
  const cats = catRes.values.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = cats.find((c: any) => c.description === "Fly");
  const taxiCat = cats.find((c: any) => c.description === "Taxi");
  if (!flyCat || !taxiCat) { console.error("Categories not found", flyCat, taxiCat); process.exit(1); }
  console.log("Fly cat:", flyCat.id, "vatType:", flyCat.vatType?.id);
  console.log("Taxi cat:", taxiCat.id, "vatType:", taxiCat.vatType?.id);

  // Find payment type with showOnTravelExpenses
  const payTypes = ptRes.values.filter((p: any) => p.showOnTravelExpenses);
  const payType = payTypes[0];
  if (!payType) { console.error("No payment type found"); process.exit(1); }
  console.log("PayType:", payType.id, payType.description);

  // Round 2 — conditional: get company address if employee has no address
  let departureFrom: string;
  if (emp.address && emp.address.city) {
    departureFrom = emp.address.city;
  } else {
    const compRes = await get(`/company/${emp.companyId}?fields=*,address(*)`);
    departureFrom = compRes.value?.address?.city || "";
    if (!departureFrom) { console.error("No departure city found"); process.exit(1); }
    console.log("Company city:", departureFrom);
  }

  // Dates: 3-day trip, no specific dates given → use recent past
  const departureDate = "2026-03-19";
  const returnDate = "2026-03-21";

  // Round 3 — create travel expense
  const payload = {
    employee: { id: emp.id },
    title: "Conferência Bodø",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate,
      returnDate,
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom,
      destination: "Bodø",
      detailedJourneyDescription: "Conferência Bodø",
      purpose: "Conferência Bodø",
    },
    perDiemCompensations: [
      {
        location: "Bodø",
        count: 3,
        rate: 800,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    ],
    costs: [
      {
        costCategory: { id: flyCat.id },
        paymentType: { id: payType.id },
        comments: "Bilhete de avião",
        amountCurrencyIncVat: 4900,
        amountNOKInclVAT: 4900,
        vatType: { id: flyCat.vatType?.id ?? 0 },
        date: departureDate,
      },
      {
        costCategory: { id: taxiCat.id },
        paymentType: { id: payType.id },
        comments: "Táxi",
        amountCurrencyIncVat: 450,
        amountNOKInclVAT: 450,
        vatType: { id: taxiCat.vatType?.id ?? 0 },
        date: returnDate,
      },
    ],
  };

  const created = await post("/travelExpense", payload);
  const teId = created.value.id;
  console.log("Created travel expense:", teId);

  // Round 4 — deliver
  const delivered = await put(`/travelExpense/:deliver?id=${teId}`);
  console.log("Delivered:", delivered.values?.[0]?.state);

  // Round 5 — approve
  const approved = await put(`/travelExpense/:approve?id=${teId}`);
  console.log("Approved:", approved.values?.[0]?.state, "isApproved:", approved.values?.[0]?.isApproved);

  // Round 6 — createVouchers (CRITICAL)
  const vouchered = await put(`/travelExpense/:createVouchers?id=${teId}&date=${returnDate}`);
  console.log("Vouchers created:", vouchered.values?.[0]?.isCompleted, "voucher:", vouchered.values?.[0]?.voucher?.id);

  console.log("DONE — 6-7 calls, 0 errors expected");
}

main().catch(e => { console.error(e); process.exit(1); });
