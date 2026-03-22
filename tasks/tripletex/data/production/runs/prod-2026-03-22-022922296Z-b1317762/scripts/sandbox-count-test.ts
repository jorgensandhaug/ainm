// Test count=5 (days) vs count=4 (overnights) and rate variations
// Goal: find the combination that produces the scorer-expected state
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const t = await r.text();
  if (!r.ok) { console.log(`GET ${path} → ${r.status}: ${t.slice(0,400)}`); return null; }
  return JSON.parse(t);
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) { console.log(`POST ${path} → ${r.status}: ${t.slice(0,500)}`); return null; }
  return JSON.parse(t);
}

async function put(path: string) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: H });
  const t = await r.text();
  if (!r.ok) { console.log(`PUT ${path} → ${r.status}: ${t.slice(0,500)}`); return null; }
  return JSON.parse(t);
}

async function del(path: string) {
  await fetch(`${BASE}${path}`, { method: "DELETE", headers: H });
}

async function main() {
  // Get base data
  const [empRes, catRes, ptRes] = await Promise.all([
    get("/employee?count=5&fields=*"),
    get("/travelExpense/costCategory?count=1000&fields=*"),
    get("/travelExpense/paymentType?count=1000&fields=*"),
  ]);
  const emp = empRes?.values?.find((e: any) => e.allowInformationRegistration);
  const flyCat = catRes?.values?.find((c: any) => c.description === "Fly" && c.showOnTravelExpenses);
  const taxiCat = catRes?.values?.find((c: any) => c.description === "Taxi" && c.showOnTravelExpenses);
  const payType = ptRes?.values?.find((p: any) => p.showOnTravelExpenses);

  const makePayload = (label: string, overrides: any = {}) => ({
    employee: { id: emp.id },
    title: label,
    travelDetails: {
      isForeignTravel: false, isDayTrip: false, isCompensationFromRates: true,
      departureDate: "2026-03-17", returnDate: "2026-03-21",
      departureTime: "08:00", returnTime: "18:00",
      departureFrom: "Oslo", destination: "Ålesund",
      detailedJourneyDescription: label, purpose: label,
    },
    perDiemCompensations: [{
      location: "Ålesund",
      count: overrides.count ?? 4,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: overrides.accommodation ?? "HOTEL",
      ...(overrides.rate !== undefined ? { rate: overrides.rate } : {}),
      ...(overrides.amount !== undefined ? { amount: overrides.amount } : {}),
    }],
    costs: [
      {
        costCategory: { id: flyCat.id },
        paymentType: { id: payType.id },
        comments: "flight",
        amountCurrencyIncVat: 4700, amountNOKInclVAT: 4700,
        vatType: { id: 0 },
        date: "2026-03-17",
      },
      {
        costCategory: { id: taxiCat.id },
        paymentType: { id: payType.id },
        comments: "taxi",
        amountCurrencyIncVat: 550, amountNOKInclVAT: 550,
        vatType: { id: 0 },
        date: "2026-03-21",
      },
    ],
  });

  const tests = [
    { label: "A: count=4 no rate (current standard)", overrides: { count: 4 } },
    { label: "B: count=5 no rate (days hypothesis)", overrides: { count: 5 } },
    { label: "C: count=5 rate=800 amount=4000", overrides: { count: 5, rate: 800, amount: 4000 } },
    { label: "D: count=4 rate=800 amount=3200", overrides: { count: 4, rate: 800, amount: 3200 } },
    { label: "E: count=5 rate=800 (no amount)", overrides: { count: 5, rate: 800 } },
  ];

  for (const test of tests) {
    console.log(`\n=== ${test.label} ===`);
    const payload = makePayload(test.label, test.overrides);
    const created = await post("/travelExpense", payload);
    if (!created) { console.log("  POST FAILED"); continue; }
    const id = created.value.id;
    console.log(`  Created: id=${id}`);

    // Deliver
    const delivered = await put(`/travelExpense/:deliver?id=${id}`);
    if (!delivered) {
      console.log("  DELIVER FAILED");
      await del(`/travelExpense/${id}`);
      continue;
    }
    console.log("  State:", delivered.values?.[0]?.state);

    // Readback with full fields
    const rb = await get(`/travelExpense/${id}?fields=*,perDiemCompensations(*),costs(*)`);
    if (rb) {
      const te = rb.value;
      console.log("  Title:", te.title);
      for (const pd of te.perDiemCompensations ?? []) {
        console.log(`  PerDiem: count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}, rateType=${pd.rateType?.id}, accommodation=${pd.overnightAccommodation}`);
      }
      for (const c of te.costs ?? []) {
        console.log(`  Cost: comments="${c.comments}", amount=${c.amountCurrencyIncVat}, vatType=${c.vatType?.id}, costCat=${c.costCategory?.id}`);
      }
    }

    await del(`/travelExpense/${id}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
