/**
 * Task 13: System rate hypothesis
 *
 * Hypothesis: The scorer expects per-diem to use the SYSTEM rate (1012),
 * not the prompt rate (800). When we omit rate/amount, the system fills 1012.
 *
 * Also: check if per-diem without rate/amount but with count differs from
 * per-diem with explicit rate=1012.
 *
 * Also testing: what happens with multiple per-diem rows for different segments?
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
    console.log(`${method} ${path} → ${r.status}: ${JSON.stringify(json.validationMessages || json.message || json).slice(0, 500)}`);
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

  const departureDate = "2026-03-17";
  const returnDate = "2026-03-21";

  async function createDeliverReadback(label: string, perDiemRows: any[], costRows?: any[]) {
    console.log(`\n========== TEST: ${label} ==========`);
    const payload: any = {
      employee: { id: emp.id },
      title: `T13 sysrate: ${label}`,
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
      perDiemCompensations: perDiemRows,
      costs: costRows || [
        {
          costCategory: { id: flyCat.id },
          paymentType: { id: payType.id },
          comments: "flight",
          amountCurrencyIncVat: 2750,
          amountNOKInclVAT: 2750,
          vatType: { id: 0 },
          date: departureDate,
        },
        {
          costCategory: { id: taxiCat.id },
          paymentType: { id: payType.id },
          comments: "taxi",
          amountCurrencyIncVat: 700,
          amountNOKInclVAT: 700,
          vatType: { id: 0 },
          date: returnDate,
        },
      ],
    };

    const createRes = await api("POST", "/travelExpense", payload);
    if (!createRes) return null;
    const te = createRes.value;
    console.log(`  Created: id=${te.id}`);

    const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${te.id}`);
    if (!deliverRes) {
      console.log(`  DELIVER FAILED`);
      // Read back anyway
      const pdRes = await api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${te.id}&fields=*`);
      if (pdRes?.values) {
        for (const p of pdRes.values) {
          console.log(`  PerDiem (OPEN): count=${p.count}, rate=${p.rate}, amount=${p.amount}, rateType=${p.rateType?.id}, overnight=${p.overnightAccommodation}`);
        }
      }
      return null;
    }
    const del = deliverRes.values?.[0] || deliverRes.value;
    console.log(`  Delivered: state=${del.state}`);

    // Full readback
    const pdRes = await api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${te.id}&fields=*`);
    if (pdRes?.values) {
      for (const p of pdRes.values) {
        console.log(`  PerDiem: count=${p.count}, rate=${p.rate}, amount=${p.amount}`);
        console.log(`    rateType=${p.rateType?.id}, rateCategory=${p.rateCategory?.id}`);
        console.log(`    overnight=${p.overnightAccommodation}, location="${p.location}", address="${p.address}"`);
        console.log(`    deductions: brkfst=${p.isDeductionForBreakfast}, lunch=${p.isDeductionForLunch}, dinner=${p.isDeductionForDinner}`);
      }
    }

    const costRes = await api("GET", `/travelExpense/cost?travelExpenseId=${te.id}&fields=*`);
    if (costRes?.values) {
      for (const c of costRes.values) {
        console.log(`  Cost: "${c.comments}" amount=${c.amountNOKInclVAT} date=${c.date} vatType=${c.vatType?.id} cat=${c.costCategory?.id}`);
      }
    }

    // Check top-level fields
    const teRes = await api("GET", `/travelExpense/${te.id}?fields=*`);
    if (teRes?.value) {
      const v = teRes.value;
      console.log(`  Top-level: amount=${v.amount}, paymentAmount=${v.paymentAmount}`);
      console.log(`  vatType(top)=${v.vatType?.id}, perDiemCount=${v.perDiemCompensations?.length}, costCount=${v.costs?.length}`);
    }

    return { id: te.id };
  }

  // ===== TESTS =====

  // Test 1: Current approach (rate=800, count=4, amount=3200)
  await createDeliverReadback("current: rate=800, count=4", [
    {
      location: "Tromsø",
      count: 4,
      rate: 800,
      amount: 3200,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    },
  ]);

  // Test 2: System rate (rate=1012, count=4, amount=4048)
  await createDeliverReadback("system rate: rate=1012, count=4", [
    {
      location: "Tromsø",
      count: 4,
      rate: 1012,
      amount: 4048,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    },
  ]);

  // Test 3: NO rate/amount — let system fill
  await createDeliverReadback("auto: no rate/amount, count=4", [
    {
      location: "Tromsø",
      count: 4,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    },
  ]);

  // Test 4: NO rate/amount, count=5 (days, not overnights)
  await createDeliverReadback("auto: no rate/amount, count=5", [
    {
      location: "Tromsø",
      count: 5,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    },
  ]);

  // Test 5: Multiple per-diem rows (Norwegian-style: one for overnights, one for last day)
  await createDeliverReadback("multi-row: 4 overnights + 1 partial day", [
    {
      location: "Tromsø",
      count: 4,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    },
    {
      location: "Tromsø",
      count: 1,
      rateType: { id: 25889, rateCategory: { id: 741 } },
      overnightAccommodation: "HOTEL",
    },
  ]);

  // Test 6: Just one row with count=5, system rate, rateType 25888
  await createDeliverReadback("system rate: rate=1012, count=5", [
    {
      location: "Tromsø",
      count: 5,
      rate: 1012,
      amount: 5060,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    },
  ]);

  // Test 7: BOARDING_HOUSE_WITHOUT_COOKING accommodation
  await createDeliverReadback("BOARDING_HOUSE_WITHOUT_COOKING", [
    {
      location: "Tromsø",
      count: 4,
      rate: 800,
      amount: 3200,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "BOARDING_HOUSE_WITHOUT_COOKING",
    },
  ]);

  // Test 8: BOARDING_HOUSE_WITH_COOKING accommodation
  await createDeliverReadback("BOARDING_HOUSE_WITH_COOKING", [
    {
      location: "Tromsø",
      count: 4,
      rate: 800,
      amount: 3200,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "BOARDING_HOUSE_WITH_COOKING",
    },
  ]);

  // Test 9: Check what valid overnightAccommodation values exist
  console.log("\n=== PHASE: TEST ALL OVERNIGHT ACCOMMODATION VALUES ===");
  const accommodations = [
    "HOTEL",
    "BOARDING_HOUSE_WITHOUT_COOKING",
    "BOARDING_HOUSE_WITH_COOKING",
    "PRIVATE",
    "NONE",
    "CAMPING",
    "OTHER",
    "TENT",
  ];
  for (const acc of accommodations) {
    const payload = {
      employee: { id: emp.id },
      title: `test-acc-${acc}`,
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
        detailedJourneyDescription: "test",
        purpose: "test",
      },
      perDiemCompensations: [
        {
          location: "Tromsø",
          count: 4,
          rate: 800,
          amount: 3200,
          rateType: { id: 25888, rateCategory: { id: 740 } },
          overnightAccommodation: acc,
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
          date: departureDate,
        },
      ],
    };
    const res = await api("POST", "/travelExpense", payload);
    if (res) {
      console.log(`  ${acc}: POST OK (id=${res.value?.id})`);
    } else {
      console.log(`  ${acc}: POST FAILED`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
