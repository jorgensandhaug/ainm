/**
 * Task 13: Systematic hypothesis testing
 *
 * ALL 20+ production runs scored 4.5/8 with checks 2,3,6 failing,
 * regardless of rate (800/1012/omitted), count (4/5), vatType (0/12).
 * Something ELSE is wrong.
 *
 * Hypotheses to test:
 *   H1: isPaidByEmployee must be true on costs
 *   H2: perDiemCompensation should have isDeductionForBreakfast=true (hotel includes breakfast)
 *   H3: Need separate per-diem rows per night (not a single row with count=N)
 *   H4: Per-diem should be a cost line, not perDiemCompensation
 *   H5: costs need amountNOKInclVATLow set (VAT breakdown)
 *   H6: There should be NO perDiemCompensation — just costs
 *
 * Each hypothesis creates, delivers, reads back, then deletes.
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
  try { json = JSON.parse(text); } catch {
    if (r.ok) return { ok: true, status: r.status, data: null };
    return { ok: false, status: r.status, data: text };
  }
  if (!r.ok) {
    console.log(`  ERR: ${method} ${path} → ${r.status}: ${JSON.stringify(json.validationMessages || json.message || json).slice(0, 400)}`);
  }
  return { ok: r.ok, status: r.status, data: json };
}

async function main() {
  // CLEANUP
  const listRes = await api("GET", "/travelExpense?count=1000&fields=id");
  for (const te of (listRes.data?.values || [])) {
    await api("DELETE", `/travelExpense/${te.id}`);
  }

  // SETUP
  const [empRes, catRes, ptRes] = await Promise.all([
    api("GET", "/employee?email=lucy.walker@example.org&count=10&fields=*"),
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = empRes.data?.values?.[0];
  const travelCats = (catRes.data?.values || []).filter((c: any) => c.showOnTravelExpenses);
  const flyCat = travelCats.find((c: any) => c.description === "Fly");
  const taxiCat = travelCats.find((c: any) => c.description === "Taxi");
  const allPayTypes = (ptRes.data?.values || []).filter((p: any) => p.showOnTravelExpenses);
  const payType = allPayTypes[0];

  console.log("=== PAYMENT TYPES AVAILABLE ===");
  for (const pt of allPayTypes) {
    console.log(`  id=${pt.id} desc="${pt.description}" showOnTravel=${pt.showOnTravelExpenses}`);
    // Show all fields
    for (const [k, v] of Object.entries(pt)) {
      if (k !== "id" && k !== "description" && k !== "showOnTravelExpenses") {
        console.log(`    ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
      }
    }
  }

  // Company fallback
  const compRes = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
  const departureFrom = compRes.data?.value?.address?.city || "Oslo";

  const basePayload = () => ({
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

  const baseCosts = () => ([
    {
      costCategory: { id: flyCat!.id },
      paymentType: { id: payType!.id },
      comments: "Flybillett",
      amountCurrencyIncVat: 2850,
      amountNOKInclVAT: 2850,
      vatType: { id: 0 },
      date: "2026-03-17",
    },
    {
      costCategory: { id: taxiCat!.id },
      paymentType: { id: payType!.id },
      comments: "Taxi",
      amountCurrencyIncVat: 200,
      amountNOKInclVAT: 200,
      vatType: { id: 0 },
      date: "2026-03-21",
    },
  ]);

  const basePerDiem = () => ([
    {
      location: "Trondheim",
      count: 4,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    },
  ]);

  async function runTest(label: string, payload: any) {
    console.log(`\n=== ${label} ===`);
    const createRes = await api("POST", "/travelExpense", payload);
    if (!createRes.ok) {
      console.log("  CREATE FAILED");
      return null;
    }
    const te = createRes.data.value;

    const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${te.id}`);
    if (!deliverRes.ok) {
      console.log("  DELIVER FAILED — reading back anyway");
    }
    const del = deliverRes.ok ? (deliverRes.data.values?.[0] || deliverRes.data.value) : null;

    // Readback
    const [pdRes, costRes, parentRes] = await Promise.all([
      api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${te.id}&fields=*`),
      api("GET", `/travelExpense/cost?travelExpenseId=${te.id}&fields=*`),
      api("GET", `/travelExpense/${te.id}?fields=*`),
    ]);

    const pds = pdRes.data?.values || [];
    const costs = costRes.data?.values || [];
    const parent = parentRes.data?.value;

    console.log(`  state=${del?.state || parent?.state}`);
    console.log(`  parent: amount=${parent?.amount}, paymentAmount=${parent?.paymentAmount}`);

    for (const pd of pds) {
      console.log(`  perDiem: count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}, breakfast=${pd.isDeductionForBreakfast}, lunch=${pd.isDeductionForLunch}, dinner=${pd.isDeductionForDinner}`);
    }

    for (const c of costs) {
      console.log(`  cost "${c.comments}": amount=${c.amountNOKInclVAT}, isPaidByEmployee=${c.isPaidByEmployee}, date=${c.date}`);
    }

    // Cleanup
    await api("DELETE", `/travelExpense/${te.id}`);

    return { state: del?.state || parent?.state, amount: parent?.amount, paymentAmount: parent?.paymentAmount, pds, costs };
  }

  // H0: BASELINE (current approach)
  {
    const p = basePayload();
    (p as any).perDiemCompensations = basePerDiem();
    (p as any).costs = baseCosts();
    await runTest("H0: BASELINE (current approach)", p);
  }

  // H1: isPaidByEmployee=true on costs
  {
    const p = basePayload();
    (p as any).perDiemCompensations = basePerDiem();
    const costs = baseCosts();
    costs.forEach((c: any) => c.isPaidByEmployee = true);
    (p as any).costs = costs;
    await runTest("H1: isPaidByEmployee=true on costs", p);
  }

  // H2: isDeductionForBreakfast=true on per-diem
  {
    const p = basePayload();
    const pds = basePerDiem();
    (pds[0] as any).isDeductionForBreakfast = true;
    (p as any).perDiemCompensations = pds;
    (p as any).costs = baseCosts();
    await runTest("H2: isDeductionForBreakfast=true", p);
  }

  // H3: 4 separate per-diem rows (one per overnight)
  {
    const p = basePayload();
    const pds = [];
    for (let i = 0; i < 4; i++) {
      pds.push({
        location: "Trondheim",
        count: 1,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      });
    }
    (p as any).perDiemCompensations = pds;
    (p as any).costs = baseCosts();
    await runTest("H3: 4 separate per-diem rows (count=1 each)", p);
  }

  // H4: No perDiemCompensation, add per-diem as a cost line
  {
    const p = basePayload();
    (p as any).travelDetails.isCompensationFromRates = false;
    const costs = baseCosts();
    // Add a "diet" cost line
    const dietCat = travelCats.find((c: any) => c.description === "Mat");
    if (dietCat) {
      costs.push({
        costCategory: { id: dietCat.id },
        paymentType: { id: payType!.id },
        comments: "Diett",
        amountCurrencyIncVat: 3200,
        amountNOKInclVAT: 3200,
        vatType: { id: 0 },
        date: "2026-03-17",
      } as any);
    }
    (p as any).costs = costs;
    await runTest("H4: No per-diem, diet as cost (Mat category, 3200 NOK)", p);
  }

  // H5: Per-diem with rate=800 and amount=3200 (explicit) + count=4
  {
    const p = basePayload();
    const pds = basePerDiem();
    (pds[0] as any).rate = 800;
    (pds[0] as any).amount = 3200;
    (p as any).perDiemCompensations = pds;
    (p as any).costs = baseCosts();
    await runTest("H5: Per-diem with explicit rate=800, amount=3200", p);
  }

  // H6: Everything together — isPaidByEmployee + no rate/amount + correct count
  {
    const p = basePayload();
    (p as any).perDiemCompensations = basePerDiem();
    const costs = baseCosts();
    costs.forEach((c: any) => c.isPaidByEmployee = true);
    (p as any).costs = costs;
    await runTest("H6: isPaidByEmployee=true + no rate/amount (combined fix)", p);
  }

  // H7: Check if we can POST with rate=800 and count=5 (what old agents did)
  {
    const p = basePayload();
    const pds = [{
      location: "Trondheim",
      count: 5,
      rate: 800,
      amount: 4000,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }];
    (p as any).perDiemCompensations = pds;
    (p as any).costs = baseCosts();
    await runTest("H7: OLD approach (rate=800, count=5, amount=4000)", p);
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
