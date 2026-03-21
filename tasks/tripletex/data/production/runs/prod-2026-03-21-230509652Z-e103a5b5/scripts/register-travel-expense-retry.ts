const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "98RO0lrvZZViJLvG-0sF7VbFz6-RtCBO09JW3xn05sE";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function post(path: string, body: any) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); throw new Error(`POST ${url} ${r.status}: ${t}`); }
  return r.json();
}

async function put(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { method: "PUT", headers: H });
  if (!r.ok) { const t = await r.text(); throw new Error(`PUT ${url} ${r.status}: ${t}`); }
  return r.json();
}

async function main() {
  // Reuse IDs from first run
  const empId = 18687748;
  const flyCatId = 37696773;
  const taxiCatId = 37696788;
  const payTypeId = 37696757;
  const departureFrom = "Oslo";
  const departureDate = "2026-03-18";
  const returnDate = "2026-03-21";

  // Per-diem: 4 days = 3 overnights
  const perDiemCount = 3;
  const perDiemRate = 800;
  const perDiemAmount = perDiemCount * perDiemRate; // 2400

  const payload = {
    employee: { id: empId },
    title: "Kundebesøk Trondheim",
    travelDetails: {
      departureDate,
      returnDate,
      departureFrom,
      purpose: "Kundebesøk Trondheim",
      isDayTrip: false,
      isCompensationFromRates: true,
    },
    costs: [
      {
        costCategory: { id: flyCatId },
        paymentType: { id: payTypeId },
        amountCurrencyIncVat: 6150,
        amountNOKInclVAT: 6150,
        vatType: { id: 0 },
        date: departureDate,
        comments: "Flybillett",
      },
      {
        costCategory: { id: taxiCatId },
        paymentType: { id: payTypeId },
        amountCurrencyIncVat: 750,
        amountNOKInclVAT: 750,
        vatType: { id: 0 },
        date: departureDate,
        comments: "Taxi",
      },
    ],
    perDiemCompensations: [
      {
        count: perDiemCount,
        rate: perDiemRate,
        amount: perDiemAmount,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
        location: "Trondheim",
      },
    ],
  };

  console.log("Creating travel expense...");
  const createRes = await post("travelExpense", payload);
  const te = createRes.value;
  console.log("Created:", te.id, "state:", te.state);

  // Deliver
  console.log("Delivering...");
  const deliverRes = await put(`travelExpense/:deliver?id=${te.id}`);
  const delivered = deliverRes.values?.[0] || deliverRes.value;
  console.log("Delivered:", delivered?.id, "state:", delivered?.state);
  console.log("Title:", delivered?.title);
  console.log("Costs count:", delivered?.costs?.length);
  console.log("PerDiem count:", delivered?.perDiemCompensations?.length);
  console.log("Done.");
}

main().catch(e => { console.error(e); process.exit(1); });
