/**
 * Task 13: New hypotheses — fields we've never tried together.
 *
 * ALL previous tests scored 4.5/8 regardless of rate/count/vatType/dates.
 * Maybe multiple fields must be correct SIMULTANEOUSLY.
 *
 * Hypotheses:
 *   H1: rate=800 + isDeductionForBreakfast=true (Norwegian hotel standard)
 *   H2: count=5 + isDeductionForBreakfast=true
 *   H3: count=5 + rate=800 + isDeductionForBreakfast=true (ALL together)
 *   H4: Add accommodationAllowances (separate from perDiem)
 *   H5: countryCode="NO" on perDiem
 *   H6: No perDiem at all — use costs only with rate×days as a cost
 *   H7: count=5, rate=800, amount=4000, isDeductionForBreakfast=true
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
  const [empRes, catRes, ptRes, rateRes] = await Promise.all([
    api("GET", "/employee?email=lucy.walker@example.org&count=10&fields=*"),
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
    api("GET", "/travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=2026-03-17&dateTo=2026-03-21&count=1000&fields=*"),
  ]);

  const emp = empRes.data?.values?.[0];
  const flyCat = (catRes.data?.values||[]).find((c:any) => c.showOnTravelExpenses && c.description === "Fly");
  const taxiCat = (catRes.data?.values||[]).find((c:any) => c.showOnTravelExpenses && c.description === "Taxi");
  const payType = (ptRes.data?.values||[]).find((p:any) => p.showOnTravelExpenses);
  const compRes = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
  const departureFrom = compRes.data?.value?.address?.city || "Oslo";

  // Find accommodation rate categories
  const allRateCats = await api("GET", "/travelExpense/rateCategory?count=1000&fields=*");
  const accomCats = (allRateCats.data?.values||[]).filter((c:any) =>
    c.name?.toLowerCase().includes("nattillegg") ||
    c.name?.toLowerCase().includes("losji") ||
    c.name?.toLowerCase().includes("accommodation") ||
    c.type === "ACCOMMODATION_ALLOWANCE"
  );
  console.log("Accommodation rate categories:");
  for (const c of accomCats) {
    console.log(`  id=${c.id} name="${c.name}" type=${c.type} validDomestic=${c.isValidDomestic} from=${c.fromDate} to=${c.toDate}`);
  }

  // Also find rates for ACCOMMODATION_ALLOWANCE
  const accomRateRes = await api("GET", "/travelExpense/rate?type=ACCOMMODATION_ALLOWANCE&isValidDomestic=true&dateFrom=2026-03-17&dateTo=2026-03-21&count=1000&fields=*");
  console.log("\nAccommodation rates:");
  for (const r of (accomRateRes.data?.values || [])) {
    console.log(`  id=${r.id} rate=${r.rate} rateCategory=${JSON.stringify(r.rateCategory)}`);
  }

  const perDiemRates = rateRes.data?.values || [];
  console.log("\nPer-diem rates:");
  for (const r of perDiemRates) {
    console.log(`  id=${r.id} rate=${r.rate} rateCategory.id=${r.rateCategory?.id} bfast=${r.breakfastDeductionRate} lunch=${r.lunchDeductionRate} dinner=${r.dinnerDeductionRate}`);
  }

  const baseTravelDetails = {
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
  };

  const baseCosts = [
    { costCategory: { id: flyCat!.id }, paymentType: { id: payType!.id }, comments: "Flybillett", amountCurrencyIncVat: 2850, amountNOKInclVAT: 2850, vatType: { id: 0 }, date: "2026-03-17" },
    { costCategory: { id: taxiCat!.id }, paymentType: { id: payType!.id }, comments: "Taxi", amountCurrencyIncVat: 200, amountNOKInclVAT: 200, vatType: { id: 0 }, date: "2026-03-21" },
  ];

  async function runTest(label: string, payload: any) {
    console.log(`\n=== ${label} ===`);
    const createRes = await api("POST", "/travelExpense", payload);
    if (!createRes.ok) { console.log("  CREATE FAILED"); return null; }
    const te = createRes.data.value;

    const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${te.id}`);
    const [pdRes, costRes, parentRes, accomRes] = await Promise.all([
      api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${te.id}&fields=*`),
      api("GET", `/travelExpense/cost?travelExpenseId=${te.id}&fields=*`),
      api("GET", `/travelExpense/${te.id}?fields=*`),
      api("GET", `/travelExpense/accommodationAllowance?travelExpenseId=${te.id}&fields=*`),
    ]);

    const pds = pdRes.data?.values || [];
    const costs = costRes.data?.values || [];
    const parent = parentRes.data?.value;
    const accoms = accomRes.data?.values || [];

    console.log(`  state=${parent?.state}, amount=${parent?.amount}, paymentAmount=${parent?.paymentAmount}`);
    for (const pd of pds) {
      console.log(`  perDiem: count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}, bfast=${pd.isDeductionForBreakfast}, lunch=${pd.isDeductionForLunch}, dinner=${pd.isDeductionForDinner}, countryCode=${pd.countryCode}, location=${pd.location}, address=${pd.address}, overnight=${pd.overnightAccommodation}`);
    }
    for (const c of costs) {
      console.log(`  cost "${c.comments}": amount=${c.amountNOKInclVAT}, date=${c.date}, isPaid=${c.isPaidByEmployee}`);
    }
    for (const a of accoms) {
      console.log(`  accommodation: count=${a.count}, rate=${a.rate}, amount=${a.amount}, location=${a.location}`);
    }

    await api("DELETE", `/travelExpense/${te.id}`);
    return { state: parent?.state, amount: parent?.amount, paymentAmount: parent?.paymentAmount };
  }

  // H1: rate=800 + isDeductionForBreakfast=true
  await runTest("H1: rate=800, breakfast deduction", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    travelDetails: baseTravelDetails,
    perDiemCompensations: [{
      location: "Trondheim",
      count: 4,
      rate: 800,
      amount: 3200,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
      isDeductionForBreakfast: true,
    }],
    costs: baseCosts,
  });

  // H2: count=5 + breakfast deduction (no rate/amount)
  await runTest("H2: count=5, breakfast deduction, no rate", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    travelDetails: baseTravelDetails,
    perDiemCompensations: [{
      location: "Trondheim",
      count: 5,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
      isDeductionForBreakfast: true,
    }],
    costs: baseCosts,
  });

  // H3: count=5, rate=800, amount=4000, breakfast deduction
  await runTest("H3: count=5, rate=800, amount=4000, breakfast", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    travelDetails: baseTravelDetails,
    perDiemCompensations: [{
      location: "Trondheim",
      count: 5,
      rate: 800,
      amount: 4000,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
      isDeductionForBreakfast: true,
    }],
    costs: baseCosts,
  });

  // H4: Try adding accommodationAllowances
  const accomRate = (accomRateRes.data?.values || [])[0];
  if (accomRate) {
    await runTest("H4: With accommodation allowance", {
      employee: { id: emp.id },
      title: "Kundebesøk Trondheim",
      travelDetails: baseTravelDetails,
      perDiemCompensations: [{
        location: "Trondheim",
        count: 4,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      }],
      accommodationAllowances: [{
        location: "Trondheim",
        count: 4,
        rateType: { id: accomRate.id, rateCategory: { id: accomRate.rateCategory?.id } },
      }],
      costs: baseCosts,
    });
  } else {
    console.log("\n=== H4: SKIPPED (no accommodation rate found) ===");
  }

  // H5: countryCode on perDiem
  await runTest("H5: countryCode=NO on perDiem", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    travelDetails: baseTravelDetails,
    perDiemCompensations: [{
      location: "Trondheim",
      count: 4,
      countryCode: "NO",
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }],
    costs: baseCosts,
  });

  // H6: No perDiem, just costs — model "diett" as a regular cost
  const matCat = (catRes.data?.values||[]).find((c:any) => c.showOnTravelExpenses && c.description === "Mat");
  if (matCat) {
    await runTest("H6: No perDiem, diet as Mat cost", {
      employee: { id: emp.id },
      title: "Kundebesøk Trondheim",
      travelDetails: { ...baseTravelDetails, isCompensationFromRates: false },
      costs: [
        ...baseCosts,
        { costCategory: { id: matCat.id }, paymentType: { id: payType!.id }, comments: "Diett", amountCurrencyIncVat: 4000, amountNOKInclVAT: 4000, vatType: { id: 0 }, date: "2026-03-17" },
      ],
    });
  }

  // H7: count=4, rate=800, amount=3200, NO breakfast, try different rateType (day trip >12h)
  await runTest("H7: rateType 25887 (day >12h, rate=736)", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    travelDetails: baseTravelDetails,
    perDiemCompensations: [{
      location: "Trondheim",
      count: 4,
      rate: 800,
      amount: 3200,
      rateType: { id: 25887, rateCategory: { id: 739 } },
      overnightAccommodation: "HOTEL",
    }],
    costs: baseCosts,
  });

  // H8: COMPREHENSIVE — rate=800, count=5, breakfast=true, countryCode=NO
  await runTest("H8: rate=800, count=5, breakfast, countryCode=NO", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    travelDetails: baseTravelDetails,
    perDiemCompensations: [{
      location: "Trondheim",
      count: 5,
      rate: 800,
      amount: 4000,
      countryCode: "NO",
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
      isDeductionForBreakfast: true,
    }],
    costs: baseCosts,
  });

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
