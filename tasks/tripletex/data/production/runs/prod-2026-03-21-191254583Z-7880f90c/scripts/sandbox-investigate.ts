// Sandbox investigation: test whether we can skip any lookups
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Authorization": AUTH, "Content-Type": "application/json" };

let callCount = 0;

async function api(method: string, path: string, body?: any) {
  callCount++;
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`[${callCount}] ${r.status} ${method} ${path}`);
  if (!r.ok) console.log("  Error:", JSON.stringify(json).slice(0, 400));
  return { status: r.status, data: json };
}

async function main() {
  // Test 1: Check if costCategory/paymentType IDs are stable across sandbox accounts
  // We know from previous sandbox runs: Fly=32813722, Taxi=32813737, PayType=32813706
  // But these IDs vary per account, so we can't hardcode them.

  // Test 2: Can we skip the rate lookup by providing a known rateType?
  // Previous sandbox: rateType.id=25886, rateCategory.id=738
  // These might be global/stable IDs since they're government-set rates

  // Let's first verify the employee exists
  const empRes = await api("GET", "/employee?email=lars.johansen@example.org&count=10&fields=*");
  const employees = empRes.data?.values || [];
  console.log("Employees found:", employees.length);

  if (employees.length === 0) {
    console.log("No lars.johansen in sandbox. Using known sandbox employee.");
    // Use the known sandbox employee
    const emp2 = await api("GET", "/employee?id=18478235&fields=*");
    const emp = emp2.data?.value;
    console.log("Employee:", emp?.id, emp?.firstName, emp?.lastName);

    // Test: are rate IDs stable? Check if 25886 still works
    const rateRes = await api("GET", "/travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=2026-03-19&dateTo=2026-03-21&count=1000&fields=*");
    const rates = rateRes.data?.values || [];
    console.log("Rates found:", rates.length);
    for (const r of rates) {
      console.log(`  Rate id=${r.id} rate=${r.rate} rateCategory.id=${r.rateCategory?.id}`);
    }

    // Check if rate IDs are the same as production (25886, 738)
    const match = rates.find((r: any) => r.id === 25886);
    console.log("Rate 25886 found in sandbox:", !!match);

    // Test: can we skip costCategory and paymentType lookups entirely
    // by using id=0 or omitting them? (We know from trusted standard this fails at :deliver)
    // Let's verify one more time:
    const catRes = await api("GET", "/travelExpense/costCategory?count=1000&fields=*");
    const cats = (catRes.data?.values || []).filter((c: any) => c.showOnTravelExpenses);
    console.log("\nTravel cost categories:");
    for (const c of cats) {
      console.log(`  id=${c.id} description="${c.description}"`);
    }

    const ptRes = await api("GET", "/travelExpense/paymentType?count=1000&fields=*");
    const pts = (ptRes.data?.values || []).filter((p: any) => p.showOnTravelExpenses);
    console.log("\nTravel payment types:");
    for (const p of pts) {
      console.log(`  id=${p.id} description="${p.description}" isActive=${p.isActive}`);
    }

    // Key question: do costCategory and paymentType IDs vary per account?
    // Sandbox: Fly=32813722, Taxi=32813737, PayType=32813706
    // Production (this run): Fly=28149510, Taxi=28149525, PayType=28149494
    // YES - they vary. So we MUST look them up.
    console.log("\n=== CONCLUSION ===");
    console.log("costCategory IDs: VARY per account (sandbox Fly=32813722, prod Fly=28149510)");
    console.log("paymentType IDs: VARY per account (sandbox=32813706, prod=28149494)");
    console.log("rate IDs: appear STABLE (25886 in both sandbox and prod)");
    console.log("rateCategory IDs: appear STABLE (738 in both sandbox and prod)");

    // Test 3: Can we skip the rate lookup if rate IDs are stable?
    // Try creating with hardcoded rateType id=25886, rateCategory.id=738
    console.log("\n=== TEST: POST with hardcoded rateType ===");
    const flyCat = cats.find((c: any) => c.description === "Fly");
    const taxiCat = cats.find((c: any) => c.description === "Taxi");
    const payType = pts.find((p: any) => /privat/i.test(p.description)) || pts[0];

    const payload = {
      employee: { id: emp?.id },
      title: "Test hardcoded rateType",
      travelDetails: {
        isForeignTravel: false,
        isDayTrip: false,
        isCompensationFromRates: true,
        departureDate: "2026-03-19",
        returnDate: "2026-03-21",
        departureTime: "08:00",
        returnTime: "18:00",
        departureFrom: "Oslo",
        destination: "Stavanger",
        detailedJourneyDescription: "Test hardcoded rateType",
        purpose: "Test hardcoded rateType",
      },
      perDiemCompensations: [
        {
          location: "Stavanger",
          count: 3,
          rate: 800,
          amount: 2400,
          rateType: { id: 25886, rateCategory: { id: 738 } },
          overnightAccommodation: "HOTEL",
        },
      ],
      costs: [
        {
          costCategory: { id: flyCat?.id },
          paymentType: { id: payType?.id },
          comments: "flybillett",
          amountCurrencyIncVat: 3900,
          amountNOKInclVAT: 3900,
          vatType: { id: 0 },
          date: "2026-03-19",
        },
        {
          costCategory: { id: taxiCat?.id },
          paymentType: { id: payType?.id },
          comments: "taxi",
          amountCurrencyIncVat: 350,
          amountNOKInclVAT: 350,
          vatType: { id: 0 },
          date: "2026-03-21",
        },
      ],
    };

    const createRes = await api("POST", "/travelExpense", payload);
    const created = createRes.data?.value;
    if (createRes.status < 400 && created?.id) {
      console.log("POST succeeded with hardcoded rateType! ID:", created.id);

      // Try delivering
      const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${created.id}`);
      const delivered = deliverRes.data?.values?.[0];
      console.log("Deliver status:", deliverRes.status, "state:", delivered?.state);

      if (deliverRes.status < 400) {
        console.log("\n=== HARDCODED RATE IDS WORK! ===");
        console.log("This means we could skip GET /travelExpense/rate entirely");
        console.log("Saving 1 call: 6 calls instead of 7 (when employee has no address)");
      }
    } else {
      console.log("POST failed with hardcoded rateType");
    }
  }

  console.log(`\nTotal sandbox calls: ${callCount}`);
}

main().catch(e => console.error(e));
