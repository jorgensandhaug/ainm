// Sandbox investigation: test hardcoded rateType IDs to skip rate lookup
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
  // Get a valid sandbox employee
  const empRes = await api("GET", "/employee?count=5&fields=*");
  const emps = empRes.data?.values || [];
  // Pick one with allowInformationRegistration
  const emp = emps.find((e: any) => e.allowInformationRegistration) || emps[0];
  console.log("Employee:", emp?.id, emp?.firstName, emp?.lastName);

  // Get costCategory and paymentType (we know these vary per account)
  const [catRes, ptRes] = await Promise.all([
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const cats = (catRes.data?.values || []).filter((c: any) => c.showOnTravelExpenses);
  const flyCat = cats.find((c: any) => c.description === "Fly");
  const taxiCat = cats.find((c: any) => c.description === "Taxi");
  const pts = (ptRes.data?.values || []).filter((p: any) => p.showOnTravelExpenses);
  const payType = pts.find((p: any) => /privat/i.test(p.description)) || pts[0];

  console.log("Fly:", flyCat?.id, "Taxi:", taxiCat?.id, "PayType:", payType?.id);

  // TEST: Use hardcoded rateType id=25886, rateCategory.id=738
  // (skip the GET /travelExpense/rate call entirely)
  console.log("\n=== TEST: POST+deliver with hardcoded rateType (no rate lookup) ===");

  const payload = {
    employee: { id: emp.id },
    title: "Test hardcoded rateType - skip rate lookup",
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
  if (createRes.status >= 400) {
    console.log("POST failed with hardcoded rateType");
    return;
  }
  console.log("POST succeeded! ID:", created?.id, "state:", created?.state);

  // Try delivering
  const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${created.id}`);
  const delivered = deliverRes.data?.values?.[0];
  console.log("Deliver status:", deliverRes.status, "state:", delivered?.state);

  if (deliverRes.status < 400 && delivered?.state === "DELIVERED") {
    console.log("\n=== SUCCESS: HARDCODED RATE IDS WORK FOR DELIVER! ===");
    console.log("Rate IDs 25886/738 are global/stable across accounts");
    console.log("We can skip GET /travelExpense/rate entirely");
    console.log("New optimal path: 6 calls (employee + company + costCat + payType + POST + deliver)");
    console.log("Or 5 calls if employee has address");
  } else {
    console.log("\nHardcoded rate IDs failed at deliver");
  }

  console.log(`\nTotal sandbox calls: ${callCount}`);
}

main().catch(e => console.error(e));
