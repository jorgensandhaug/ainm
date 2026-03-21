// Test: does the perDiemCompensation 'address' field matter?
// Try setting it to different values
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

  // Create with address in perDiemCompensation
  const payload = {
    employee: { id: emp.id },
    title: "Test with per-diem address",
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
      detailedJourneyDescription: "Test with per-diem address",
      purpose: "Test with per-diem address",
    },
    perDiemCompensations: [{
      location: "Stavanger",
      address: "Stavanger",  // <-- does this matter?
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

  const createRes = await api("POST", "/travelExpense", payload);
  const te = createRes.data?.value;
  console.log(`Created: id=${te?.id}, state=${te?.state}`);

  // Deliver
  const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${te?.id}`);
  const del = deliverRes.data?.values?.[0];
  console.log(`Delivered: state=${del?.state}`);

  // Read per-diem details
  const pdRes = await api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${te?.id}&count=20&fields=*`);
  for (const pd of (pdRes.data?.values || [])) {
    console.log(`Per-diem: location=${pd.location}, address=${pd.address}, count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}`);
  }

  // Also check: what fields does the parent travelExpense have after delivery?
  const teRes = await api("GET", `/travelExpense/${te?.id}?fields=*`);
  const teData = teRes.data?.value;
  console.log(`\nParent expense details:`);
  console.log(`  title=${teData?.title}`);
  console.log(`  travelDetails.departureFrom=${teData?.travelDetails?.departureFrom}`);
  console.log(`  travelDetails.destination=${teData?.travelDetails?.destination}`);
  console.log(`  travelDetails.departureDate=${teData?.travelDetails?.departureDate}`);
  console.log(`  travelDetails.returnDate=${teData?.travelDetails?.returnDate}`);
  console.log(`  travelDetails.isDayTrip=${teData?.travelDetails?.isDayTrip}`);
  console.log(`  travelDetails.isForeignTravel=${teData?.travelDetails?.isForeignTravel}`);
  console.log(`  travelDetails.isCompensationFromRates=${teData?.travelDetails?.isCompensationFromRates}`);
  console.log(`  travelDetails.purpose=${teData?.travelDetails?.purpose}`);
  console.log(`  travelDetails.detailedJourneyDescription=${teData?.travelDetails?.detailedJourneyDescription}`);
  console.log(`  costs count=${teData?.costs?.length}`);
  console.log(`  perDiemCompensations count=${teData?.perDiemCompensations?.length}`);
  console.log(`  state=${teData?.state}`);
}

main().catch(e => console.error(e));
