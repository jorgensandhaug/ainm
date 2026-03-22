// Sandbox verification: replicate the exact production run shape (4 days, count=3, Fly 3600, Taxi 250)
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(json, null, 2)); throw new Error(`${r.status}`); }
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

async function run() {
  // Use a known sandbox employee
  const employees = await api("GET", "/employee?count=5&fields=*");
  const emp = employees.find((e: any) => e.allowInformationRegistration) || employees[0];
  console.log("Employee:", emp.id, emp.firstName, emp.lastName, "address:", emp.address?.city || "null");

  const [categories, payTypes] = await Promise.all([
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const travelCats = categories.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = travelCats.find((c: any) => c.description === "Fly");
  const taxiCat = travelCats.find((c: any) => c.description === "Taxi");
  const payType = payTypes.find((p: any) => p.showOnTravelExpenses);
  console.log("Fly:", flyCat?.id, "vatType:", flyCat?.vatType?.id);
  console.log("Taxi:", taxiCat?.id, "vatType:", taxiCat?.vatType?.id);
  console.log("PayType:", payType?.id);

  // Get departureFrom
  let departureFrom = emp.address?.city;
  if (!departureFrom) {
    const company = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
    departureFrom = company.address?.city || "Oslo";
    console.log("Company city:", departureFrom);
  }

  // 4-day trip, count=3 (overnights)
  const departureDate = "2026-04-01";
  const returnDate = "2026-04-04";

  const te = await api("POST", "/travelExpense", {
    employee: { id: emp.id },
    title: "Kundebesøk Oslo - sandbox verify",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate,
      returnDate,
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom,
      destination: "Oslo",
      detailedJourneyDescription: "Kundebesøk Oslo",
      purpose: "Kundebesøk Oslo",
    },
    costs: [
      {
        costCategory: { id: flyCat.id },
        paymentType: { id: payType.id },
        comments: "Flybillett",
        amountCurrencyIncVat: 3600,
        amountNOKInclVAT: 3600,
        vatType: { id: flyCat.vatType?.id || 0 },
        date: departureDate,
      },
      {
        costCategory: { id: taxiCat.id },
        paymentType: { id: payType.id },
        comments: "Taxi",
        amountCurrencyIncVat: 250,
        amountNOKInclVAT: 250,
        vatType: { id: taxiCat.vatType?.id || 0 },
        date: returnDate,
      },
    ],
    perDiemCompensations: [
      {
        location: "Oslo",
        count: 3, // overnights = 4 days - 1
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    ],
  });

  console.log("\n=== POST response ===");
  console.log("ID:", te.id, "amount:", te.amount, "perDiem count:", te.perDiemCompensations?.length);

  // Readback
  const readback = await api("GET", `/travelExpense/${te.id}?fields=*,perDiemCompensations(*,rateType(*)),costs(*,costCategory(*),vatType(*)),travelDetails(*)`);
  console.log("\n=== Readback ===");
  console.log("amount:", readback.amount, "state:", readback.state);
  console.log("perDiem:", JSON.stringify(readback.perDiemCompensations?.map((p: any) => ({
    count: p.count, rate: p.rate, amount: p.amount, rateType: p.rateType?.id
  }))));
  console.log("costs:", JSON.stringify(readback.costs?.map((c: any) => ({
    cat: c.costCategory?.description, amt: c.amountCurrencyIncVat, vat: c.vatType?.id
  }))));

  // Deliver
  await api("PUT", `/travelExpense/:deliver?id=${te.id}`);
  console.log("Delivered");

  // Approve
  await api("PUT", `/travelExpense/:approve?id=${te.id}`);
  console.log("Approved");

  // Create vouchers
  await api("PUT", `/travelExpense/:createVouchers?id=${te.id}&date=${returnDate}`);
  console.log("Vouchers created");

  // Final readback
  const final = await api("GET", `/travelExpense/${te.id}?fields=*,perDiemCompensations(*),costs(*),voucher(*)`);
  console.log("\n=== Final ===");
  console.log("isCompleted:", final.isCompleted, "state:", final.state, "amount:", final.amount);
  console.log("voucherId:", final.voucher?.id);
  console.log("perDiem count:", final.perDiemCompensations?.[0]?.count, "rate:", final.perDiemCompensations?.[0]?.rate, "amount:", final.perDiemCompensations?.[0]?.amount);

  // Voucher postings
  if (final.voucher?.id) {
    const voucher = await api("GET", `/ledger/voucher/${final.voucher.id}?fields=*,postings(*,account(*))`);
    console.log("\n=== Voucher Postings ===");
    for (const p of voucher.postings) {
      console.log(`  ${p.account.number} ${p.account.name}: amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id}`);
    }
  }

  console.log("\nSANDBOX VERIFY DONE");
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
