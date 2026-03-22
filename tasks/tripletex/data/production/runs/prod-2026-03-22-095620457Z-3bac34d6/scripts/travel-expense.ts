const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "IuxrkjMI_kSOBBgqx9ue6ygm--AhNu-P4EL6CJ0SMo0";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(BASE + path, { headers: H });
  if (!r.ok) { const t = await r.text(); throw new Error(`GET ${path} → ${r.status}: ${t}`); }
  return r.json();
}
async function post(path: string, body: any) {
  const r = await fetch(BASE + path, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); throw new Error(`POST ${path} → ${r.status}: ${t}`); }
  return r.json();
}
async function put(path: string, body?: any) {
  const opts: any = { method: "PUT", headers: H };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  if (!r.ok) { const t = await r.text(); throw new Error(`PUT ${path} → ${r.status}: ${t}`); }
  return r.json();
}

async function main() {
  // Round 1 — parallel lookups (3 calls)
  const [empRes, catRes, ptRes] = await Promise.all([
    get("/employee?email=lars.johansen@example.org&count=10&fields=*"),
    get("/travelExpense/costCategory?count=1000&fields=*"),
    get("/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = empRes.values.find((e: any) => e.email === "lars.johansen@example.org")
    ?? empRes.values[0];
  console.log("Employee:", emp.id, emp.firstName, emp.lastName, emp.email, "city:", emp.address?.city);

  const cats = catRes.values.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = cats.find((c: any) => c.description === "Fly");
  const taxiCat = cats.find((c: any) => c.description === "Taxi");
  console.log("Fly:", flyCat?.id, "vatType:", flyCat?.vatType?.id);
  console.log("Taxi:", taxiCat?.id, "vatType:", taxiCat?.vatType?.id);

  const payTypes = ptRes.values.filter((p: any) => p.showOnTravelExpenses);
  const payType = payTypes[0];
  console.log("PayType:", payType?.id, payType?.description);

  // Round 2 — conditional: get company address if employee has no address
  let departureFrom = emp.address?.city;
  if (!departureFrom) {
    console.log("Employee has no city, fetching company address...");
    const compRes = await get(`/company/${emp.companyId}?fields=*,address(*)`);
    departureFrom = compRes.value?.address?.city;
    console.log("Company city:", departureFrom);
    if (!departureFrom) { console.error("BLOCKED: no city found"); process.exit(1); }
  }

  // Dates: 3-day trip, no specific dates → pick recent past
  const departureDate = "2026-03-18";
  const returnDate = "2026-03-20";

  // Round 3 — create travel expense (1 call)
  const payload = {
    employee: { id: emp.id },
    title: "Kundebesøk Stavanger",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate,
      returnDate,
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom,
      destination: "Stavanger",
      detailedJourneyDescription: "Kundebesøk Stavanger",
      purpose: "Kundebesøk Stavanger",
    },
    perDiemCompensations: [
      {
        location: "Stavanger",
        count: 3,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    ],
    costs: [
      {
        costCategory: { id: flyCat!.id },
        paymentType: { id: payType!.id },
        comments: "Flybillett",
        amountCurrencyIncVat: 3900,
        amountNOKInclVAT: 3900,
        vatType: { id: flyCat!.vatType?.id ?? 0 },
        date: departureDate,
      },
      {
        costCategory: { id: taxiCat!.id },
        paymentType: { id: payType!.id },
        comments: "Taxi",
        amountCurrencyIncVat: 350,
        amountNOKInclVAT: 350,
        vatType: { id: taxiCat!.vatType?.id ?? 0 },
        date: returnDate,
      },
    ],
  };

  const createRes = await post("/travelExpense", payload);
  const teId = createRes.value.id;
  console.log("Created travel expense:", teId);

  // Round 4 — readback verification (1 call)
  const readback = await get(`/travelExpense/${teId}?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*,costCategory(*),vatType(*)),travelDetails(*)`);
  const te = readback.value;
  console.log("=== READBACK ===");
  console.log("Title:", te.title, "State:", te.state, "Amount:", te.amount, "PaymentAmount:", te.paymentAmount);
  const td = te.travelDetails;
  console.log("TravelDetails:", td.departureDate, td.returnDate, td.departureTime, td.returnTime, td.departureFrom, td.destination, "foreign:", td.isForeignTravel, "dayTrip:", td.isDayTrip, "purpose:", td.purpose);
  if (te.perDiemCompensations?.length) {
    const pd = te.perDiemCompensations[0];
    console.log("PerDiem:", "count:", pd.count, "rate:", pd.rate, "amount:", pd.amount, "location:", pd.location, "overnight:", pd.overnightAccommodation, "rateType:", pd.rateType?.id, "rateCat:", pd.rateType?.rateCategory?.id, pd.rateType?.rateCategory?.name);
    console.log("  deductions: breakfast:", pd.isDeductionForBreakfast, "lunch:", pd.isDeductionForLunch, "dinner:", pd.isDeductionForDinner);
  }
  for (const c of te.costs ?? []) {
    console.log("Cost:", c.costCategory?.description, "amount:", c.amountCurrencyIncVat, "NOK:", c.amountNOKInclVAT, "vat:", c.vatType?.id, c.vatType?.percentage, "comments:", c.comments, "date:", c.date, "paidByEmp:", c.isPaidByEmployee);
  }

  // Round 5 — deliver (1 call)
  const deliverRes = await put(`/travelExpense/:deliver?id=${teId}`);
  const delivered = deliverRes.values?.[0] ?? deliverRes.value;
  console.log("Delivered:", delivered.state);

  // Round 6 — approve (1 call)
  const approveRes = await put(`/travelExpense/:approve?id=${teId}`);
  const approved = approveRes.values?.[0] ?? approveRes.value;
  console.log("Approved:", approved.state, "isApproved:", approved.isApproved);

  // Round 7 — createVouchers (1 call)
  const cvRes = await put(`/travelExpense/:createVouchers?id=${teId}&date=${returnDate}`);
  const completed = cvRes.values?.[0] ?? cvRes.value;
  console.log("CreateVouchers done, isCompleted:", completed?.isCompleted);

  // Round 8 — final readback (1 call)
  const finalRes = await get(`/travelExpense/${teId}?fields=*,perDiemCompensations(*),costs(*),voucher(*)`);
  const fin = finalRes.value;
  console.log("=== FINAL ===");
  console.log("isCompleted:", fin.isCompleted, "state:", fin.state, "amount:", fin.amount, "voucher:", fin.voucher?.id);

  // Round 9 — voucher postings (1 call)
  if (fin.voucher?.id) {
    const vRes = await get(`/ledger/voucher/${fin.voucher.id}?fields=*,postings(*,account(*))`);
    const v = vRes.value;
    console.log("Voucher", v.id, "postings:");
    for (const p of v.postings ?? []) {
      console.log(" ", p.account?.number, p.account?.name, "amount:", p.amount, "amountGross:", p.amountGross);
    }
  }

  console.log("DONE");
}

main().catch(e => { console.error(e); process.exit(1); });
