// Test: is destination required at POST or only at deliver?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function post(path: string, body: any) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { method: "POST", headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  console.log(`POST ${r.status}: ${t.substring(0, 400)}`);
  return { ok: r.ok, status: r.status, body: r.ok ? JSON.parse(t) : t };
}

async function put(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { method: "PUT", headers: H });
  const t = await r.text();
  console.log(`PUT ${r.status}: ${t.substring(0, 400)}`);
  return { ok: r.ok, status: r.status, body: r.ok ? JSON.parse(t) : t };
}

async function main() {
  const empId = 18478235;

  // POST without destination, with location
  console.log("=== POST without destination, with location ===");
  const res = await post("travelExpense", {
    employee: { id: empId },
    title: "Test no destination",
    travelDetails: {
      departureDate: "2026-03-18",
      returnDate: "2026-03-21",
      departureFrom: "Oslo",
      purpose: "Test",
      isDayTrip: false,
      isCompensationFromRates: true,
    },
    costs: [
      {
        costCategory: { id: 32813722 },
        paymentType: { id: 32813706 },
        amountCurrencyIncVat: 1000,
        amountNOKInclVAT: 1000,
        vatType: { id: 0 },
        date: "2026-03-18",
        comments: "Flight",
      },
    ],
    perDiemCompensations: [
      {
        count: 3,
        rate: 800,
        amount: 2400,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
        location: "Trondheim",
      },
    ],
  });

  if (res.ok) {
    const teId = res.body.value.id;
    console.log("Created:", teId);
    console.log("\n=== Try deliver without destination ===");
    const delRes = await put(`travelExpense/:deliver?id=${teId}`);
    if (delRes.ok) {
      const d = delRes.body.values?.[0];
      console.log("Delivered:", d?.id, "state:", d?.state);
    }
  }
}

main().catch(e => console.error(e));
