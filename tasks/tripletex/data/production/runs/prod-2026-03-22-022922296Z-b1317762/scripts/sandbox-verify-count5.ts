// Full E2E verification: count=5 + rate=800 (the new hypothesis)
// Verify that this produces a clean deliverable travel expense
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) { const t = await r.text(); console.log(`GET ${path} → ${r.status}: ${t.slice(0,400)}`); return null; }
  return await r.json() as any;
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); console.log(`POST ${path} → ${r.status}: ${t.slice(0,500)}`); return null; }
  return await r.json() as any;
}

async function put(path: string) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: H });
  if (!r.ok) { const t = await r.text(); console.log(`PUT ${path} → ${r.status}: ${t.slice(0,500)}`); return null; }
  return await r.json() as any;
}

async function del(path: string) {
  await fetch(`${BASE}${path}`, { method: "DELETE", headers: H });
}

async function main() {
  const [empRes, catRes, ptRes] = await Promise.all([
    get("/employee?count=5&fields=*"),
    get("/travelExpense/costCategory?count=1000&fields=*"),
    get("/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = empRes?.values?.find((e: any) => e.allowInformationRegistration);
  const flyCat = catRes?.values?.find((c: any) => c.description === "Fly" && c.showOnTravelExpenses);
  const taxiCat = catRes?.values?.find((c: any) => c.description === "Taxi" && c.showOnTravelExpenses);
  const payType = ptRes?.values?.find((p: any) => p.showOnTravelExpenses);

  console.log("=== Full E2E: count=5 + rate=800 ===\n");

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
      departureFrom: "Oslo",
      destination: "Ålesund",
      detailedJourneyDescription: "Conferencia Ålesund",
      purpose: "Conferencia Ålesund",
    },
    perDiemCompensations: [{
      location: "Ålesund",
      count: 5,  // days from prompt, NOT overnights
      rate: 800, // rate from prompt, NOT system rate
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }],
    costs: [
      {
        costCategory: { id: flyCat.id },
        paymentType: { id: payType.id },
        comments: "Billete de avión",
        amountCurrencyIncVat: 4700,
        amountNOKInclVAT: 4700,
        vatType: { id: 0 },
        date: "2026-03-17",
      },
      {
        costCategory: { id: taxiCat.id },
        paymentType: { id: payType.id },
        comments: "Taxi",
        amountCurrencyIncVat: 550,
        amountNOKInclVAT: 550,
        vatType: { id: 0 },
        date: "2026-03-21",
      },
    ],
  };

  const created = await post("/travelExpense", payload);
  if (!created) { console.log("POST FAILED"); return; }
  const id = created.value.id;
  console.log(`Created: id=${id}, state=${created.value.state}`);

  const delivered = await put(`/travelExpense/:deliver?id=${id}`);
  if (!delivered) { console.log("DELIVER FAILED"); await del(`/travelExpense/${id}`); return; }
  const final = delivered.values?.[0];
  console.log(`Delivered: state=${final?.state}`);

  // Full readback
  const rb = await get(`/travelExpense/${id}?fields=*,perDiemCompensations(*),costs(*),travelDetails(*)`);
  if (rb) {
    const te = rb.value;
    console.log("\n--- Travel Expense State ---");
    console.log(`title: "${te.title}"`);
    console.log(`state: ${te.state}`);
    console.log(`departureDate: ${te.travelDetails?.departureDate}`);
    console.log(`returnDate: ${te.travelDetails?.returnDate}`);
    console.log(`departureFrom: "${te.travelDetails?.departureFrom}"`);
    console.log(`destination: "${te.travelDetails?.destination}"`);
    console.log(`isForeignTravel: ${te.travelDetails?.isForeignTravel}`);
    console.log(`isDayTrip: ${te.travelDetails?.isDayTrip}`);
    console.log(`isCompensationFromRates: ${te.travelDetails?.isCompensationFromRates}`);

    console.log("\n--- Per Diem ---");
    for (const pd of te.perDiemCompensations ?? []) {
      console.log(`  count: ${pd.count}`);
      console.log(`  rate: ${pd.rate}`);
      console.log(`  amount: ${pd.amount}`);
      console.log(`  rateType: ${pd.rateType?.id}`);
      console.log(`  rateCategory: ${pd.rateCategory?.id}`);
      console.log(`  overnightAccommodation: ${pd.overnightAccommodation}`);
      console.log(`  location: "${pd.location}"`);
    }

    console.log("\n--- Costs ---");
    for (const c of te.costs ?? []) {
      console.log(`  comments: "${c.comments}"`);
      console.log(`  amountCurrencyIncVat: ${c.amountCurrencyIncVat}`);
      console.log(`  amountNOKInclVAT: ${c.amountNOKInclVAT}`);
      console.log(`  vatType: ${c.vatType?.id}`);
      console.log(`  costCategory: ${c.costCategory?.id} (${c.costCategory?.description ?? '?'})`);
      console.log(`  paymentType: ${c.paymentType?.id}`);
      console.log("  ---");
    }

    // Summary
    console.log("\n--- Summary ---");
    const perDiemTotal = (te.perDiemCompensations ?? []).reduce((s: number, p: any) => s + (p.amount ?? 0), 0);
    const costTotal = (te.costs ?? []).reduce((s: number, c: any) => s + (c.amountCurrencyIncVat ?? 0), 0);
    console.log(`Per diem total: ${perDiemTotal} (count=${te.perDiemCompensations?.[0]?.count} × rate=${te.perDiemCompensations?.[0]?.rate})`);
    console.log(`Costs total: ${costTotal}`);
    console.log(`Grand total: ${perDiemTotal + costTotal}`);
  }

  await del(`/travelExpense/${id}`);
  console.log("\nCleaned up.");
}

main().catch(e => { console.error(e); process.exit(1); });
