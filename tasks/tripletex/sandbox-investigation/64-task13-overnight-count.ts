/**
 * Task 13 investigation: overnight count hypothesis
 *
 * Hypothesis: per-diem count should be OVERNIGHTS (days-1), not days.
 * A 5-day trip (Mar 17–21) has 4 overnights → count=4, not count=5.
 *
 * Tests:
 *   A) count=4, rate=800, amount=3200 (overnights × prompt rate)
 *   B) count=4, rate=1012, amount=4048 (overnights × system rate)
 *   C) count=5, rate=800, amount=4000 (days × prompt rate — current prod behavior, baseline)
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
  const json = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) {
    console.error(JSON.stringify(json, null, 2));
    throw new Error(`${r.status} on ${method} ${path}`);
  }
  return json;
}

async function main() {
  // 1. Get an employee
  const empRes = await api("GET", "/employee?count=1&fields=*");
  const emp = empRes.values[0];
  console.log(
    `Employee: id=${emp.id}, name=${emp.firstName} ${emp.lastName}, companyId=${emp.companyId}`
  );

  // 2. Parallel: costCategory + paymentType + company (for departureFrom)
  const [costCatRes, payTypeRes, companyRes] = await Promise.all([
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
    api("GET", `/company/${emp.companyId}?fields=*,address(*)`),
  ]);

  const company = companyRes.value;
  const departureFrom =
    emp.address?.city ||
    company?.address?.city ||
    company?.address?.addressLine1 ||
    "Oslo";
  console.log(`departureFrom: ${departureFrom}`);

  // Resolve categories
  const travelCats = costCatRes.values.filter(
    (c: any) => c.showOnTravelExpenses
  );
  const flyCat = travelCats.find((c: any) => c.description === "Fly");
  const taxiCat = travelCats.find((c: any) => c.description === "Taxi");
  console.log(`Categories: Fly=${flyCat?.id}, Taxi=${taxiCat?.id}`);

  // Resolve payment type
  const payType = payTypeRes.values.find(
    (p: any) => p.showOnTravelExpenses
  );
  console.log(`PaymentType: ${payType?.id} (${payType?.description})`);

  if (!flyCat || !taxiCat || !payType) {
    throw new Error("Missing category or payment type");
  }

  const departureDate = "2026-03-17";
  const returnDate = "2026-03-21";

  // Helper: build payload
  function buildPayload(
    label: string,
    count: number,
    rate: number,
    amount: number
  ) {
    return {
      employee: { id: emp.id },
      title: `Test overnight count: ${label}`,
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
          count,
          rate,
          amount,
          rateType: { id: 25888, rateCategory: { id: 740 } },
          overnightAccommodation: "HOTEL",
        },
      ],
      costs: [
        {
          costCategory: { id: flyCat.id },
          paymentType: { id: payType.id },
          comments: "flight",
          amountCurrencyIncVat: 10000,
          amountNOKInclVAT: 10000,
          vatType: { id: 0 },
          date: departureDate,
        },
        {
          costCategory: { id: taxiCat.id },
          paymentType: { id: payType.id },
          comments: "taxi",
          amountCurrencyIncVat: 2500,
          amountNOKInclVAT: 2500,
          vatType: { id: 0 },
          date: returnDate,
        },
      ],
    };
  }

  // ---- Test A: count=4 (overnights), rate=800 ----
  console.log("\n========== TEST A: count=4, rate=800, amount=3200 ==========");
  const payloadA = buildPayload("count4-rate800", 4, 800, 3200);
  const createA = await api("POST", "/travelExpense", payloadA);
  const teA = createA.value;
  console.log(
    `Created: id=${teA.id}, state=${teA.state}`
  );
  const deliverA = await api("PUT", `/travelExpense/:deliver?id=${teA.id}`);
  const delA = deliverA.values?.[0] || deliverA.value;
  console.log(`Delivered: id=${delA.id}, state=${delA.state}`);

  // Read back per-diem details
  const pdA = await api(
    "GET",
    `/travelExpense/perDiemCompensation?travelExpenseId=${teA.id}&fields=*`
  );
  const pdRowA = pdA.values?.[0];
  console.log(
    `PerDiem readback: count=${pdRowA?.count}, rate=${pdRowA?.rate}, amount=${pdRowA?.amount}, rateType=${JSON.stringify(pdRowA?.rateType)}, overnight=${pdRowA?.overnightAccommodation}`
  );

  // ---- Test B: count=4 (overnights), rate=1012 (system rate) ----
  console.log(
    "\n========== TEST B: count=4, rate=1012, amount=4048 =========="
  );
  const payloadB = buildPayload("count4-rate1012", 4, 1012, 4048);
  const createB = await api("POST", "/travelExpense", payloadB);
  const teB = createB.value;
  console.log(
    `Created: id=${teB.id}, state=${teB.state}`
  );
  const deliverB = await api("PUT", `/travelExpense/:deliver?id=${teB.id}`);
  const delB = deliverB.values?.[0] || deliverB.value;
  console.log(`Delivered: id=${delB.id}, state=${delB.state}`);

  const pdB = await api(
    "GET",
    `/travelExpense/perDiemCompensation?travelExpenseId=${teB.id}&fields=*`
  );
  const pdRowB = pdB.values?.[0];
  console.log(
    `PerDiem readback: count=${pdRowB?.count}, rate=${pdRowB?.rate}, amount=${pdRowB?.amount}, rateType=${JSON.stringify(pdRowB?.rateType)}, overnight=${pdRowB?.overnightAccommodation}`
  );

  // ---- Test C: count=5 (days), rate=800 (current prod behavior) ----
  console.log(
    "\n========== TEST C: count=5, rate=800, amount=4000 (baseline) =========="
  );
  const payloadC = buildPayload("count5-rate800-baseline", 5, 800, 4000);
  const createC = await api("POST", "/travelExpense", payloadC);
  const teC = createC.value;
  console.log(
    `Created: id=${teC.id}, state=${teC.state}`
  );
  const deliverC = await api("PUT", `/travelExpense/:deliver?id=${teC.id}`);
  const delC = deliverC.values?.[0] || deliverC.value;
  console.log(`Delivered: id=${delC.id}, state=${delC.state}`);

  const pdC = await api(
    "GET",
    `/travelExpense/perDiemCompensation?travelExpenseId=${teC.id}&fields=*`
  );
  const pdRowC = pdC.values?.[0];
  console.log(
    `PerDiem readback: count=${pdRowC?.count}, rate=${pdRowC?.rate}, amount=${pdRowC?.amount}, rateType=${JSON.stringify(pdRowC?.rateType)}, overnight=${pdRowC?.overnightAccommodation}`
  );

  // ---- Summary ----
  console.log("\n========== SUMMARY ==========");
  console.log(
    `A) count=4, rate=800:  delivered=${delA.state}, perDiem: count=${pdRowA?.count}, rate=${pdRowA?.rate}, amount=${pdRowA?.amount}`
  );
  console.log(
    `B) count=4, rate=1012: delivered=${delB.state}, perDiem: count=${pdRowB?.count}, rate=${pdRowB?.rate}, amount=${pdRowB?.amount}`
  );
  console.log(
    `C) count=5, rate=800:  delivered=${delC.state}, perDiem: count=${pdRowC?.count}, rate=${pdRowC?.rate}, amount=${pdRowC?.amount}`
  );

  // Check if Tripletex overrides any values
  console.log("\n========== DID TRIPLETEX OVERRIDE ANYTHING? ==========");
  console.log(`A sent count=4,rate=800,amount=3200 → got count=${pdRowA?.count},rate=${pdRowA?.rate},amount=${pdRowA?.amount}`);
  console.log(`B sent count=4,rate=1012,amount=4048 → got count=${pdRowB?.count},rate=${pdRowB?.rate},amount=${pdRowB?.amount}`);
  console.log(`C sent count=5,rate=800,amount=4000 → got count=${pdRowC?.count},rate=${pdRowC?.rate},amount=${pdRowC?.amount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
