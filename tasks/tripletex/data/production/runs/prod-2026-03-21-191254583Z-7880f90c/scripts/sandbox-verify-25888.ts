// Verify: create travel expense with hardcoded rateType 25888 (overnight)
// and inspect the per-diem compensation details to confirm correctness
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${r.status} ${method} ${path}`);
  if (!r.ok) console.log("  ERROR:", JSON.stringify(json).slice(0, 800));
  return { status: r.status, data: json };
}

async function main() {
  // 1. Get an employee
  const empRes = await api("GET", "/employee?count=5&fields=*");
  const emp = empRes.data?.values?.find((e: any) => e.allowInformationRegistration) || empRes.data?.values?.[0];
  if (!emp) { console.error("No employee found"); return; }
  console.log(`Employee: id=${emp.id}, companyId=${emp.companyId}`);

  // 2. Parallel: company + costCat + payType
  const [compRes, catRes, ptRes] = await Promise.all([
    api("GET", `/company/${emp.companyId}?fields=*,address(*)`),
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const comp = compRes.data?.value || compRes.data;
  const departureFrom = comp?.address?.city || "Oslo";
  console.log(`departureFrom: ${departureFrom}`);

  const cats = (catRes.data?.values || []).filter((c: any) => c.showOnTravelExpenses);
  const flyCat = cats.find((c: any) => c.description === "Fly");
  const taxiCat = cats.find((c: any) => c.description === "Taxi");
  console.log(`Fly: ${flyCat?.id}, Taxi: ${taxiCat?.id}`);

  const pts = (ptRes.data?.values || []).filter((p: any) => p.showOnTravelExpenses);
  const payType = pts[0];
  console.log(`PayType: ${payType?.id} (${payType?.description})`);

  // Also check: what does GET /travelExpense/rate return? Compare with 25888
  const rateRes = await api("GET", "/travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=2026-03-19&dateTo=2026-03-21&count=1000&fields=*,rateCategory(*)");
  const rates = rateRes.data?.values || [];
  console.log(`\n=== ALL RATE VALUES ===`);
  for (const r of rates) {
    console.log(`  id=${r.id}, rate=${r.rate}, rateCategory.id=${r.rateCategory?.id}, rateCategory.isValidAccommodation=${r.rateCategory?.isValidAccommodation}, rateCategory.isValidDayTrip=${r.rateCategory?.isValidDayTrip}, rateCategory.name=${r.rateCategory?.name || r.rateCategory?.description}`);
    console.log(`    full rateCategory: ${JSON.stringify(r.rateCategory)}`);
  }

  // 3. Create TWO travel expenses - one with 25886 (wrong), one with 25888 (correct)
  const basePayload = {
    employee: { id: emp.id },
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: "2026-03-19",
      returnDate: "2026-03-21",
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom,
      destination: "Stavanger",
      detailedJourneyDescription: "Test overnight rate comparison",
      purpose: "Test overnight rate comparison",
    },
    costs: [
      {
        costCategory: { id: flyCat?.id },
        paymentType: { id: payType?.id },
        comments: "flybillett",
        amountCurrencyIncVat: 3900,
        amountNOKInclVAT: 3900,
        vatType: { id: 0 },
        date: "2026-03-19",
      },
      {
        costCategory: { id: taxiCat?.id },
        paymentType: { id: payType?.id },
        comments: "taxi",
        amountCurrencyIncVat: 350,
        amountNOKInclVAT: 350,
        vatType: { id: 0 },
        date: "2026-03-21",
      },
    ],
  };

  // Test A: WRONG rate 25886 (day-trip)
  const payloadA = {
    ...basePayload,
    title: "Test WRONG rate 25886",
    perDiemCompensations: [{
      location: "Stavanger",
      count: 3,
      rate: 800,
      amount: 2400,
      rateType: { id: 25886, rateCategory: { id: 738 } },
      overnightAccommodation: "HOTEL",
    }],
  };

  // Test B: CORRECT rate 25888 (overnight)
  const payloadB = {
    ...basePayload,
    title: "Test CORRECT rate 25888",
    perDiemCompensations: [{
      location: "Stavanger",
      count: 3,
      rate: 800,
      amount: 2400,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }],
  };

  console.log("\n=== Creating expense with WRONG rate 25886 ===");
  const createA = await api("POST", "/travelExpense", payloadA);
  const teA = createA.data?.value;
  console.log(`Created: id=${teA?.id}, state=${teA?.state}`);

  console.log("\n=== Creating expense with CORRECT rate 25888 ===");
  const createB = await api("POST", "/travelExpense", payloadB);
  const teB = createB.data?.value;
  console.log(`Created: id=${teB?.id}, state=${teB?.state}`);

  // Deliver both
  console.log("\n=== Delivering expense A (25886) ===");
  const deliverA = await api("PUT", `/travelExpense/:deliver?id=${teA?.id}`);
  const delA = deliverA.data?.values?.[0];
  console.log(`Delivered: id=${delA?.id}, state=${delA?.state}`);

  console.log("\n=== Delivering expense B (25888) ===");
  const deliverB = await api("PUT", `/travelExpense/:deliver?id=${teB?.id}`);
  const delB = deliverB.data?.values?.[0];
  console.log(`Delivered: id=${delB?.id}, state=${delB?.state}`);

  // Now read per-diem details for both
  console.log("\n=== Per-diem details for expense A (WRONG 25886) ===");
  const pdA = await api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${teA?.id}&count=20&fields=*`);
  for (const pd of (pdA.data?.values || [])) {
    console.log(`  id=${pd.id}`);
    console.log(`  location=${pd.location}`);
    console.log(`  count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}`);
    console.log(`  rateType: ${JSON.stringify(pd.rateType)}`);
    console.log(`  rateCategory: ${JSON.stringify(pd.rateCategory)}`);
    console.log(`  overnightAccommodation: ${pd.overnightAccommodation}`);
    console.log(`  isDayTrip: ${pd.isDayTrip}`);
    console.log(`  full: ${JSON.stringify(pd)}`);
  }

  console.log("\n=== Per-diem details for expense B (CORRECT 25888) ===");
  const pdB = await api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${teB?.id}&count=20&fields=*`);
  for (const pd of (pdB.data?.values || [])) {
    console.log(`  id=${pd.id}`);
    console.log(`  location=${pd.location}`);
    console.log(`  count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}`);
    console.log(`  rateType: ${JSON.stringify(pd.rateType)}`);
    console.log(`  rateCategory: ${JSON.stringify(pd.rateCategory)}`);
    console.log(`  overnightAccommodation: ${pd.overnightAccommodation}`);
    console.log(`  isDayTrip: ${pd.isDayTrip}`);
    console.log(`  full: ${JSON.stringify(pd)}`);
  }

  // Also read the parent travel expense details for both
  console.log("\n=== Parent expense A (25886) ===");
  const teADetails = await api("GET", `/travelExpense/${teA?.id}?fields=*`);
  const teAData = teADetails.data?.value;
  console.log(`  title=${teAData?.title}`);
  console.log(`  state=${teAData?.state}`);
  console.log(`  amount=${teAData?.amount}`);
  console.log(`  paymentAmount=${teAData?.paymentAmount}`);

  console.log("\n=== Parent expense B (25888) ===");
  const teBDetails = await api("GET", `/travelExpense/${teB?.id}?fields=*`);
  const teBData = teBDetails.data?.value;
  console.log(`  title=${teBData?.title}`);
  console.log(`  state=${teBData?.state}`);
  console.log(`  amount=${teBData?.amount}`);
  console.log(`  paymentAmount=${teBData?.paymentAmount}`);
}

main().catch((e) => console.error(e));
