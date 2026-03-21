const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "98RO0lrvZZViJLvG-0sF7VbFz6-RtCBO09JW3xn05sE";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { headers: H });
  if (!r.ok) { const t = await r.text(); throw new Error(`GET ${url} ${r.status}: ${t}`); }
  return r.json();
}

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
  // Step 1: parallel lookups
  const [empRes, costCatRes, payTypeRes] = await Promise.all([
    get("employee?email=torbjrn.brekke@example.org&count=10&fields=*"),
    get("travelExpense/costCategory?count=1000&fields=*"),
    get("travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = empRes.values?.[0];
  if (!emp) throw new Error("Employee not found");
  console.log("Employee:", emp.id, emp.firstName, emp.lastName);
  console.log("Employee address:", JSON.stringify(emp.address));

  // Determine departureFrom
  let departureFrom: string | null = null;
  if (emp.address?.city) {
    departureFrom = emp.address.city;
  } else if (emp.address?.addressLine1) {
    departureFrom = emp.address.addressLine1;
  }

  // If no address, get company
  if (!departureFrom && emp.companyId) {
    console.log("No employee address, fetching company", emp.companyId);
    const compRes = await get(`company/${emp.companyId}?fields=*,address(*)`);
    const co = compRes.value;
    departureFrom = co?.address?.city || co?.address?.addressLine1 || co?.address?.displayName || co?.address?.addressAsString;
    console.log("Company address:", JSON.stringify(co?.address));
  }

  if (!departureFrom) throw new Error("Cannot determine departureFrom");
  console.log("departureFrom:", departureFrom);

  // Cost categories - filter showOnTravelExpenses
  const cats = (costCatRes.values || []).filter((c: any) => c.showOnTravelExpenses);
  const flyCat = cats.find((c: any) => /^Fly$/i.test(c.description)) || cats.find((c: any) => /fly/i.test(c.description));
  const taxiCat = cats.find((c: any) => /^Taxi$/i.test(c.description)) || cats.find((c: any) => /taxi/i.test(c.description));
  if (!flyCat) throw new Error("No Fly cost category found");
  if (!taxiCat) throw new Error("No Taxi cost category found");
  console.log("Fly cat:", flyCat.id, flyCat.description);
  console.log("Taxi cat:", taxiCat.id, taxiCat.description);

  // Payment type
  const payTypes = (payTypeRes.values || []).filter((p: any) => p.showOnTravelExpenses);
  const payType = payTypes[0];
  if (!payType) throw new Error("No travel payment type found");
  console.log("Payment type:", payType.id, payType.description);

  // Dates: 4-day trip, pick deterministic range
  const departureDate = "2026-03-18";
  const returnDate = "2026-03-21";

  // Per-diem: 4 days = 3 overnights, rate 800, amount 2400
  const perDiemCount = 3; // days - 1
  const perDiemRate = 800;
  const perDiemAmount = perDiemCount * perDiemRate; // 2400

  const payload = {
    employee: { id: emp.id },
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
        costCategory: { id: flyCat.id },
        paymentType: { id: payType.id },
        amountCurrencyIncVat: 6150,
        amountNOKInclVAT: 6150,
        vatType: { id: 0 },
        date: departureDate,
        comments: "Flybillett",
      },
      {
        costCategory: { id: taxiCat.id },
        paymentType: { id: payType.id },
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
        isDayTrip: false,
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
