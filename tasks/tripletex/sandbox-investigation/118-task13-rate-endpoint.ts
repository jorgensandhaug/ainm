/**
 * Task 13: Investigate /travelExpense/rate endpoint
 * Check what per-diem rates exist and their IDs.
 * Then test if rate=800 with correct rateType produces different results.
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
  try { json = JSON.parse(text); } catch { return { ok: r.ok, status: r.status, data: text }; }
  if (!r.ok) console.log(`  ERR: ${method} ${path} → ${r.status}: ${JSON.stringify(json.validationMessages || json.message || json).slice(0,400)}`);
  return { ok: r.ok, status: r.status, data: json };
}

async function main() {
  // 1. Check ALL rate types
  console.log("=== GET /travelExpense/rate (PER_DIEM, domestic) ===");
  const rateRes = await api("GET", "/travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=2026-03-17&dateTo=2026-03-21&count=1000&fields=*");
  for (const r of (rateRes.data?.values || [])) {
    console.log(`  id=${r.id} rate=${r.rate} type=${r.type} rateType=${JSON.stringify(r.rateType)} rateTypeId=${r.rateTypeId}`);
    for (const [k,v] of Object.entries(r)) {
      if (!['id','rate','type','rateType','rateTypeId'].includes(k)) {
        console.log(`    ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      }
    }
    console.log();
  }

  // 2. Check ALL rate types (not just PER_DIEM)
  console.log("=== GET /travelExpense/rate (ALL types) ===");
  const allRateRes = await api("GET", "/travelExpense/rate?count=1000&fields=*");
  for (const r of (allRateRes.data?.values || [])) {
    console.log(`  id=${r.id} rate=${r.rate} type=${r.type} rateTypeId=${r.rateTypeId} rateType.id=${r.rateType?.id}`);
  }

  // 3. Check rate categories
  console.log("\n=== GET /travelExpense/rateCategory ===");
  const rateCatRes = await api("GET", "/travelExpense/rateCategory?count=1000&fields=*");
  for (const r of (rateCatRes.data?.values || [])) {
    console.log(`  id=${r.id} name="${r.name}" type=${r.type} ameldingWageCode=${r.ameldingWageCode}`);
    for (const [k,v] of Object.entries(r)) {
      if (!['id','name','type','ameldingWageCode'].includes(k)) {
        console.log(`    ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      }
    }
    console.log();
  }

  // 4. Now test: create travel expense WITH a looked-up rateType (not hardcoded)
  console.log("\n=== CLEANUP ===");
  const listRes = await api("GET", "/travelExpense?count=1000&fields=id");
  for (const te of (listRes.data?.values || [])) {
    await api("DELETE", `/travelExpense/${te.id}`);
  }

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

  // Get per-diem rates for the date range
  const perDiemRates = rateRes.data?.values || [];
  const matchingRate = perDiemRates.find((r:any) => r.rate === 800);
  const defaultRate = perDiemRates[0];
  
  console.log(`\nRate matching 800: ${matchingRate ? `id=${matchingRate.id} rateType.id=${matchingRate.rateType?.id}` : 'NONE FOUND'}`);
  console.log(`Default rate: id=${defaultRate?.id} rate=${defaultRate?.rate} rateType.id=${defaultRate?.rateType?.id}`);

  // Test A: Use rateType from rate lookup (NO explicit rate/amount)
  console.log("\n=== TEST A: rateType from lookup, no rate/amount ===");
  const payloadA = {
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
      rateType: { id: defaultRate?.rateType?.id },
      overnightAccommodation: "HOTEL",
    }],
    costs: [
      { costCategory: { id: flyCat!.id }, paymentType: { id: payType!.id }, comments: "Flybillett", amountCurrencyIncVat: 2850, amountNOKInclVAT: 2850, vatType: { id: 0 }, date: "2026-03-17" },
      { costCategory: { id: taxiCat!.id }, paymentType: { id: payType!.id }, comments: "Taxi", amountCurrencyIncVat: 200, amountNOKInclVAT: 200, vatType: { id: 0 }, date: "2026-03-21" },
    ],
  };
  const createA = await api("POST", "/travelExpense", payloadA);
  if (createA.ok) {
    const teA = createA.data.value;
    const deliverA = await api("PUT", `/travelExpense/:deliver?id=${teA.id}`);
    const [pdA, costA, parentA] = await Promise.all([
      api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${teA.id}&fields=*`),
      api("GET", `/travelExpense/cost?travelExpenseId=${teA.id}&fields=*`),
      api("GET", `/travelExpense/${teA.id}?fields=*`),
    ]);
    const pd = pdA.data?.values?.[0];
    console.log(`  perDiem: count=${pd?.count}, rate=${pd?.rate}, amount=${pd?.amount}, rateType.id=${pd?.rateType?.id}`);
    console.log(`  parent: amount=${parentA.data?.value?.amount}, paymentAmount=${parentA.data?.value?.paymentAmount}`);
    for (const c of (costA.data?.values||[])) {
      console.log(`  cost "${c.comments}": amount=${c.amountNOKInclVAT}, isPaidByEmployee=${c.isPaidByEmployee}`);
    }
    await api("DELETE", `/travelExpense/${teA.id}`);
  }

  // Test B: Use rateType from lookup WITH rate=800
  if (matchingRate) {
    console.log("\n=== TEST B: rateType from 800-match, rate=800, amount=3200 ===");
    const payloadB = {
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
        rate: 800,
        amount: 3200,
        rateType: { id: matchingRate.rateType?.id },
        overnightAccommodation: "HOTEL",
      }],
      costs: [
        { costCategory: { id: flyCat!.id }, paymentType: { id: payType!.id }, comments: "Flybillett", amountCurrencyIncVat: 2850, amountNOKInclVAT: 2850, vatType: { id: 0 }, date: "2026-03-17" },
        { costCategory: { id: taxiCat!.id }, paymentType: { id: payType!.id }, comments: "Taxi", amountCurrencyIncVat: 200, amountNOKInclVAT: 200, vatType: { id: 0 }, date: "2026-03-21" },
      ],
    };
    const createB = await api("POST", "/travelExpense", payloadB);
    if (createB.ok) {
      const teB = createB.data.value;
      const deliverB = await api("PUT", `/travelExpense/:deliver?id=${teB.id}`);
      const [pdB, costB, parentB] = await Promise.all([
        api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${teB.id}&fields=*`),
        api("GET", `/travelExpense/cost?travelExpenseId=${teB.id}&fields=*`),
        api("GET", `/travelExpense/${teB.id}?fields=*`),
      ]);
      const pd = pdB.data?.values?.[0];
      console.log(`  perDiem: count=${pd?.count}, rate=${pd?.rate}, amount=${pd?.amount}, rateType.id=${pd?.rateType?.id}`);
      console.log(`  parent: amount=${parentB.data?.value?.amount}, paymentAmount=${parentB.data?.value?.paymentAmount}`);
      await api("DELETE", `/travelExpense/${teB.id}`);
    }
  }

  // Test C: rateType from lookup, count=5 (days not overnights)
  console.log("\n=== TEST C: rateType from lookup, count=5 (days), no rate/amount ===");
  const payloadC = {
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
      count: 5,
      rateType: { id: defaultRate?.rateType?.id },
      overnightAccommodation: "HOTEL",
    }],
    costs: [
      { costCategory: { id: flyCat!.id }, paymentType: { id: payType!.id }, comments: "Flybillett", amountCurrencyIncVat: 2850, amountNOKInclVAT: 2850, vatType: { id: 0 }, date: "2026-03-17" },
      { costCategory: { id: taxiCat!.id }, paymentType: { id: payType!.id }, comments: "Taxi", amountCurrencyIncVat: 200, amountNOKInclVAT: 200, vatType: { id: 0 }, date: "2026-03-21" },
    ],
  };
  const createC = await api("POST", "/travelExpense", payloadC);
  if (createC.ok) {
    const teC = createC.data.value;
    await api("PUT", `/travelExpense/:deliver?id=${teC.id}`);
    const [pdC, parentC] = await Promise.all([
      api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${teC.id}&fields=*`),
      api("GET", `/travelExpense/${teC.id}?fields=*`),
    ]);
    const pd = pdC.data?.values?.[0];
    console.log(`  perDiem: count=${pd?.count}, rate=${pd?.rate}, amount=${pd?.amount}`);
    console.log(`  parent: amount=${parentC.data?.value?.amount}, paymentAmount=${parentC.data?.value?.paymentAmount}`);
    await api("DELETE", `/travelExpense/${teC.id}`);
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
