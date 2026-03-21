// Verify: hardcoded rateType 25888 (overnight) works for multi-day trip
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
  // Step 1: Get employee
  const empRes = await api("GET", "/employee?count=5&fields=*");
  const emp = empRes.data?.values?.find((e: any) => e.allowInformationRegistration) || empRes.data?.values?.[0];
  console.log("Employee:", emp?.id);

  // Step 2: Parallel - costCategory + paymentType + company
  const [catRes, ptRes, compRes] = await Promise.all([
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
    api("GET", `/company/${emp.companyId}?fields=*,address(*)`),
  ]);

  const cats = (catRes.data?.values || []).filter((c: any) => c.showOnTravelExpenses);
  const flyCat = cats.find((c: any) => c.description === "Fly");
  const taxiCat = cats.find((c: any) => c.description === "Taxi");
  const pts = (ptRes.data?.values || []).filter((p: any) => p.showOnTravelExpenses);
  const payType = pts.find((p: any) => /privat/i.test(p.description)) || pts[0];
  const comp = compRes.data?.value || compRes.data;
  const departureFrom = comp?.address?.city || "Oslo";

  // Step 3: POST with rateType 25888 (overnight, rate=1012)
  const payload = {
    employee: { id: emp.id },
    title: "Test overnight rateType 25888",
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
      detailedJourneyDescription: "Test overnight rateType 25888",
      purpose: "Test overnight rateType 25888",
    },
    perDiemCompensations: [
      {
        location: "Stavanger",
        count: 3,
        rate: 800,
        amount: 2400,
        rateType: { id: 25888, rateCategory: { id: 740 } },
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

  // Step 4: Deliver
  const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${created.id}`);
  const delivered = deliverRes.data?.values?.[0];
  console.log("Deliver:", deliverRes.status, "state:", delivered?.state);
  console.log("Costs:", delivered?.costs?.length, "PerDiem:", delivered?.perDiemCompensations?.length);

  // Also read back the per-diem to verify rateType was stored correctly
  const pdRes = await api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${created.id}&count=20&fields=*`);
  const pds = pdRes.data?.values || [];
  for (const pd of pds) {
    console.log("\nPerDiem detail:");
    console.log("  location:", pd.location);
    console.log("  count:", pd.count);
    console.log("  rate:", pd.rate);
    console.log("  amount:", pd.amount);
    console.log("  rateType:", JSON.stringify(pd.rateType));
    console.log("  rateCategory:", JSON.stringify(pd.rateCategory));
    console.log("  overnightAccommodation:", pd.overnightAccommodation);
  }

  console.log(`\nTotal: ${callCount} calls (investigation, not optimal)`);
}

main().catch(e => console.error(e));
