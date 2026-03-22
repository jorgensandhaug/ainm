/**
 * Task 13: STRUCTURAL tests — change things we've NEVER changed.
 *
 * Every tested variation (rate, count, amount, vatType, dates, rateType) gave 4.5/8.
 * The problem must be structural.
 *
 * Tests:
 *   S1: overnightAccommodation="NONE" instead of "HOTEL"
 *   S2: Omit overnightAccommodation entirely
 *   S3: isCompensationFromRates=false with no perDiemCompensations at all
 *   S4: Set "date" on parent travel expense
 *   S5: Different rateCategory (use day trip category instead of overnight)
 *   S6: All three deductions true (breakfast, lunch, dinner)
 *   S7: Only rateType.id (no rateCategory)
 *   S8: Set costs isPaidByEmployee + currency fields
 *   S9: Set perDiem with address field
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H: Record<string,string> = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch {
    if (r.ok) return { ok: true, status: r.status, data: null };
    return { ok: false, status: r.status, data: text };
  }
  if (!r.ok) console.log(`  ERR: ${method} ${path} → ${r.status}: ${JSON.stringify(json.validationMessages || json.message || json).slice(0,400)}`);
  return { ok: r.ok, status: r.status, data: json };
}

async function main() {
  // CLEANUP
  const listRes = await api("GET", "/travelExpense?count=1000&fields=id");
  for (const te of (listRes.data?.values || [])) { await api("DELETE", `/travelExpense/${te.id}`); }

  // SETUP
  const [empRes, catRes, ptRes] = await Promise.all([
    api("GET", "/employee?email=lucy.walker@example.org&count=10&fields=*"),
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = empRes.data?.values?.[0];
  const travelCats = (catRes.data?.values||[]).filter((c:any) => c.showOnTravelExpenses);
  const flyCat = travelCats.find((c:any) => c.description === "Fly");
  const taxiCat = travelCats.find((c:any) => c.description === "Taxi");
  const payType = (ptRes.data?.values||[]).find((p:any) => p.showOnTravelExpenses);
  const compRes = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
  const departureFrom = compRes.data?.value?.address?.city || "Oslo";

  const makeCosts = () => [
    { costCategory: { id: flyCat!.id }, paymentType: { id: payType!.id }, comments: "Flybillett", amountCurrencyIncVat: 2850, amountNOKInclVAT: 2850, vatType: { id: 0 }, date: "2026-03-17" },
    { costCategory: { id: taxiCat!.id }, paymentType: { id: payType!.id }, comments: "Taxi", amountCurrencyIncVat: 200, amountNOKInclVAT: 200, vatType: { id: 0 }, date: "2026-03-21" },
  ];

  const makeTravelDetails = () => ({
    isForeignTravel: false,
    isDayTrip: false,
    isCompensationFromRates: true,
    departureDate: "2026-03-17",
    returnDate: "2026-03-21",
    departureTime: "08:00",
    returnTime: "18:00",
    departureFrom,
    destination: "Trondheim",
    detailedJourneyDescription: "Kundebesøk Trondheim",
    purpose: "Kundebesøk Trondheim",
  });

  async function runTest(label: string, payload: any) {
    console.log(`\n=== ${label} ===`);
    const createRes = await api("POST", "/travelExpense", payload);
    if (!createRes.ok) { console.log("  CREATE FAILED"); return null; }
    const te = createRes.data.value;

    const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${te.id}`);
    const [pdRes, costRes, parentRes] = await Promise.all([
      api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${te.id}&fields=*`),
      api("GET", `/travelExpense/cost?travelExpenseId=${te.id}&fields=*`),
      api("GET", `/travelExpense/${te.id}?fields=*`),
    ]);

    const pds = pdRes.data?.values || [];
    const costs = costRes.data?.values || [];
    const parent = parentRes.data?.value;

    console.log(`  state=${parent?.state}, amount=${parent?.amount}, paymentAmount=${parent?.paymentAmount}`);
    console.log(`  parent.date=${parent?.date}, parent.title=${parent?.title}`);
    console.log(`  travelDetails: departure=${parent?.travelDetails?.departureDate}, return=${parent?.travelDetails?.returnDate}`);
    console.log(`  travelDetails: from=${parent?.travelDetails?.departureFrom}, dest=${parent?.travelDetails?.destination}`);
    console.log(`  travelDetails: purpose=${parent?.travelDetails?.purpose}, desc=${parent?.travelDetails?.detailedJourneyDescription}`);
    console.log(`  travelDetails: isCompFromRates=${parent?.travelDetails?.isCompensationFromRates}, isDayTrip=${parent?.travelDetails?.isDayTrip}, isForeign=${parent?.travelDetails?.isForeignTravel}`);

    for (const pd of pds) {
      console.log(`  perDiem: count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}, bfast=${pd.isDeductionForBreakfast}, overnight=${pd.overnightAccommodation}, location=${pd.location}, rateType.id=${pd.rateType?.id}, rateCategory.id=${pd.rateCategory?.id}`);
    }
    for (const c of costs) {
      console.log(`  cost "${c.comments}": inclVAT=${c.amountNOKInclVAT}, exclVAT=${c.amountNOKExclVAT}, vatAmt=${c.vatAmount}, date=${c.date}, isPaid=${c.isPaidByEmployee}, currency=${c.currency?.code}`);
    }

    await api("DELETE", `/travelExpense/${te.id}`);
    return { amount: parent?.amount };
  }

  // S1: overnightAccommodation=NONE
  await runTest("S1: overnightAccommodation=NONE", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    travelDetails: makeTravelDetails(),
    perDiemCompensations: [{
      location: "Trondheim",
      count: 4,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "NONE",
    }],
    costs: makeCosts(),
  });

  // S2: Omit overnightAccommodation
  await runTest("S2: No overnightAccommodation", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    travelDetails: makeTravelDetails(),
    perDiemCompensations: [{
      location: "Trondheim",
      count: 4,
      rateType: { id: 25888, rateCategory: { id: 740 } },
    }],
    costs: makeCosts(),
  });

  // S3: isCompensationFromRates=false, no perDiemCompensations
  await runTest("S3: isCompFromRates=false, no perDiem", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    travelDetails: { ...makeTravelDetails(), isCompensationFromRates: false },
    costs: makeCosts(),
  });

  // S4: Set date on parent
  await runTest("S4: Set parent date", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    date: "2026-03-17",
    travelDetails: makeTravelDetails(),
    perDiemCompensations: [{
      location: "Trondheim",
      count: 4,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }],
    costs: makeCosts(),
  });

  // S5: Day-trip rateCategory (739) with HOTEL overnight
  await runTest("S5: rateCategory 739 (day>12h) with HOTEL", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    travelDetails: makeTravelDetails(),
    perDiemCompensations: [{
      location: "Trondheim",
      count: 4,
      rateType: { id: 25887, rateCategory: { id: 739 } },
      overnightAccommodation: "HOTEL",
    }],
    costs: makeCosts(),
  });

  // S6: All meal deductions true
  await runTest("S6: All meal deductions true", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    travelDetails: makeTravelDetails(),
    perDiemCompensations: [{
      location: "Trondheim",
      count: 4,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
      isDeductionForBreakfast: true,
      isDeductionForLunch: true,
      isDeductionForDinner: true,
    }],
    costs: makeCosts(),
  });

  // S7: Only rateType.id (no nested rateCategory)
  await runTest("S7: Only rateType.id (no rateCategory)", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    travelDetails: makeTravelDetails(),
    perDiemCompensations: [{
      location: "Trondheim",
      count: 4,
      rateType: { id: 25888 },
      overnightAccommodation: "HOTEL",
    }],
    costs: makeCosts(),
  });

  // S8: FULL VERSION — rate=800, count=5, breakfast=true, all cost details
  await runTest("S8: FULL (rate=800, count=5, bfast, all details)", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    date: "2026-03-17",
    travelDetails: makeTravelDetails(),
    perDiemCompensations: [{
      location: "Trondheim",
      count: 5,
      rate: 800,
      amount: 4000,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
      isDeductionForBreakfast: true,
    }],
    costs: makeCosts(),
  });

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
