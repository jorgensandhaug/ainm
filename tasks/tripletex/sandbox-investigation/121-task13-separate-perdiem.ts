/**
 * Task 13: Test creating per-diem entries SEPARATELY
 *
 * All approaches so far embed perDiemCompensations in the POST /travelExpense body.
 * What if we should:
 *   1. POST /travelExpense (without perDiemCompensations)
 *   2. POST /travelExpense/perDiemCompensation (separately)
 *   3. PUT /travelExpense/:deliver
 *
 * Also test: POST costs separately instead of embedded.
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
  const flyCat = (catRes.data?.values||[]).find((c:any) => c.showOnTravelExpenses && c.description === "Fly");
  const taxiCat = (catRes.data?.values||[]).find((c:any) => c.showOnTravelExpenses && c.description === "Taxi");
  const payType = (ptRes.data?.values||[]).find((p:any) => p.showOnTravelExpenses);
  const compRes = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
  const departureFrom = compRes.data?.value?.address?.city || "Oslo";

  // TEST 1: Separate per-diem creation
  console.log("=== TEST 1: Separate per-diem and cost creation ===");

  // Step 1: Create bare travel expense
  const createRes = await api("POST", "/travelExpense", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    travelDetails: {
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
    },
  });
  if (!createRes.ok) { console.log("CREATE FAILED"); return; }
  const teId = createRes.data.value.id;
  console.log(`  Created TE: id=${teId}`);

  // Step 2: Add per-diem separately
  const pdRes = await api("POST", "/travelExpense/perDiemCompensation", {
    travelExpense: { id: teId },
    location: "Trondheim",
    count: 4,
    rateType: { id: 25888, rateCategory: { id: 740 } },
    overnightAccommodation: "HOTEL",
  });
  console.log(`  PerDiem create: ok=${pdRes.ok}`);
  if (pdRes.ok) {
    const pd = pdRes.data.value;
    console.log(`  perDiem: id=${pd.id}, count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}`);
  }

  // Step 3: Add costs separately
  const cost1Res = await api("POST", "/travelExpense/cost", {
    travelExpense: { id: teId },
    costCategory: { id: flyCat!.id },
    paymentType: { id: payType!.id },
    comments: "Flybillett",
    amountCurrencyIncVat: 2850,
    amountNOKInclVAT: 2850,
    vatType: { id: 0 },
    date: "2026-03-17",
  });
  console.log(`  Cost1 create: ok=${cost1Res.ok}`);

  const cost2Res = await api("POST", "/travelExpense/cost", {
    travelExpense: { id: teId },
    costCategory: { id: taxiCat!.id },
    paymentType: { id: payType!.id },
    comments: "Taxi",
    amountCurrencyIncVat: 200,
    amountNOKInclVAT: 200,
    vatType: { id: 0 },
    date: "2026-03-21",
  });
  console.log(`  Cost2 create: ok=${cost2Res.ok}`);

  // Step 4: Deliver
  const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${teId}`);
  console.log(`  Deliver: ok=${deliverRes.ok}`);

  // Full readback
  const [pdReadRes, costReadRes, parentReadRes] = await Promise.all([
    api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${teId}&fields=*`),
    api("GET", `/travelExpense/cost?travelExpenseId=${teId}&fields=*`),
    api("GET", `/travelExpense/${teId}?fields=*`),
  ]);

  const parent = parentReadRes.data?.value;
  console.log(`  FINAL: state=${parent?.state}, amount=${parent?.amount}, paymentAmount=${parent?.paymentAmount}`);
  for (const pd of (pdReadRes.data?.values || [])) {
    console.log(`  perDiem: count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}, overnight=${pd.overnightAccommodation}`);
  }
  for (const c of (costReadRes.data?.values || [])) {
    console.log(`  cost "${c.comments}": inclVAT=${c.amountNOKInclVAT}`);
  }

  await api("DELETE", `/travelExpense/${teId}`);

  // TEST 2: Compare embedded vs separate
  console.log("\n=== TEST 2: Embedded per-diem (for comparison) ===");
  const embeddedRes = await api("POST", "/travelExpense", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    travelDetails: {
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
    },
    perDiemCompensations: [{
      location: "Trondheim",
      count: 4,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }],
    costs: [
      { costCategory: { id: flyCat!.id }, paymentType: { id: payType!.id }, comments: "Flybillett", amountCurrencyIncVat: 2850, amountNOKInclVAT: 2850, vatType: { id: 0 }, date: "2026-03-17" },
      { costCategory: { id: taxiCat!.id }, paymentType: { id: payType!.id }, comments: "Taxi", amountCurrencyIncVat: 200, amountNOKInclVAT: 200, vatType: { id: 0 }, date: "2026-03-21" },
    ],
  });
  if (!embeddedRes.ok) { console.log("  CREATE FAILED"); return; }
  const embTeId = embeddedRes.data.value.id;
  await api("PUT", `/travelExpense/:deliver?id=${embTeId}`);

  const [embPdRes, embCostRes, embParentRes] = await Promise.all([
    api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${embTeId}&fields=*`),
    api("GET", `/travelExpense/cost?travelExpenseId=${embTeId}&fields=*`),
    api("GET", `/travelExpense/${embTeId}?fields=*`),
  ]);

  const embParent = embParentRes.data?.value;
  console.log(`  FINAL: state=${embParent?.state}, amount=${embParent?.amount}, paymentAmount=${embParent?.paymentAmount}`);
  for (const pd of (embPdRes.data?.values || [])) {
    console.log(`  perDiem: count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}, overnight=${pd.overnightAccommodation}`);
  }
  for (const c of (embCostRes.data?.values || [])) {
    console.log(`  cost "${c.comments}": inclVAT=${c.amountNOKInclVAT}`);
  }

  // FULL field-by-field comparison
  console.log("\n=== FIELD COMPARISON ===");
  const diffs: string[] = [];
  // Re-read both
  const check = (label: string, a: any, b: any) => {
    const sa = JSON.stringify(a);
    const sb = JSON.stringify(b);
    if (sa !== sb) {
      diffs.push(`DIFF ${label}: separate=${sa} vs embedded=${sb}`);
    }
  };

  // Cleanup
  await api("DELETE", `/travelExpense/${embTeId}`);

  if (diffs.length === 0) {
    console.log("  NO DIFFERENCES");
  } else {
    for (const d of diffs) console.log(`  ${d}`);
  }

  // TEST 3: What does GET /travelExpense/perDiemCompensation show for rateCategory?
  console.log("\n=== TEST 3: POST perDiem with explicit rate=800 separately ===");
  const te3Res = await api("POST", "/travelExpense", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    travelDetails: {
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
    },
  });
  const te3Id = te3Res.data?.value?.id;
  if (te3Id) {
    // POST per-diem with explicit rate=800
    const pd3 = await api("POST", "/travelExpense/perDiemCompensation", {
      travelExpense: { id: te3Id },
      location: "Trondheim",
      count: 5,
      rate: 800,
      amount: 4000,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    });
    console.log(`  PerDiem: ok=${pd3.ok}`);
    if (pd3.ok) {
      const pdVal = pd3.data.value;
      console.log(`  Result: count=${pdVal.count}, rate=${pdVal.rate}, amount=${pdVal.amount}`);
      // Read ALL fields of the created per-diem
      const pdRead = await api("GET", `/travelExpense/perDiemCompensation/${pdVal.id}?fields=*`);
      const pdFull = pdRead.data?.value;
      if (pdFull) {
        console.log("  ALL perDiem fields:");
        for (const [k,v] of Object.entries(pdFull)) {
          console.log(`    ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
        }
      }
    }
    await api("DELETE", `/travelExpense/${te3Id}`);
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
