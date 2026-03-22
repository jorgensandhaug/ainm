/**
 * Task 13: Hypothesis testing — what do checks 2, 3, 6 actually test?
 *
 * Known: checks 1,4,5 ALWAYS pass, checks 2,3,6 ALWAYS fail (20/20 runs).
 *
 * The production run sent: rate=800, amount=3200, count=4, both cost dates=departureDate.
 * The updated playbook says: NO rate, NO amount, count=4 (overnights), taxi date=returnDate.
 *
 * Test matrix (sandbox):
 *   A: OLD approach — rate=800, amount=3200, both dates=departure (what all 20 prod runs did)
 *   B: NEW approach — no rate/amount (system fills 1012/4048), flight=departure, taxi=return
 *   C: Hybrid — no rate/amount, both dates=departure (isolate date vs rate effect)
 *   D: Hybrid — rate=800, amount=3200, flight=departure, taxi=return (isolate date effect)
 *
 * After creating all 4, read back EVERY field and compare.
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
    console.log(`  ERR: ${method} ${path} → ${r.status}: ${text.slice(0, 200)}`);
    return { ok: false, status: r.status, data: null };
  }
  if (!r.ok) {
    console.log(`  ERR: ${method} ${path} → ${r.status}: ${JSON.stringify(json.validationMessages || json.message || json).slice(0, 300)}`);
    return { ok: false, status: r.status, data: json };
  }
  return { ok: true, status: r.status, data: json };
}

async function main() {
  // CLEANUP
  console.log("=== CLEANUP ===");
  const listRes = await api("GET", "/travelExpense?count=1000&fields=id");
  for (const te of (listRes.data?.values || [])) {
    await api("DELETE", `/travelExpense/${te.id}`);
  }

  // SETUP
  console.log("\n=== SETUP ===");
  const [empRes, catRes, ptRes] = await Promise.all([
    api("GET", "/employee?email=lucy.walker@example.org&count=10&fields=*"),
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = (empRes.data?.values || []).find((e: any) => e.email === "lucy.walker@example.org") || empRes.data?.values?.[0];
  const travelCats = (catRes.data?.values || []).filter((c: any) => c.showOnTravelExpenses);
  const flyCat = travelCats.find((c: any) => c.description === "Fly");
  const taxiCat = travelCats.find((c: any) => c.description === "Taxi");
  const payType = (ptRes.data?.values || []).filter((p: any) => p.showOnTravelExpenses)[0];

  console.log(`  emp: id=${emp.id}, addr=${emp.address?.city || 'null'}, companyId=${emp.companyId}`);
  console.log(`  fly: id=${flyCat?.id}, vatType=${flyCat?.vatType?.id}`);
  console.log(`  taxi: id=${taxiCat?.id}, vatType=${taxiCat?.vatType?.id}`);
  console.log(`  pay: id=${payType?.id}`);

  // Company fallback
  let departureFrom = emp.address?.city;
  if (!departureFrom) {
    const compRes = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
    departureFrom = compRes.data?.value?.address?.city || "Oslo";
    console.log(`  departureFrom (company): ${departureFrom}`);
  }

  const departureDate = "2026-03-17";
  const returnDate = "2026-03-21";
  const destination = "Trondheim";

  interface TestConfig {
    label: string;
    perDiem: Record<string, any>;
    flightDate: string;
    taxiDate: string;
  }

  const tests: TestConfig[] = [
    {
      label: "A: OLD (rate=800, amount=3200, both dates=departure)",
      perDiem: { count: 4, rate: 800, amount: 3200 },
      flightDate: departureDate,
      taxiDate: departureDate,
    },
    {
      label: "B: NEW (no rate/amount, flight=departure, taxi=return)",
      perDiem: { count: 4 },
      flightDate: departureDate,
      taxiDate: returnDate,
    },
    {
      label: "C: no rate/amount, both dates=departure",
      perDiem: { count: 4 },
      flightDate: departureDate,
      taxiDate: departureDate,
    },
    {
      label: "D: rate=800, amount=3200, taxi=return",
      perDiem: { count: 4, rate: 800, amount: 3200 },
      flightDate: departureDate,
      taxiDate: returnDate,
    },
  ];

  const results: any[] = [];

  for (const test of tests) {
    console.log(`\n=== ${test.label} ===`);

    const perDiemObj: any = {
      location: destination,
      ...test.perDiem,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    };

    const payload = {
      employee: { id: emp.id },
      title: "Kundebesøk Trondheim",
      travelDetails: {
        isForeignTravel: false,
        isDayTrip: false,
        isCompensationFromRates: true,
        departureDate,
        returnDate,
        departureTime: "08:00",
        returnTime: "18:00",
        departureFrom,
        destination,
        detailedJourneyDescription: "Kundebesøk Trondheim",
        purpose: "Kundebesøk Trondheim",
      },
      perDiemCompensations: [perDiemObj],
      costs: [
        {
          costCategory: { id: flyCat!.id },
          paymentType: { id: payType!.id },
          comments: "Flybillett",
          amountCurrencyIncVat: 2850,
          amountNOKInclVAT: 2850,
          vatType: { id: 0 },  // sandbox not VAT-registered
          date: test.flightDate,
        },
        {
          costCategory: { id: taxiCat!.id },
          paymentType: { id: payType!.id },
          comments: "Taxi",
          amountCurrencyIncVat: 200,
          amountNOKInclVAT: 200,
          vatType: { id: 0 },
          date: test.taxiDate,
        },
      ],
    };

    const createRes = await api("POST", "/travelExpense", payload);
    if (!createRes.ok) { results.push({ label: test.label, status: "FAILED" }); continue; }
    const te = createRes.data.value;

    const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${te.id}`);
    if (!deliverRes.ok) { results.push({ label: test.label, status: "DELIVER_FAILED", id: te.id }); continue; }
    const del = deliverRes.data.values?.[0] || deliverRes.data.value;

    // Full readback
    const [pdRes, costRes, teRes] = await Promise.all([
      api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${te.id}&fields=*`),
      api("GET", `/travelExpense/cost?travelExpenseId=${te.id}&fields=*`),
      api("GET", `/travelExpense/${te.id}?fields=*`),
    ]);

    const pd = pdRes.data?.values?.[0];
    const costs = costRes.data?.values || [];
    const parent = teRes.data?.value;

    console.log(`  DELIVERED id=${del.id}`);
    console.log(`  PerDiem: count=${pd?.count}, rate=${pd?.rate}, amount=${pd?.amount}, rateType=${pd?.rateType?.id}, overnight=${pd?.overnightAccommodation}`);

    for (const c of costs) {
      console.log(`  Cost "${c.comments}": amount=${c.amountNOKInclVAT}, amountCurrIncVat=${c.amountCurrencyIncVat}, date=${c.date}, vatType=${c.vatType?.id}, cat=${c.costCategory?.id}, pay=${c.paymentType?.id}`);
      console.log(`    vatAmount=${c.vatAmount}, amountNOKExclVAT=${c.amountNOKExclVAT}, amountCurrExclVat=${c.amountCurrencyExclVat}`);
    }

    console.log(`  Parent: amount=${parent?.amount}, paymentAmount=${parent?.paymentAmount}, state=${parent?.state}`);
    console.log(`  TravelDetails: depart=${parent?.travelDetails?.departureDate}, return=${parent?.travelDetails?.returnDate}`);
    console.log(`    departureFrom=${parent?.travelDetails?.departureFrom}, destination=${parent?.travelDetails?.destination}`);
    console.log(`    isForeignTravel=${parent?.travelDetails?.isForeignTravel}, isDayTrip=${parent?.travelDetails?.isDayTrip}`);
    console.log(`    isCompensationFromRates=${parent?.travelDetails?.isCompensationFromRates}`);

    results.push({
      label: test.label,
      status: "DELIVERED",
      id: te.id,
      perDiem: {
        count: pd?.count,
        rate: pd?.rate,
        amount: pd?.amount,
        rateType: pd?.rateType?.id,
        rateCategory: pd?.rateCategory?.id,
      },
      costs: costs.map((c: any) => ({
        comments: c.comments,
        amountNOKInclVAT: c.amountNOKInclVAT,
        amountNOKExclVAT: c.amountNOKExclVAT,
        amountCurrencyIncVat: c.amountCurrencyIncVat,
        amountCurrencyExclVat: c.amountCurrencyExclVat,
        vatAmount: c.vatAmount,
        date: c.date,
        vatType: c.vatType?.id,
      })),
      parent: {
        amount: parent?.amount,
        paymentAmount: parent?.paymentAmount,
      },
    });
  }

  // COMPARISON TABLE
  console.log("\n\n=== COMPARISON ===\n");
  for (const r of results) {
    console.log(`${r.label}`);
    if (r.status !== "DELIVERED") { console.log(`  STATUS: ${r.status}\n`); continue; }
    const pd = r.perDiem;
    console.log(`  PerDiem: count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}`);
    for (const c of r.costs) {
      console.log(`  Cost "${c.comments}": inclVAT=${c.amountNOKInclVAT}, exclVAT=${c.amountNOKExclVAT}, vat=${c.vatAmount}, date=${c.date}, vatType=${c.vatType}`);
    }
    console.log(`  Parent: amount=${r.parent.amount}, paymentAmount=${r.parent.paymentAmount}`);
    console.log();
  }

  // CLEANUP
  console.log("=== FINAL CLEANUP ===");
  const finalList = await api("GET", "/travelExpense?count=1000&fields=id");
  for (const te of (finalList.data?.values || [])) {
    await api("DELETE", `/travelExpense/${te.id}`);
  }
  console.log("Done.");
}

main().catch(e => { console.error(e); process.exit(1); });
