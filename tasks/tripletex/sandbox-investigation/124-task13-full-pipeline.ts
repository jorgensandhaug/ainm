/**
 * Task 13: FULL pipeline test — create → deliver → approve
 *
 * Finding: PUT /travelExpense/:approve works without overrideApprovalFlow
 * and changes state from DELIVERED → APPROVED.
 *
 * NO production run has EVER called :approve. This could explain checks 2, 3, 6.
 *
 * Also test with vatType=12 (like other travel tasks in production).
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
  if (!r.ok) console.log(`  ERR: ${method} ${path} → ${r.status}: ${JSON.stringify(json.validationMessages || json.message || json).slice(0,500)}`);
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

  async function runTest(label: string, costs: any[], approve: boolean) {
    console.log(`\n=== ${label} ===`);

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
      perDiemCompensations: [{
        location: "Trondheim",
        count: 4,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      }],
      costs,
    });

    if (!createRes.ok) { console.log("  CREATE FAILED"); return null; }
    const teId = createRes.data.value.id;

    // Deliver
    const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${teId}`);
    console.log(`  DELIVER: ok=${deliverRes.ok}`);

    // Approve (if requested)
    if (approve) {
      const approveRes = await api("PUT", `/travelExpense/:approve?id=${teId}`);
      console.log(`  APPROVE: ok=${approveRes.ok}`);
    }

    // Readback
    const [parentRes, pdRes, costRes] = await Promise.all([
      api("GET", `/travelExpense/${teId}?fields=*,voucher(*)`),
      api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${teId}&fields=*`),
      api("GET", `/travelExpense/cost?travelExpenseId=${teId}&fields=*`),
    ]);

    const parent = parentRes.data?.value;
    console.log(`  state=${parent?.state}, isApproved=${parent?.isApproved}, isCompleted=${parent?.isCompleted}`);
    console.log(`  amount=${parent?.amount}, paymentAmount=${parent?.paymentAmount}`);
    console.log(`  voucher: ${JSON.stringify(parent?.voucher)}`);

    for (const pd of (pdRes.data?.values || [])) {
      console.log(`  perDiem: count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}, overnight=${pd.overnightAccommodation}`);
    }
    for (const c of (costRes.data?.values || [])) {
      console.log(`  cost "${c.comments}": inclVAT=${c.amountNOKInclVAT}, exclVAT=${c.amountNOKExclVAT}, vatType=${c.vatType?.id}, date=${c.date}`);
    }

    await api("DELETE", `/travelExpense/${teId}`);
    return { state: parent?.state, amount: parent?.amount };
  }

  // Test 1: Deliver only (baseline), vatType=0
  await runTest("T1: Deliver only, vatType=0", [
    { costCategory: { id: flyCat!.id }, paymentType: { id: payType!.id }, comments: "Flybillett", amountCurrencyIncVat: 2850, amountNOKInclVAT: 2850, vatType: { id: 0 }, date: "2026-03-17" },
    { costCategory: { id: taxiCat!.id }, paymentType: { id: payType!.id }, comments: "Taxi", amountCurrencyIncVat: 200, amountNOKInclVAT: 200, vatType: { id: 0 }, date: "2026-03-21" },
  ], false);

  // Test 2: Deliver + Approve, vatType=0
  await runTest("T2: Deliver+Approve, vatType=0", [
    { costCategory: { id: flyCat!.id }, paymentType: { id: payType!.id }, comments: "Flybillett", amountCurrencyIncVat: 2850, amountNOKInclVAT: 2850, vatType: { id: 0 }, date: "2026-03-17" },
    { costCategory: { id: taxiCat!.id }, paymentType: { id: payType!.id }, comments: "Taxi", amountCurrencyIncVat: 200, amountNOKInclVAT: 200, vatType: { id: 0 }, date: "2026-03-21" },
  ], true);

  // Test 3: Deliver + Approve, vatType=12
  await runTest("T3: Deliver+Approve, vatType=12", [
    { costCategory: { id: flyCat!.id }, paymentType: { id: payType!.id }, comments: "Flybillett", amountCurrencyIncVat: 2850, amountNOKInclVAT: 2850, vatType: { id: 12 }, date: "2026-03-17" },
    { costCategory: { id: taxiCat!.id }, paymentType: { id: payType!.id }, comments: "Taxi", amountCurrencyIncVat: 200, amountNOKInclVAT: 200, vatType: { id: 12 }, date: "2026-03-21" },
  ], true);

  // Test 4: Deliver + Approve, vatType=12, with rate=800 from prompt
  console.log("\n=== T4: Deliver+Approve, vatType=12, rate=800 ===");
  {
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
      perDiemCompensations: [{
        location: "Trondheim",
        count: 4,
        rate: 800,
        amount: 3200,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      }],
      costs: [
        { costCategory: { id: flyCat!.id }, paymentType: { id: payType!.id }, comments: "Flybillett", amountCurrencyIncVat: 2850, amountNOKInclVAT: 2850, vatType: { id: 12 }, date: "2026-03-17" },
        { costCategory: { id: taxiCat!.id }, paymentType: { id: payType!.id }, comments: "Taxi", amountCurrencyIncVat: 200, amountNOKInclVAT: 200, vatType: { id: 12 }, date: "2026-03-21" },
      ],
    });

    if (createRes.ok) {
      const teId = createRes.data.value.id;
      await api("PUT", `/travelExpense/:deliver?id=${teId}`);
      await api("PUT", `/travelExpense/:approve?id=${teId}`);

      const [parentRes, pdRes, costRes] = await Promise.all([
        api("GET", `/travelExpense/${teId}?fields=*,voucher(*)`),
        api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${teId}&fields=*`),
        api("GET", `/travelExpense/cost?travelExpenseId=${teId}&fields=*`),
      ]);

      const parent = parentRes.data?.value;
      console.log(`  state=${parent?.state}, isApproved=${parent?.isApproved}`);
      console.log(`  amount=${parent?.amount}, paymentAmount=${parent?.paymentAmount}`);
      for (const pd of (pdRes.data?.values || [])) {
        console.log(`  perDiem: count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}`);
      }
      for (const c of (costRes.data?.values || [])) {
        console.log(`  cost "${c.comments}": inclVAT=${c.amountNOKInclVAT}, vatType=${c.vatType?.id}`);
      }
      await api("DELETE", `/travelExpense/${teId}`);
    }
  }

  // Test 5: Full pipeline with count=5 (days, not overnights)
  console.log("\n=== T5: count=5 (days), Deliver+Approve, vatType=12 ===");
  {
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
      perDiemCompensations: [{
        location: "Trondheim",
        count: 5,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      }],
      costs: [
        { costCategory: { id: flyCat!.id }, paymentType: { id: payType!.id }, comments: "Flybillett", amountCurrencyIncVat: 2850, amountNOKInclVAT: 2850, vatType: { id: 12 }, date: "2026-03-17" },
        { costCategory: { id: taxiCat!.id }, paymentType: { id: payType!.id }, comments: "Taxi", amountCurrencyIncVat: 200, amountNOKInclVAT: 200, vatType: { id: 12 }, date: "2026-03-21" },
      ],
    });

    if (createRes.ok) {
      const teId = createRes.data.value.id;
      await api("PUT", `/travelExpense/:deliver?id=${teId}`);
      await api("PUT", `/travelExpense/:approve?id=${teId}`);

      const [parentRes, pdRes] = await Promise.all([
        api("GET", `/travelExpense/${teId}?fields=*`),
        api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${teId}&fields=*`),
      ]);

      const parent = parentRes.data?.value;
      console.log(`  state=${parent?.state}, isApproved=${parent?.isApproved}`);
      console.log(`  amount=${parent?.amount}, paymentAmount=${parent?.paymentAmount}`);
      for (const pd of (pdRes.data?.values || [])) {
        console.log(`  perDiem: count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}`);
      }
      await api("DELETE", `/travelExpense/${teId}`);
    }
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
