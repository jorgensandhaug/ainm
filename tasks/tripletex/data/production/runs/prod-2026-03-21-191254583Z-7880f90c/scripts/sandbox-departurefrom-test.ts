// Test: does departureFrom affect per-diem or scoring?
// Create expenses with different departureFrom values
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${r.status} ${method} ${path}`);
  if (!r.ok) console.log("  ERROR:", JSON.stringify(json).slice(0, 500));
  return { status: r.status, data: json };
}

async function main() {
  // Get employee and lookups
  const empRes = await api("GET", "/employee?count=5&fields=*");
  const emp = empRes.data?.values?.find((e: any) => e.allowInformationRegistration) || empRes.data?.values?.[0];

  const [catRes, ptRes] = await Promise.all([
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const cats = (catRes.data?.values || []).filter((c: any) => c.showOnTravelExpenses);
  const flyCat = cats.find((c: any) => c.description === "Fly");
  const taxiCat = cats.find((c: any) => c.description === "Taxi");
  const pts = (ptRes.data?.values || []).filter((p: any) => p.showOnTravelExpenses);
  const payType = pts[0];

  // Test: what if departureFrom is empty/missing? Does deliver fail?
  const payload = {
    employee: { id: emp.id },
    title: "Test missing departureFrom",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: "2026-03-19",
      returnDate: "2026-03-21",
      departureTime: "08:00",
      returnTime: "18:00",
      // departureFrom intentionally omitted
      destination: "Stavanger",
      detailedJourneyDescription: "Test missing departureFrom",
      purpose: "Test missing departureFrom",
    },
    perDiemCompensations: [{
      location: "Stavanger",
      count: 3,
      rate: 800,
      amount: 2400,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }],
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

  console.log("\n=== Test: POST without departureFrom ===");
  const createRes = await api("POST", "/travelExpense", payload);
  const te = createRes.data?.value;
  console.log(`Created: id=${te?.id}, state=${te?.state}, departureFrom=${te?.travelDetails?.departureFrom}`);

  if (te?.id) {
    console.log("\n=== Try deliver without departureFrom ===");
    const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${te.id}`);
    console.log(`Deliver result: status=${deliverRes.status}`);
    if (deliverRes.status === 200) {
      const del = deliverRes.data?.values?.[0];
      console.log(`Delivered: state=${del?.state}, departureFrom=${del?.travelDetails?.departureFrom}`);
    }
  }

  // Now test: what does the full per-diem compensation look like when we expand it?
  // Also check: does rateType.rate get stored?
  console.log("\n=== Check previously delivered expense with 25888 ===");
  // Use the one we created earlier (id=11150269)
  const pdRes = await api("GET", "/travelExpense/perDiemCompensation?travelExpenseId=11150269&count=20&fields=*");
  for (const pd of (pdRes.data?.values || [])) {
    console.log("Full per-diem:", JSON.stringify(pd, null, 2));
  }

  // Also expand the rateType object
  console.log("\n=== Expand rateType 25888 ===");
  const rtRes = await api("GET", "/travelExpense/rate/25888?fields=*,rateCategory(*)");
  console.log("RateType 25888:", JSON.stringify(rtRes.data, null, 2));

  console.log("\n=== Expand rateType 25886 ===");
  const rt2Res = await api("GET", "/travelExpense/rate/25886?fields=*,rateCategory(*)");
  console.log("RateType 25886:", JSON.stringify(rt2Res.data, null, 2));
}

main().catch(e => console.error(e));
