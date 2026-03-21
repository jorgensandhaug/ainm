// VERIFY: Task 13 fix — correct rateType for overnight multi-day trips
// Test: use isValidAccommodation=true rateType vs day-trip rateType
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 600));
  return { status: res.status, data: json };
}

async function main() {
  // ====================================================
  // PART 1: Understand ALL rate categories in detail
  // ====================================================
  console.log("=== PART 1: Rate types and categories ===\n");

  const rateRes = await api("GET", "/travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=2026-03-17&dateTo=2026-03-21&count=1000&fields=*");
  console.log("Rate types returned:", rateRes.data?.fullResultSize);

  for (const r of (rateRes.data?.values || [])) {
    // Get full rate category
    const catRes = await api("GET", `/travelExpense/rateCategory/${r.rateCategory?.id}?fields=*`);
    const cat = catRes.data?.value;
    console.log(`\n  Rate id=${r.id} rate=${r.rate}`);
    console.log(`    category id=${cat?.id} name="${cat?.name}"`);
    console.log(`    isValidDayTrip=${cat?.isValidDayTrip} isValidAccommodation=${cat?.isValidAccommodation}`);
    console.log(`    isValidDomestic=${cat?.isValidDomestic} isValidForeignTravel=${cat?.isValidForeignTravel}`);
    console.log(`    isRequiresOvernightAccommodation=${cat?.isRequiresOvernightAccommodation}`);
    console.log(`    ameldingWageCode=${cat?.ameldingWageCode} wageCodeNumber="${cat?.wageCodeNumber}"`);
  }

  // ====================================================
  // PART 2: Find employee for travel expense
  // ====================================================
  console.log("\n=== PART 2: Employee and prerequisites ===\n");

  // Find an employee
  const empRes = await api("GET", "/employee?count=5&fields=*");
  const emp = empRes.data?.values?.find((e: any) => e.allowInformationRegistration) || empRes.data?.values?.[0];
  console.log(`Employee: id=${emp?.id} name=${emp?.firstName} ${emp?.lastName} address=${JSON.stringify(emp?.address)}`);

  // Get company address for departureFrom
  let departureFrom = "Oslo";
  if (emp?.address?.city) {
    departureFrom = emp.address.city;
  } else if (emp?.companyId) {
    const compRes = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
    const addr = compRes.data?.value?.address;
    departureFrom = addr?.city || addr?.addressLine1 || "Oslo";
    console.log(`Company address: ${JSON.stringify(addr)}`);
  }
  console.log(`departureFrom: "${departureFrom}"`);

  // Get cost categories and payment types
  const [catRes, ptRes] = await Promise.all([
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const travelCats = catRes.data?.values?.filter((c: any) => c.showOnTravelExpenses) || [];
  const flyCat = travelCats.find((c: any) => c.description === "Fly");
  const taxiCat = travelCats.find((c: any) => c.description === "Taxi");
  console.log(`Fly: id=${flyCat?.id} Taxi: id=${taxiCat?.id}`);

  const travelPt = ptRes.data?.values?.find((p: any) => p.showOnTravelExpenses);
  console.log(`PaymentType: id=${travelPt?.id} desc="${travelPt?.description}"`);

  // ====================================================
  // PART 3: Create travel expense with OVERNIGHT rateType
  // ====================================================
  console.log("\n=== PART 3: Travel expense with OVERNIGHT rateType ===\n");

  // Find overnight accommodation rate
  const rates = rateRes.data?.values || [];
  // Get all rate categories to find the overnight one
  const rateCats: any[] = [];
  for (const r of rates) {
    const cRes = await api("GET", `/travelExpense/rateCategory/${r.rateCategory?.id}?fields=*`);
    rateCats.push({ rate: r, cat: cRes.data?.value });
  }

  // Overnight rate: isValidAccommodation=true AND isRequiresOvernightAccommodation=true (or similar)
  const overnightRate = rateCats.find(rc =>
    rc.cat?.isValidAccommodation === true &&
    rc.cat?.name?.includes("Overnatting")
  );

  // Day trip rate (what we were using before — WRONG for multi-day)
  const dayTripRate = rateCats.find(rc =>
    rc.cat?.isValidDayTrip === true &&
    !rc.cat?.isValidAccommodation
  );

  console.log(`Overnight rate: id=${overnightRate?.rate?.id} rate=${overnightRate?.rate?.rate} cat="${overnightRate?.cat?.name}"`);
  console.log(`Day trip rate: id=${dayTripRate?.rate?.id} rate=${dayTripRate?.rate?.rate} cat="${dayTripRate?.cat?.name}"`);

  if (!overnightRate) {
    console.log("ERROR: No overnight rate found!");
    return;
  }

  // Create with overnight rate
  const payload = {
    employee: { id: emp?.id },
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
    perDiemCompensations: [{
      location: "Ålesund",
      count: 5,
      rate: 800,
      amount: 4000,
      rateType: { id: overnightRate.rate.id },
      overnightAccommodation: "HOTEL",
    }],
    costs: [
      {
        costCategory: { id: flyCat?.id },
        paymentType: { id: travelPt?.id },
        comments: "billete de avión",
        amountCurrencyIncVat: 2750,
        amountNOKInclVAT: 2750,
        vatType: { id: 0 },
        date: "2026-03-17",
      },
      {
        costCategory: { id: taxiCat?.id },
        paymentType: { id: travelPt?.id },
        comments: "taxi",
        amountCurrencyIncVat: 700,
        amountNOKInclVAT: 700,
        vatType: { id: 0 },
        date: "2026-03-21",
      },
    ],
  };

  const createRes = await api("POST", "/travelExpense", payload);
  const teId = createRes.data?.value?.id;
  console.log(`Created: id=${teId} state=${createRes.data?.value?.state}`);

  if (createRes.status >= 400 || !teId) {
    console.log("Creation failed — stopping");
    return;
  }

  // Deliver
  const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${teId}`);
  const delivered = deliverRes.data?.values?.[0] || deliverRes.data?.value;
  console.log(`\nDelivered: state=${delivered?.state}`);
  console.log(`  title="${delivered?.title}" employee=${delivered?.employee?.id}`);
  console.log(`  departureDate=${delivered?.travelDetails?.departureDate} returnDate=${delivered?.travelDetails?.returnDate}`);
  console.log(`  departureFrom="${delivered?.travelDetails?.departureFrom}" destination="${delivered?.travelDetails?.destination}"`);
  console.log(`  costs=${delivered?.costs?.length} perDiemCompensations=${delivered?.perDiemCompensations?.length}`);

  // ====================================================
  // PART 4: Deep-compare per-diem state
  // ====================================================
  console.log("\n=== PART 4: Per-diem compensation details ===\n");

  if (delivered?.perDiemCompensations?.length > 0) {
    for (const pd of delivered.perDiemCompensations) {
      const pdRes = await api("GET", `/travelExpense/perDiemCompensation/${pd.id}?fields=*`);
      const p = pdRes.data?.value;
      console.log(`  PerDiem id=${p?.id}`);
      console.log(`    location="${p?.location}" count=${p?.count} rate=${p?.rate} amount=${p?.amount}`);
      console.log(`    rateType.id=${p?.rateType?.id} overnightAccommodation="${p?.overnightAccommodation}"`);
      console.log(`    rateCategory.id=${p?.rateCategory?.id}`);
      // Get the rate category name
      if (p?.rateCategory?.id) {
        const rcRes = await api("GET", `/travelExpense/rateCategory/${p.rateCategory.id}?fields=*`);
        console.log(`    rateCategory name="${rcRes.data?.value?.name}"`);
      }
    }
  }

  // Check costs
  if (delivered?.costs?.length > 0) {
    for (const c of delivered.costs) {
      const cRes = await api("GET", `/travelExpense/cost/${c.id}?fields=*`);
      const cost = cRes.data?.value;
      console.log(`\n  Cost id=${cost?.id}`);
      console.log(`    category=${cost?.costCategory?.id} amount=${cost?.amountCurrencyIncVat} vatType=${cost?.vatType?.id}`);
      console.log(`    comments="${cost?.comments}" date=${cost?.date}`);
      console.log(`    paymentType=${cost?.paymentType?.id}`);
    }
  }

  // ====================================================
  // PART 5: Also test with day-trip rate for comparison
  // ====================================================
  if (dayTripRate) {
    console.log("\n=== PART 5: Same trip with DAY-TRIP rateType (WRONG) for comparison ===\n");

    const payload2 = {
      ...payload,
      title: "Conferencia Ålesund (day-trip rate test)",
      perDiemCompensations: [{
        location: "Ålesund",
        count: 5,
        rate: 800,
        amount: 4000,
        rateType: { id: dayTripRate.rate.id },
        overnightAccommodation: "HOTEL",
      }],
    };

    const create2Res = await api("POST", "/travelExpense", payload2);
    const te2Id = create2Res.data?.value?.id;
    console.log(`Created with day-trip rate: id=${te2Id} state=${create2Res.data?.value?.state}`);

    if (te2Id) {
      const deliver2Res = await api("PUT", `/travelExpense/:deliver?id=${te2Id}`);
      const d2 = deliver2Res.data?.values?.[0] || deliver2Res.data?.value;
      console.log(`Delivered: state=${d2?.state}`);

      // Check per-diem
      if (d2?.perDiemCompensations?.length > 0) {
        for (const pd of d2.perDiemCompensations) {
          const pdRes = await api("GET", `/travelExpense/perDiemCompensation/${pd.id}?fields=*`);
          const p = pdRes.data?.value;
          console.log(`  PerDiem rateType=${p?.rateType?.id} rateCategory=${p?.rateCategory?.id} accommodation="${p?.overnightAccommodation}"`);
          if (p?.rateCategory?.id) {
            const rcRes = await api("GET", `/travelExpense/rateCategory/${p.rateCategory.id}?fields=*`);
            console.log(`  rateCategory name="${rcRes.data?.value?.name}" isValidAccommodation=${rcRes.data?.value?.isValidAccommodation}`);
          }
        }
      }
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
