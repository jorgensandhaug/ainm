// Sandbox verification: travel expense flow — check isPaidByEmployee behavior,
// verify rate auto-fill, test if any lookups can be skipped.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(BASE + path, { headers: H });
  if (!r.ok) { const t = await r.text(); console.log(`GET ${path} → ${r.status}: ${t}`); return null; }
  return r.json();
}
async function post(path: string, body: any) {
  const r = await fetch(BASE + path, { method: "POST", headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  console.log(`POST ${path} → ${r.status}`);
  if (!r.ok) { console.log("  Error:", t); return null; }
  return JSON.parse(t);
}
async function put(path: string, body?: any) {
  const opts: any = { method: "PUT", headers: H };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  const t = await r.text();
  console.log(`PUT ${path} → ${r.status}`);
  if (!r.ok) { console.log("  Error:", t); return null; }
  return JSON.parse(t);
}

async function main() {
  // Get employee, categories, payment types
  const [empRes, catRes, ptRes] = await Promise.all([
    get("/employee?count=10&fields=*"),
    get("/travelExpense/costCategory?count=1000&fields=*"),
    get("/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = empRes!.values[0];
  console.log("\nEmployee:", emp.id, emp.firstName, emp.lastName, "city:", emp.address?.city, "companyId:", emp.companyId);

  const cats = catRes!.values.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = cats.find((c: any) => c.description === "Fly");
  const taxiCat = cats.find((c: any) => c.description === "Taxi");
  console.log("Fly:", flyCat?.id, "vatType:", flyCat?.vatType?.id);
  console.log("Taxi:", taxiCat?.id, "vatType:", taxiCat?.vatType?.id);

  const payTypes = ptRes!.values.filter((p: any) => p.showOnTravelExpenses);
  console.log("PayTypes:", payTypes.map((p: any) => `${p.id}:${p.description}`).join(", "));
  const payType = payTypes[0];

  // Get company for departure city
  let departureFrom = emp.address?.city;
  if (!departureFrom) {
    const compRes = await get(`/company/${emp.companyId}?fields=*,address(*)`);
    departureFrom = compRes?.value?.address?.city ?? "Oslo";
    console.log("Company city:", departureFrom);
  }

  // Test 1: Create travel expense with isPaidByEmployee=true on costs
  console.log("\n=== TEST 1: isPaidByEmployee=true on costs ===");
  const payload1 = {
    employee: { id: emp.id },
    title: "Sandbox Test isPaidByEmployee",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: "2026-03-15",
      returnDate: "2026-03-17",
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom,
      destination: "Bergen",
      detailedJourneyDescription: "Test trip",
      purpose: "Test trip",
    },
    perDiemCompensations: [
      {
        location: "Bergen",
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
        date: "2026-03-15",
        isPaidByEmployee: true,
      },
      {
        costCategory: { id: taxiCat!.id },
        paymentType: { id: payType!.id },
        comments: "Taxi",
        amountCurrencyIncVat: 350,
        amountNOKInclVAT: 350,
        vatType: { id: taxiCat!.vatType?.id ?? 0 },
        date: "2026-03-17",
        isPaidByEmployee: true,
      },
    ],
  };

  const res1 = await post("/travelExpense", payload1);
  if (!res1) return;
  const te1 = res1.value;
  console.log("Created:", te1.id);

  // Readback to check isPaidByEmployee
  const rb1 = await get(`/travelExpense/${te1.id}?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*,costCategory(*),vatType(*)),travelDetails(*)`);
  const t1 = rb1!.value;
  console.log("Rate auto-filled:", t1.perDiemCompensations?.[0]?.rate);
  console.log("Amount auto-computed:", t1.perDiemCompensations?.[0]?.amount);
  for (const c of t1.costs ?? []) {
    console.log(`Cost ${c.comments}: isPaidByEmployee=${c.isPaidByEmployee}, amount=${c.amountCurrencyIncVat}`);
  }

  // Test 2: Create WITHOUT isPaidByEmployee (default) for comparison
  console.log("\n=== TEST 2: isPaidByEmployee default (omitted) ===");
  const payload2 = { ...payload1, title: "Sandbox Test default isPaidByEmployee" };
  payload2.costs = payload2.costs.map((c: any) => {
    const { isPaidByEmployee, ...rest } = c;
    return rest;
  });

  const res2 = await post("/travelExpense", payload2);
  if (!res2) return;
  const te2 = res2.value;
  console.log("Created:", te2.id);

  const rb2 = await get(`/travelExpense/${te2.id}?fields=*,costs(*,costCategory(*),vatType(*))`);
  const t2 = rb2!.value;
  for (const c of t2.costs ?? []) {
    console.log(`Cost ${c.comments}: isPaidByEmployee=${c.isPaidByEmployee}`);
  }

  // Deliver and approve test 1 to verify full flow
  console.log("\n=== Deliver+Approve+CreateVouchers TEST 1 ===");
  const del1 = await put(`/travelExpense/:deliver?id=${te1.id}`);
  if (!del1) return;
  console.log("Delivered:", del1.values?.[0]?.state);

  const app1 = await put(`/travelExpense/:approve?id=${te1.id}`);
  if (!app1) return;
  console.log("Approved:", app1.values?.[0]?.state, "isApproved:", app1.values?.[0]?.isApproved);

  const cv1 = await put(`/travelExpense/:createVouchers?id=${te1.id}&date=2026-03-17`);
  if (!cv1) return;
  console.log("CreateVouchers:", cv1.values?.[0]?.isCompleted);

  // Final readback
  const fin1 = await get(`/travelExpense/${te1.id}?fields=*,perDiemCompensations(*),costs(*),voucher(*)`);
  const f1 = fin1!.value;
  console.log("Final: isCompleted:", f1.isCompleted, "amount:", f1.amount, "voucher:", f1.voucher?.id);

  // Compare costs isPaidByEmployee after full lifecycle
  for (const c of f1.costs ?? []) {
    console.log(`Final cost ${c.comments}: isPaidByEmployee=${c.isPaidByEmployee}`);
  }

  // Voucher postings
  if (f1.voucher?.id) {
    const vr = await get(`/ledger/voucher/${f1.voucher.id}?fields=*,postings(*,account(*))`);
    if (vr) {
      console.log("\nVoucher postings (isPaidByEmployee=true):");
      for (const p of vr.value.postings ?? []) {
        console.log(`  ${p.account?.number} ${p.account?.name}: ${p.amount}`);
      }
    }
  }

  // Also complete test 2 for comparison
  console.log("\n=== Deliver+Approve+CreateVouchers TEST 2 ===");
  const del2 = await put(`/travelExpense/:deliver?id=${te2.id}`);
  if (!del2) return;
  const app2 = await put(`/travelExpense/:approve?id=${te2.id}`);
  if (!app2) return;
  const cv2 = await put(`/travelExpense/:createVouchers?id=${te2.id}&date=2026-03-17`);
  if (!cv2) return;

  const fin2 = await get(`/travelExpense/${te2.id}?fields=*,perDiemCompensations(*),costs(*),voucher(*)`);
  const f2 = fin2!.value;
  console.log("Final: isCompleted:", f2.isCompleted, "amount:", f2.amount, "voucher:", f2.voucher?.id);
  for (const c of f2.costs ?? []) {
    console.log(`Final cost ${c.comments}: isPaidByEmployee=${c.isPaidByEmployee}`);
  }

  if (f2.voucher?.id) {
    const vr2 = await get(`/ledger/voucher/${f2.voucher.id}?fields=*,postings(*,account(*))`);
    if (vr2) {
      console.log("\nVoucher postings (isPaidByEmployee=false/default):");
      for (const p of vr2.value.postings ?? []) {
        console.log(`  ${p.account?.number} ${p.account?.name}: ${p.amount}`);
      }
    }
  }

  console.log("\nDONE");
}

main().catch(e => { console.error(e); process.exit(1); });
