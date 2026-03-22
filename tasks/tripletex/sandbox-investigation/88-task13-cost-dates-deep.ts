/**
 * Task 13: deep investigation of cost dates and other unexplored fields
 *
 * ALL hypothesized fixes have been DISPROVEN in production:
 * - vatType (0 vs 12): same score
 * - count (days vs overnights): same score
 * - rateType (25886 vs 25888): same score
 * - isForeignTravel (true vs false): same score
 *
 * New hypotheses to test:
 * 1. Cost dates: flight on departureDate, taxi on returnDate
 * 2. isPaidByEmployee on costs
 * 3. Per-diem stored fields: what does the scorer actually read back?
 * 4. Look at ledger/vatType details to understand what the scorer sees
 * 5. Check if there are extra per-diem fields we're missing
 * 6. See what happens when we DON'T set rate/amount on per-diem (let system fill)
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H: Record<string, string> = {
  "Content-Type": "application/json",
  Authorization: AUTH,
};

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { return null; }
  if (!r.ok) {
    console.log(`${method} ${path} → ${r.status}: ${JSON.stringify(json.validationMessages || json.message || json).slice(0, 300)}`);
    return null;
  }
  console.log(`${method} ${path} → ${r.status}`);
  return json;
}

async function main() {
  // Setup
  const empRes = await api("GET", "/employee?count=1&fields=*");
  const emp = empRes?.values[0];
  const [costCatRes, payTypeRes, companyRes] = await Promise.all([
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
    api("GET", `/company/${emp.companyId}?fields=*,address(*)`),
  ]);

  const travelCats = costCatRes?.values.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = travelCats?.find((c: any) => c.description === "Fly");
  const taxiCat = travelCats?.find((c: any) => c.description === "Taxi");
  const payType = payTypeRes?.values.find((p: any) => p.showOnTravelExpenses);
  const departureFrom = emp.address?.city || companyRes?.value?.address?.city || "Oslo";

  console.log(`Employee: ${emp.id}, departureFrom: ${departureFrom}`);
  console.log(`Fly: id=${flyCat?.id}, Taxi: id=${taxiCat?.id}, PayType: id=${payType?.id}`);
  console.log(`Fly vatType: ${JSON.stringify(flyCat?.vatType)}`);
  console.log(`Taxi vatType: ${JSON.stringify(taxiCat?.vatType)}`);

  // Explore: What vatType info is available?
  console.log("\n=== PHASE 1: EXPLORE VAT TYPES ===");
  const vat0 = await api("GET", "/ledger/vatType/0?fields=*");
  const vat12 = await api("GET", "/ledger/vatType/12?fields=*");
  const vat1 = await api("GET", "/ledger/vatType/1?fields=*");
  if (vat0) console.log("VatType 0:", JSON.stringify(vat0.value));
  if (vat12) console.log("VatType 12:", JSON.stringify(vat12.value));
  if (vat1) console.log("VatType 1:", JSON.stringify(vat1.value));

  // Explore: look at existing travel expenses for patterns
  console.log("\n=== PHASE 2: LOOK AT EXISTING TRAVEL EXPENSES ===");
  const existingRes = await api("GET", "/travelExpense?count=3&fields=*&sorting=id&order=desc");
  if (existingRes?.values) {
    for (const te of existingRes.values) {
      console.log(`  TE id=${te.id}: state=${te.state}, title="${te.title}", amount=${te.amount}`);
      console.log(`    travelDetails: departure=${te.travelDetails?.departureDate}, return=${te.travelDetails?.returnDate}, dest=${te.travelDetails?.destination}`);
    }
  }

  // Explore: Check per-diem compensation openapi fields
  console.log("\n=== PHASE 3: EXPLORE PER-DIEM COMPENSATION FIELDS ===");
  // Let's read back per-diem from different expenses to see what fields exist
  if (existingRes?.values) {
    for (const te of existingRes.values.slice(0, 3)) {
      const pdRes = await api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${te.id}&fields=*`);
      if (pdRes?.values?.length > 0) {
        console.log(`  PerDiem for TE ${te.id}:`);
        for (const pd of pdRes.values) {
          console.log(`    ${JSON.stringify(pd)}`);
        }
      }
    }
  }

  console.log("\n=== PHASE 4: TEST DIFFERENT COST DATE ASSIGNMENTS ===");

  const departureDate = "2026-03-17";
  const returnDate = "2026-03-21";

  function buildPayload(label: string, costDateOverrides?: { flyDate: string; taxiDate: string }, extraPerDiem?: any) {
    return {
      employee: { id: emp.id },
      title: `T13 cost-date test: ${label}`,
      travelDetails: {
        isForeignTravel: false,
        isDayTrip: false,
        isCompensationFromRates: true,
        departureDate,
        returnDate,
        departureTime: "08:00",
        returnTime: "18:00",
        departureFrom,
        destination: "Tromsø",
        detailedJourneyDescription: `Test: ${label}`,
        purpose: `Test: ${label}`,
      },
      perDiemCompensations: [
        {
          location: "Tromsø",
          count: 4,
          rate: 800,
          amount: 3200,
          rateType: { id: 25888, rateCategory: { id: 740 } },
          overnightAccommodation: "HOTEL",
          ...extraPerDiem,
        },
      ],
      costs: [
        {
          costCategory: { id: flyCat.id },
          paymentType: { id: payType.id },
          comments: "flight",
          amountCurrencyIncVat: 2750,
          amountNOKInclVAT: 2750,
          vatType: { id: 0 },
          date: costDateOverrides?.flyDate || departureDate,
        },
        {
          costCategory: { id: taxiCat.id },
          paymentType: { id: payType.id },
          comments: "taxi",
          amountCurrencyIncVat: 700,
          amountNOKInclVAT: 700,
          vatType: { id: 0 },
          date: costDateOverrides?.taxiDate || departureDate,
        },
      ],
    };
  }

  async function createDeliverReadback(label: string, payload: any) {
    console.log(`\n--- TEST: ${label} ---`);
    const createRes = await api("POST", "/travelExpense", payload);
    if (!createRes) return null;
    const te = createRes.value;
    console.log(`  Created: id=${te.id}`);

    const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${te.id}`);
    if (!deliverRes) return null;
    const del = deliverRes.values?.[0] || deliverRes.value;
    console.log(`  Delivered: state=${del.state}`);

    // Full readback
    const costRes = await api("GET", `/travelExpense/cost?travelExpenseId=${te.id}&fields=*`);
    if (costRes?.values) {
      for (const c of costRes.values) {
        console.log(`  Cost: cat=${c.costCategory?.id}, comments="${c.comments}", amount=${c.amountNOKInclVAT}, date=${c.date}, isPaidByEmployee=${c.isPaidByEmployee}, vatType=${c.vatType?.id}`);
      }
    }

    const pdRes = await api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${te.id}&fields=*`);
    if (pdRes?.values) {
      for (const p of pdRes.values) {
        console.log(`  PerDiem: count=${p.count}, rate=${p.rate}, amount=${p.amount}, overnight=${p.overnightAccommodation}, location=${p.location}, address="${p.address}"`);
        console.log(`    deductions: breakfast=${p.isDeductionForBreakfast}, lunch=${p.isDeductionForLunch}, dinner=${p.isDeductionForDinner}`);
      }
    }

    return { id: te.id, delivered: del };
  }

  // Test A: Both costs on departure date (current default)
  await createDeliverReadback("both-costs-departure",
    buildPayload("both-departure", { flyDate: departureDate, taxiDate: departureDate }));

  // Test B: Flight on departure, taxi on return
  await createDeliverReadback("fly-departure-taxi-return",
    buildPayload("fly-dep-taxi-ret", { flyDate: departureDate, taxiDate: returnDate }));

  // Test C: Both costs on return date
  await createDeliverReadback("both-costs-return",
    buildPayload("both-return", { flyDate: returnDate, taxiDate: returnDate }));

  // Test D: No rate/amount on per-diem — see if system fills them
  console.log("\n=== PHASE 5: PER-DIEM WITHOUT RATE/AMOUNT ===");
  const payloadNoRate = buildPayload("no-rate-perdiem", undefined, { rate: undefined, amount: undefined, count: 4 });
  await createDeliverReadback("per-diem-no-rate-amount", payloadNoRate);

  // Test E: Per-diem with system rate (1012)
  await createDeliverReadback("per-diem-system-rate",
    buildPayload("system-rate", undefined, { rate: 1012, amount: 4048 }));

  // Test F: Per-diem with count=5 (days, not overnights)
  await createDeliverReadback("per-diem-count-days",
    buildPayload("count-days", undefined, { count: 5, rate: 800, amount: 4000 }));

  // Test G: overnightAccommodation=NONE with count=4
  await createDeliverReadback("overnight-NONE",
    buildPayload("overnight-none", undefined, { overnightAccommodation: "NONE" }));

  // Test H: Look at what fields exist on per-diem that we might be missing
  console.log("\n=== PHASE 6: EXPLORE ALL PER-DIEM FIELDS ===");
  const allPdFields = await api("GET", "/travelExpense/perDiemCompensation?count=5&fields=*&sorting=id&order=desc");
  if (allPdFields?.values) {
    const firstPd = allPdFields.values[0];
    console.log("All fields on a per-diem compensation object:");
    for (const [key, value] of Object.entries(firstPd)) {
      console.log(`  ${key}: ${JSON.stringify(value)}`);
    }
  }

  // Test I: Check if per-diem needs an explicit address (not just location)
  await createDeliverReadback("per-diem-with-address",
    buildPayload("with-address", undefined, { address: "Tromsø" }));

  console.log("\n=== PHASE 7: CHECK WHAT THE PARENT TE LOOKS LIKE ===");
  // Get the most recent test expense full details
  const latestRes = await api("GET", "/travelExpense?count=1&fields=*&sorting=id&order=desc");
  if (latestRes?.values?.[0]) {
    const latest = latestRes.values[0];
    console.log("Full parent TE fields:");
    for (const [key, value] of Object.entries(latest)) {
      console.log(`  ${key}: ${JSON.stringify(value)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
