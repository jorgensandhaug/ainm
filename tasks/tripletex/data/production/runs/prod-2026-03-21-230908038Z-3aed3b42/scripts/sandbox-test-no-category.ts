// Test: does costs[].category field cause issues or is it ignored?
// Also test: is costs[].currency safe to omit (NOK default)?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function main() {
  // Use known sandbox employee
  const empRes = await get("/employee/18478235?fields=*");
  const emp = empRes.value;
  const compRes = await get(`/company/${emp.companyId}?fields=*,address(*)`);
  const departureFrom = compRes.value?.address?.city;
  const costCatRes = await get("/travelExpense/costCategory?count=1000&fields=*");
  const payTypeRes = await get("/travelExpense/paymentType?count=1000&fields=*");

  const cats = costCatRes.values?.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = cats?.find((c: any) => c.description === "Fly");
  const taxiCat = cats?.find((c: any) => c.description === "Taxi");
  const payType = payTypeRes.values?.find((p: any) => p.showOnTravelExpenses && p.description === "Privat utlegg");

  // Test with NO category field on costs (just costCategory + comments)
  const payload = {
    employee: { id: emp.id },
    title: "Test No Category Field",
    travelDetails: {
      departureDate: "2026-03-18",
      returnDate: "2026-03-21",
      departureFrom,
      destination: "Ålesund",
      purpose: "Test",
      detailedJourneyDescription: "Test",
      isDayTrip: false,
      isCompensationFromRates: true,
    },
    costs: [
      {
        costCategory: { id: flyCat!.id },
        paymentType: { id: payType!.id },
        comments: "Flybillett",
        amountCurrencyIncVat: 6750,
        amountNOKInclVAT: 6750,
        vatType: { id: 0 },
        date: "2026-03-18",
        // NO category field, NO currency field
      },
      {
        costCategory: { id: taxiCat!.id },
        paymentType: { id: payType!.id },
        comments: "Taxi",
        amountCurrencyIncVat: 500,
        amountNOKInclVAT: 500,
        vatType: { id: 0 },
        date: "2026-03-18",
        // NO category field, NO currency field
      },
    ],
    perDiemCompensations: [
      {
        location: "Ålesund",
        count: 3,
        rate: 800,
        amount: 2400,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    ],
  };

  const postRes = await fetch(`${BASE}/travelExpense`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(payload),
  });

  if (!postRes.ok) {
    console.error("POST failed:", postRes.status, await postRes.text());
    return;
  }

  const created = await postRes.json();
  const id = created.value?.id;
  console.log("Created:", id, "state:", created.value?.state);

  const deliverRes = await fetch(`${BASE}/travelExpense/:deliver?id=${id}`, {
    method: "PUT",
    headers: H,
  });

  if (!deliverRes.ok) {
    console.error("Deliver failed:", deliverRes.status, await deliverRes.text());
    return;
  }

  const delivered = await deliverRes.json();
  console.log("State:", delivered.values?.[0]?.state);
  console.log("Costs:", delivered.values?.[0]?.costs?.length);
  console.log("PerDiem:", delivered.values?.[0]?.perDiemCompensations?.length);
  console.log("SUCCESS: no category field, no currency field — still delivered");
}

main().catch((e) => { console.error(e); process.exit(1); });
