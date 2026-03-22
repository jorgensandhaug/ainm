// Focused hypothesis testing for T13 root cause
// Hypothesis: the prompt says "dagssats 800 kr" — scorer might expect rate=800, not 1012
// Also test: no rateType with isCompensationFromRates=false
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) { console.log(`${method} ${path} → ${r.status}`); console.log(JSON.stringify(json, null, 2)); return null; }
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

async function createTE(label: string, payload: any): Promise<any> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${label}`);
  console.log("=".repeat(60));

  const te = await api("POST", "/travelExpense", payload);
  if (!te) { console.log("CREATE FAILED"); return null; }
  console.log(`Created: id=${te.id} amount=${te.amount}`);

  // Readback
  const rb = await api("GET", `/travelExpense/${te.id}?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*,costCategory(*),vatType(*)),travelDetails(*)`);
  if (rb) {
    console.log(`Readback: amount=${rb.amount} lowRateVAT=${rb.lowRateVAT}`);
    console.log(`  travelDetails: isCompensationFromRates=${rb.travelDetails?.isCompensationFromRates}`);
    if (rb.perDiemCompensations?.length) {
      for (const pd of rb.perDiemCompensations) {
        console.log(`  perDiem: count=${pd.count} rate=${pd.rate} amount=${pd.amount} location=${pd.location} rateType=${pd.rateType?.id} rateCat=${pd.rateType?.rateCategory?.name} overnightAccom=${pd.overnightAccommodation}`);
        console.log(`    deductions: breakfast=${pd.isDeductionForBreakfast} lunch=${pd.isDeductionForLunch} dinner=${pd.isDeductionForDinner}`);
      }
    } else {
      console.log("  perDiem: NONE");
    }
    for (const c of rb.costs || []) {
      console.log(`  cost: cat=${c.costCategory?.description} amount=${c.amountCurrencyIncVat} vat=${c.vatType?.id} comments=${c.comments} date=${c.date}`);
    }
  }

  // Try deliver + approve + createVouchers
  const d = await api("PUT", `/travelExpense/:deliver?id=${te.id}`);
  if (!d) { console.log("DELIVER FAILED"); return rb; }
  console.log("Delivered");

  const a = await api("PUT", `/travelExpense/:approve?id=${te.id}`);
  if (!a) { console.log("APPROVE FAILED"); return rb; }
  console.log("Approved");

  const v = await api("PUT", `/travelExpense/:createVouchers?id=${te.id}&date=${payload.travelDetails.returnDate}`);
  if (!v) { console.log("CREATE VOUCHERS FAILED"); return rb; }
  console.log("Vouchers created");

  // Final readback with voucher postings
  const final = await api("GET", `/travelExpense/${te.id}?fields=*,perDiemCompensations(*),costs(*),voucher(*)`);
  if (final) {
    console.log(`Final: isCompleted=${final.isCompleted} amount=${final.amount} voucherId=${final.voucher?.id}`);
    if (final.perDiemCompensations?.length) {
      for (const pd of final.perDiemCompensations) {
        console.log(`  perDiem: count=${pd.count} rate=${pd.rate} amount=${pd.amount}`);
      }
    }
  }

  if (final?.voucher?.id) {
    const voucher = await api("GET", `/ledger/voucher/${final.voucher.id}?fields=*,postings(*,account(*))`);
    if (voucher) {
      console.log("Voucher postings:");
      for (const p of voucher.postings) {
        console.log(`  ${p.account.number} ${p.account.name}: amount=${p.amount} amountGross=${p.amountGross}`);
      }
    }
  }

  return final;
}

async function run() {
  const employees = await api("GET", "/employee?count=5&fields=*");
  const emp = employees.find((e: any) => e.allowInformationRegistration) || employees[0];
  const [categories, payTypes] = await Promise.all([
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);
  const flyCat = categories.find((c: any) => c.description === "Fly" && c.showOnTravelExpenses);
  const taxiCat = categories.find((c: any) => c.description === "Taxi" && c.showOnTravelExpenses);
  const payType = payTypes.find((p: any) => p.showOnTravelExpenses);
  const company = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
  const departureFrom = company?.address?.city || "Oslo";

  // Show all cost categories (maybe there's a diett/kost one)
  console.log("=== ALL TRAVEL EXPENSE COST CATEGORIES ===");
  for (const c of categories.filter((c: any) => c.showOnTravelExpenses)) {
    console.log(`  id=${c.id} desc="${c.description}" account=${c.account?.id} vatType=${c.vatType?.id} isVatLocked=${c.isVatLocked}`);
  }

  const baseCosts = [
    {
      costCategory: { id: flyCat.id },
      paymentType: { id: payType.id },
      comments: "flybillett",
      amountCurrencyIncVat: 3600,
      amountNOKInclVAT: 3600,
      vatType: { id: flyCat.vatType?.id || 0 },
      date: "2026-04-10",
    },
    {
      costCategory: { id: taxiCat.id },
      paymentType: { id: payType.id },
      comments: "taxi",
      amountCurrencyIncVat: 250,
      amountNOKInclVAT: 250,
      vatType: { id: taxiCat.vatType?.id || 0 },
      date: "2026-04-13",
    },
  ];

  const baseDetails = {
    isForeignTravel: false,
    isDayTrip: false,
    departureDate: "2026-04-10",
    returnDate: "2026-04-13",
    departureTime: "08:00",
    returnTime: "18:00",
    departureFrom,
    destination: "Oslo",
    detailedJourneyDescription: "Kundebesøk Oslo",
    purpose: "Kundebesøk Oslo",
  };

  // TEST A: isCompensationFromRates=false, NO rateType, just count+rate+amount+location
  await createTE("isCompFromRates=false, NO rateType, rate=800, count=3", {
    employee: { id: emp.id },
    title: "TestA - no rateType, rate=800",
    travelDetails: { ...baseDetails, isCompensationFromRates: false },
    costs: baseCosts,
    perDiemCompensations: [{
      location: "Oslo",
      count: 3,
      rate: 800,
      amount: 2400,
      overnightAccommodation: "HOTEL",
    }],
  });

  // TEST B: isCompensationFromRates=false, NO rateType, NO overnightAccommodation
  await createTE("isCompFromRates=false, NO rateType, NO overnightAccom, rate=800, count=3", {
    employee: { id: emp.id },
    title: "TestB - minimal perDiem",
    travelDetails: { ...baseDetails, isCompensationFromRates: false },
    costs: baseCosts,
    perDiemCompensations: [{
      location: "Oslo",
      count: 3,
      rate: 800,
      amount: 2400,
    }],
  });

  // TEST C: isCompensationFromRates=false, count=4 (days not overnights), rate=800
  await createTE("isCompFromRates=false, NO rateType, count=4 (days), rate=800", {
    employee: { id: emp.id },
    title: "TestC - count=days, rate=800",
    travelDetails: { ...baseDetails, isCompensationFromRates: false },
    costs: baseCosts,
    perDiemCompensations: [{
      location: "Oslo",
      count: 4,
      rate: 800,
      amount: 3200,
      overnightAccommodation: "HOTEL",
    }],
  });

  // TEST D: NO perDiemCompensations, add diett as a 3rd cost line
  // Look for a "Diett" or "Kost" category, or use a generic one
  const diettCat = categories.find((c: any) =>
    c.showOnTravelExpenses && (
      c.description.toLowerCase().includes("diett") ||
      c.description.toLowerCase().includes("kost") ||
      c.description.toLowerCase().includes("diet") ||
      c.description.toLowerCase().includes("meal")
    )
  );
  const genericCat = categories.find((c: any) => c.showOnTravelExpenses && c.description === "Annet");
  const diettCostCat = diettCat || genericCat || flyCat; // fallback
  console.log(`\nDiett cost category: ${diettCostCat?.description} (id=${diettCostCat?.id})`);

  await createTE("NO perDiem, diett as cost line (800×4=3200)", {
    employee: { id: emp.id },
    title: "TestD - diett as cost",
    travelDetails: { ...baseDetails, isCompensationFromRates: false },
    costs: [
      ...baseCosts,
      {
        costCategory: { id: diettCostCat.id },
        paymentType: { id: payType.id },
        comments: "Diett 4 dagar x 800 kr",
        amountCurrencyIncVat: 3200,
        amountNOKInclVAT: 3200,
        vatType: { id: 0 },
        date: "2026-04-13",
      },
    ],
  });

  // TEST E: isCompensationFromRates=true but with count=4 (days) - check what rate auto-fills to
  await createTE("isCompFromRates=true, count=4 (days), rateType 25888", {
    employee: { id: emp.id },
    title: "TestE - comp from rates, count=days",
    travelDetails: { ...baseDetails, isCompensationFromRates: true },
    costs: baseCosts,
    perDiemCompensations: [{
      location: "Oslo",
      count: 4,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }],
  });

  console.log("\n\nALL HYPOTHESIS TESTS COMPLETE");
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
