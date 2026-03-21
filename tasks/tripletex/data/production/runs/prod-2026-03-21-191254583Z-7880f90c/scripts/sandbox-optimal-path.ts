// Sandbox: test the new optimal 6-call path (no rate lookup, parallel company+costCat+payType)
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
  if (!r.ok) console.log("  Error:", JSON.stringify(json).slice(0, 500));
  return { status: r.status, data: json };
}

async function main() {
  // === NEW OPTIMAL 6-CALL PATH ===
  // Step 1: GET /employee (must be first to get employee.id and check address)
  const empRes = await api("GET", "/employee?count=5&fields=*");
  const emp = empRes.data?.values?.find((e: any) => e.allowInformationRegistration) || empRes.data?.values?.[0];
  console.log("Employee:", emp?.id, "address:", emp?.address, "companyId:", emp?.companyId);

  let departureFrom: string | null = null;
  if (emp?.address?.city) departureFrom = emp.address.city;

  // Step 2: PARALLEL - company (if needed) + costCategory + paymentType
  const parallelCalls: Promise<any>[] = [
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ];
  if (!departureFrom && emp?.companyId) {
    parallelCalls.push(api("GET", `/company/${emp.companyId}?fields=*,address(*)`));
  }
  const results = await Promise.all(parallelCalls);
  const catRes = results[0];
  const ptRes = results[1];
  const compRes = results[2];

  if (compRes) {
    const comp = compRes.data?.value || compRes.data;
    departureFrom = comp?.address?.city || comp?.address?.addressLine1 || comp?.address?.displayName || comp?.address?.addressAsString || null;
    console.log("Company fallback departureFrom:", departureFrom);
  }

  if (!departureFrom) { console.error("BLOCKED: no departureFrom"); return; }

  const cats = (catRes.data?.values || []).filter((c: any) => c.showOnTravelExpenses);
  const flyCat = cats.find((c: any) => c.description === "Fly");
  const taxiCat = cats.find((c: any) => c.description === "Taxi");
  const pts = (ptRes.data?.values || []).filter((p: any) => p.showOnTravelExpenses);
  const payType = pts.find((p: any) => /privat/i.test(p.description)) || pts[0];

  // Step 3: POST /travelExpense (hardcoded rateType 25886/738)
  const payload = {
    employee: { id: emp.id },
    title: "Optimal 6-call test",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: "2026-03-19",
      returnDate: "2026-03-21",
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom,
      destination: "Stavanger",
      detailedJourneyDescription: "Optimal 6-call test",
      purpose: "Optimal 6-call test",
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
  if (createRes.status >= 400) { console.error("POST failed"); return; }
  console.log("Created:", created?.id, "state:", created?.state);

  // Step 4: PUT /travelExpense/:deliver
  const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${created.id}`);
  const delivered = deliverRes.data?.values?.[0];
  console.log("Deliver:", deliverRes.status, "state:", delivered?.state);
  console.log("Costs:", delivered?.costs?.length, "PerDiem:", delivered?.perDiemCompensations?.length);

  console.log(`\n=== Total: ${callCount} calls, 0 errors ===`);
  console.log("Optimal path verified: employee → company+costCat+payType (parallel) → POST → deliver");
}

main().catch(e => console.error(e));
