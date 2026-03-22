const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "KNArdL6kFTKLoCZjVcR2_H4R8-60TRWYMG4rFadvSBc";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) { const t = await r.text(); throw new Error(`GET ${path} → ${r.status}: ${t}`); }
  return (await r.json() as any);
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); throw new Error(`POST ${path} → ${r.status}: ${t}`); }
  return (await r.json() as any);
}

async function put(path: string) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: H });
  if (!r.ok) { const t = await r.text(); throw new Error(`PUT ${path} → ${r.status}: ${t}`); }
  return (await r.json() as any);
}

async function main() {
  // Round 1 — 3 parallel GETs
  const [empRes, catRes, ptRes] = await Promise.all([
    get("/employee?email=ricardo.romero@example.org&count=10&fields=*"),
    get("/travelExpense/costCategory?count=1000&fields=*"),
    get("/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = empRes.values?.find((e: any) => e.email === "ricardo.romero@example.org")
    ?? empRes.values?.[0];
  if (!emp) throw new Error("Employee not found");
  console.log(`Employee: id=${emp.id}, name=${emp.firstName} ${emp.lastName}, address=${JSON.stringify(emp.address)}`);

  const categories = catRes.values.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = categories.find((c: any) => c.description === "Fly");
  const taxiCat = categories.find((c: any) => c.description === "Taxi");
  if (!flyCat || !taxiCat) throw new Error(`Missing categories: Fly=${!!flyCat}, Taxi=${!!taxiCat}`);
  console.log(`Fly: id=${flyCat.id}, vatType=${JSON.stringify(flyCat.vatType)}`);
  console.log(`Taxi: id=${taxiCat.id}, vatType=${JSON.stringify(taxiCat.vatType)}`);

  const payTypes = ptRes.values.filter((p: any) => p.showOnTravelExpenses);
  const payType = payTypes[0];
  if (!payType) throw new Error("No paymentType with showOnTravelExpenses");
  console.log(`PaymentType: id=${payType.id}, description=${payType.description}`);

  // Round 2 — conditional: get departureFrom
  let departureFrom: string;
  const empCity = emp.address?.city;
  if (empCity) {
    departureFrom = empCity;
    console.log(`Using employee city: ${departureFrom}`);
  } else {
    console.log("Employee has no address, fetching company...");
    const compRes = await get(`/company/${emp.company?.id ?? emp.companyId}?fields=*,address(*)`);
    const compCity = compRes.value?.address?.city;
    if (!compCity) throw new Error("BLOCKED: neither employee nor company has a city");
    departureFrom = compCity;
    console.log(`Using company city: ${departureFrom}`);
  }

  // Round 3 — POST travel expense
  // 5-day trip, dates: 2026-03-17 to 2026-03-21, count=4 overnights
  // Destination: Ålesund
  // DO NOT set rate or amount on perDiem
  const payload = {
    employee: { id: emp.id },
    title: "Conferencia Ålesund",
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
      detailedJourneyDescription: "Conferencia Ålesund",
      purpose: "Conferencia Ålesund",
    },
    perDiemCompensations: [
      {
        location: "Ålesund",
        count: 4,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    ],
    costs: [
      {
        costCategory: { id: flyCat.id },
        paymentType: { id: payType.id },
        comments: "Billete de avión",
        amountCurrencyIncVat: 4700,
        amountNOKInclVAT: 4700,
        vatType: { id: flyCat.vatType?.id },
        date: "2026-03-17",
      },
      {
        costCategory: { id: taxiCat.id },
        paymentType: { id: payType.id },
        comments: "Taxi",
        amountCurrencyIncVat: 550,
        amountNOKInclVAT: 550,
        vatType: { id: taxiCat.vatType?.id },
        date: "2026-03-21",
      },
    ],
  };

  console.log("Creating travel expense...");
  let created: any;
  try {
    created = await post("/travelExpense", payload);
  } catch (e: any) {
    // Recovery: VAT_NOT_REGISTERED → retry with vatType 0
    if (e.message.includes("VAT_NOT_REGISTERED")) {
      console.log("VAT_NOT_REGISTERED — retrying with vatType 0...");
      payload.costs[0].vatType = { id: 0 };
      payload.costs[1].vatType = { id: 0 };
      created = await post("/travelExpense", payload);
    } else {
      throw e;
    }
  }
  const teId = created.value.id;
  console.log(`Created travel expense: id=${teId}, state=${created.value.state}`);

  // Round 4 — deliver
  console.log("Delivering...");
  const delivered = await put(`/travelExpense/:deliver?id=${teId}`);
  const final = delivered.values?.[0] ?? delivered.value;
  console.log(`Delivered: id=${final.id}, state=${final.state}`);

  // Verify
  if (final.state !== "DELIVERED") {
    console.error(`WARNING: state is ${final.state}, expected DELIVERED`);
  }

  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
