// Test: diett as cost line with "Mat" category (id=32813730)
// Check what account the Mat category posts to
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
  if (!r.ok) { console.log(`${method} ${path} → ${r.status}`); console.log(JSON.stringify(json, null, 2)); return null; }
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

async function run() {
  const employees = await api("GET", "/employee?count=5&fields=*");
  const emp = employees.find((e: any) => e.allowInformationRegistration) || employees[0];
  const [categories, payTypes] = await Promise.all([
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);
  const flyCat = categories.find((c: any) => c.description === "Fly" && c.showOnTravelExpenses);
  const taxiCat = categories.find((c: any) => c.description === "Taxi" && c.showOnTravelExpenses);
  const matCat = categories.find((c: any) => c.description === "Mat" && c.showOnTravelExpenses);
  const payType = payTypes.find((p: any) => p.showOnTravelExpenses);
  const company = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
  const departureFrom = company?.address?.city || "Oslo";

  // Resolve Mat category account number
  console.log("=== MAT CATEGORY DETAILS ===");
  console.log(JSON.stringify(matCat, null, 2));
  const matAcct = await api("GET", `/ledger/account/${matCat.account.id}?fields=*`);
  console.log(`Mat account: number=${matAcct?.number} name="${matAcct?.name}"`);

  // Also resolve the other accounts for reference
  const flyAcct = await api("GET", `/ledger/account/${flyCat.account.id}?fields=*`);
  console.log(`Fly/Taxi account: number=${flyAcct?.number} name="${flyAcct?.name}"`);

  // TEST F: "Mat" category for diett, isCompensationFromRates=false
  console.log("\n" + "=".repeat(60));
  console.log("TEST F: Mat category for diett (800×4=3200), isCompFromRates=false");
  console.log("=".repeat(60));

  const te = await api("POST", "/travelExpense", {
    employee: { id: emp.id },
    title: "TestF - Mat diett",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: false,
      departureDate: "2026-04-15",
      returnDate: "2026-04-18",
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
        comments: "flybillett",
        amountCurrencyIncVat: 3600,
        amountNOKInclVAT: 3600,
        vatType: { id: flyCat.vatType?.id || 0 },
        date: "2026-04-15",
      },
      {
        costCategory: { id: taxiCat.id },
        paymentType: { id: payType.id },
        comments: "taxi",
        amountCurrencyIncVat: 250,
        amountNOKInclVAT: 250,
        vatType: { id: taxiCat.vatType?.id || 0 },
        date: "2026-04-18",
      },
      {
        costCategory: { id: matCat.id },
        paymentType: { id: payType.id },
        comments: "Diett 4 dagar x 800 kr",
        amountCurrencyIncVat: 3200,
        amountNOKInclVAT: 3200,
        vatType: { id: matCat.vatType?.id || 0 },
        date: "2026-04-18",
      },
    ],
  });

  if (!te) return;
  console.log(`Created: id=${te.id} amount=${te.amount}`);

  // Full readback
  const rb = await api("GET", `/travelExpense/${te.id}?fields=*,perDiemCompensations(*),costs(*,costCategory(*),vatType(*),paymentType(*)),travelDetails(*)`);
  if (rb) {
    console.log(`Readback: amount=${rb.amount}`);
    for (const c of rb.costs || []) {
      console.log(`  cost: cat="${c.costCategory?.description}" amount=${c.amountCurrencyIncVat} vat=${c.vatType?.id}/${c.vatType?.percentage}% comments="${c.comments}" date=${c.date}`);
    }
  }

  // Deliver, approve, createVouchers
  const d = await api("PUT", `/travelExpense/:deliver?id=${te.id}`);
  if (!d) { console.log("DELIVER FAILED"); return; }
  const a = await api("PUT", `/travelExpense/:approve?id=${te.id}`);
  if (!a) { console.log("APPROVE FAILED"); return; }
  const v = await api("PUT", `/travelExpense/:createVouchers?id=${te.id}&date=2026-04-18`);
  if (!v) { console.log("CREATE VOUCHERS FAILED"); return; }

  // Final readback with voucher postings
  const final = await api("GET", `/travelExpense/${te.id}?fields=*,perDiemCompensations(*),costs(*),voucher(*)`);
  console.log(`Final: isCompleted=${final?.isCompleted} amount=${final?.amount} voucherId=${final?.voucher?.id}`);

  if (final?.voucher?.id) {
    const voucher = await api("GET", `/ledger/voucher/${final.voucher.id}?fields=*,postings(*,account(*))`);
    if (voucher) {
      console.log("Voucher postings:");
      for (const p of voucher.postings) {
        console.log(`  ${p.account.number} ${p.account.name}: amount=${p.amount} amountGross=${p.amountGross}`);
      }
    }
  }

  // TEST G: Same but isCompensationFromRates=true WITH perDiem AND Mat cost line
  // (hybrid: both perDiem compensation AND cost-based diett)
  console.log("\n" + "=".repeat(60));
  console.log("TEST G: HYBRID - perDiem (auto rate) + Mat cost (800×4=3200)");
  console.log("=".repeat(60));

  const te2 = await api("POST", "/travelExpense", {
    employee: { id: emp.id },
    title: "TestG - hybrid perDiem+cost",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: "2026-04-20",
      returnDate: "2026-04-23",
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
        comments: "flybillett",
        amountCurrencyIncVat: 3600,
        amountNOKInclVAT: 3600,
        vatType: { id: flyCat.vatType?.id || 0 },
        date: "2026-04-20",
      },
      {
        costCategory: { id: taxiCat.id },
        paymentType: { id: payType.id },
        comments: "taxi",
        amountCurrencyIncVat: 250,
        amountNOKInclVAT: 250,
        vatType: { id: taxiCat.vatType?.id || 0 },
        date: "2026-04-23",
      },
    ],
    perDiemCompensations: [{
      location: "Oslo",
      count: 3,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }],
  });

  if (!te2) return;
  console.log(`Created: id=${te2.id} amount=${te2.amount}`);

  const rb2 = await api("GET", `/travelExpense/${te2.id}?fields=*,perDiemCompensations(*,rateType(*)),costs(*,costCategory(*)),travelDetails(*)`);
  if (rb2) {
    console.log(`Readback: amount=${rb2.amount}`);
    if (rb2.perDiemCompensations?.length) {
      for (const pd of rb2.perDiemCompensations) {
        console.log(`  perDiem: count=${pd.count} rate=${pd.rate} amount=${pd.amount}`);
      }
    }
    for (const c of rb2.costs || []) {
      console.log(`  cost: cat="${c.costCategory?.description}" amount=${c.amountCurrencyIncVat}`);
    }
  }

  // Also check: what is the "Annet" (Other) category situation?
  console.log("\n=== CATEGORIES WITH 'ANNET' OR 'OTHER' ===");
  for (const c of categories) {
    if (c.description?.toLowerCase().includes("annet") || c.description?.toLowerCase().includes("other")) {
      console.log(`  id=${c.id} desc="${c.description}" showOnTravel=${c.showOnTravelExpenses}`);
    }
  }

  // And look at the "Diett" account in chart of accounts
  console.log("\n=== DIETT/KOST ACCOUNTS ===");
  const diettAccounts = await api("GET", "/ledger/account?number=7150&fields=*");
  if (diettAccounts?.length) {
    for (const a of diettAccounts) {
      console.log(`  number=${a.number} name="${a.name}" id=${a.id}`);
    }
  }
  const kost5510 = await api("GET", "/ledger/account?number=5510&fields=*");
  if (kost5510?.length) {
    for (const a of kost5510) {
      console.log(`  number=${a.number} name="${a.name}" id=${a.id}`);
    }
  }

  console.log("\nDONE");
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
