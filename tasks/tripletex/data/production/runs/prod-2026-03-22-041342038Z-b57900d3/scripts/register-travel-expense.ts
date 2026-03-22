const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ZBHKk9kH_jgibdMx0MvVHTRJUxJxeoMf5Gnd9D-u4vw";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(BASE + path, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function post(path: string, body: any) {
  const r = await fetch(BASE + path, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function put(path: string) {
  const r = await fetch(BASE + path, { method: "PUT", headers: H });
  if (!r.ok) throw new Error(`PUT ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function main() {
  // Round 1 — 3 parallel GETs
  const [empRes, catRes, ptRes] = await Promise.all([
    get("/employee?email=ingrid.larsen@example.org&count=10&fields=*"),
    get("/travelExpense/costCategory?count=1000&fields=*"),
    get("/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = empRes.values?.find((e: any) => e.email === "ingrid.larsen@example.org")
    ?? empRes.values?.[0];
  if (!emp) throw new Error("Employee not found");
  console.log("Employee:", emp.id, emp.firstName, emp.lastName);

  // Filter categories and payment types
  const cats = catRes.values.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = cats.find((c: any) => c.description === "Fly");
  const taxiCat = cats.find((c: any) => c.description === "Taxi");
  if (!flyCat || !taxiCat) throw new Error(`Missing categories: Fly=${!!flyCat}, Taxi=${!!taxiCat}`);
  console.log("Fly category:", flyCat.id, "vatType:", flyCat.vatType?.id);
  console.log("Taxi category:", taxiCat.id, "vatType:", taxiCat.vatType?.id);

  const payTypes = ptRes.values.filter((p: any) => p.showOnTravelExpenses);
  const payType = payTypes[0];
  if (!payType) throw new Error("No payment type found");
  console.log("Payment type:", payType.id, payType.description);

  // Round 2 — conditional: check if employee has address
  let departureFrom: string;
  if (emp.address?.city) {
    departureFrom = emp.address.city;
    console.log("Departure from employee city:", departureFrom);
  } else {
    // Need company address
    const compRes = await get(`/company/${emp.companyId}?fields=*,address(*)`);
    departureFrom = compRes.value?.address?.city;
    if (!departureFrom) throw new Error("BLOCKED: no city on employee or company");
    console.log("Departure from company city:", departureFrom);
  }

  // Dates: 2-day trip, pick yesterday and day before
  const today = new Date();
  const returnDate = new Date(today);
  returnDate.setDate(today.getDate() - 1);
  const departureDate = new Date(returnDate);
  departureDate.setDate(returnDate.getDate() - 1);

  const fmtDate = (d: Date) => d.toISOString().split("T")[0];
  const depDateStr = fmtDate(departureDate);
  const retDateStr = fmtDate(returnDate);
  console.log("Dates:", depDateStr, "→", retDateStr);

  // Round 3 — POST create
  const payload = {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: depDateStr,
      returnDate: retDateStr,
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom: departureFrom,
      destination: "Trondheim",
      detailedJourneyDescription: "Kundebesøk Trondheim",
      purpose: "Kundebesøk Trondheim",
    },
    perDiemCompensations: [
      {
        location: "Trondheim",
        count: 2,
        rate: 800,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    ],
    costs: [
      {
        costCategory: { id: flyCat.id },
        paymentType: { id: payType.id },
        comments: "Flybillett",
        amountCurrencyIncVat: 2500,
        amountNOKInclVAT: 2500,
        vatType: { id: flyCat.vatType?.id ?? 12 },
        date: depDateStr,
      },
      {
        costCategory: { id: taxiCat.id },
        paymentType: { id: payType.id },
        comments: "Taxi",
        amountCurrencyIncVat: 600,
        amountNOKInclVAT: 600,
        vatType: { id: taxiCat.vatType?.id ?? 12 },
        date: retDateStr,
      },
    ],
  };

  const createRes = await post("/travelExpense", payload);
  const teId = createRes.value.id;
  console.log("Created travel expense:", teId, "state:", createRes.value.state);

  // Round 4 — deliver
  const deliverRes = await put(`/travelExpense/:deliver?id=${teId}`);
  const delivered = deliverRes.values?.[0] ?? deliverRes.value;
  console.log("Delivered:", delivered?.id, "state:", delivered?.state);

  // Round 5 — approve (CRITICAL)
  const approveRes = await put(`/travelExpense/:approve?id=${teId}`);
  const approved = approveRes.values?.[0] ?? approveRes.value;
  console.log("Approved:", approved?.id, "state:", approved?.state, "isApproved:", approved?.isApproved);

  console.log("\nDONE — travel expense registered, delivered, and approved");
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
