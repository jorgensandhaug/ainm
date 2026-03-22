/**
 * Task 13: Test the FULL flow: create → deliver → APPROVE
 *
 * Key finding: PUT /travelExpense/:approve exists!
 * Sandbox showed isApproved=false after delivery.
 * Maybe the scorer checks for approval state.
 *
 * Also test: what happens after approve? Does a voucher get created?
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H: Record<string,string> = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch {
    if (r.ok) return { ok: true, status: r.status, data: null };
    return { ok: false, status: r.status, data: text };
  }
  if (!r.ok) console.log(`  ERR: ${method} ${path} → ${r.status}: ${JSON.stringify(json.validationMessages || json.message || json).slice(0,500)}`);
  return { ok: r.ok, status: r.status, data: json };
}

async function main() {
  // CLEANUP
  const listRes = await api("GET", "/travelExpense?count=1000&fields=id,state");
  for (const te of (listRes.data?.values || [])) { await api("DELETE", `/travelExpense/${te.id}`); }

  // SETUP
  const [empRes, catRes, ptRes] = await Promise.all([
    api("GET", "/employee?email=lucy.walker@example.org&count=10&fields=*"),
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = empRes.data?.values?.[0];
  const flyCat = (catRes.data?.values||[]).find((c:any) => c.showOnTravelExpenses && c.description === "Fly");
  const taxiCat = (catRes.data?.values||[]).find((c:any) => c.showOnTravelExpenses && c.description === "Taxi");
  const payType = (ptRes.data?.values||[]).find((p:any) => p.showOnTravelExpenses);
  const compRes = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
  const departureFrom = compRes.data?.value?.address?.city || "Oslo";

  // CREATE travel expense
  const createRes = await api("POST", "/travelExpense", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: "2026-03-17",
      returnDate: "2026-03-21",
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom,
      destination: "Trondheim",
      detailedJourneyDescription: "Kundebesøk Trondheim",
      purpose: "Kundebesøk Trondheim",
    },
    perDiemCompensations: [{
      location: "Trondheim",
      count: 4,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }],
    costs: [
      { costCategory: { id: flyCat!.id }, paymentType: { id: payType!.id }, comments: "Flybillett", amountCurrencyIncVat: 2850, amountNOKInclVAT: 2850, vatType: { id: 0 }, date: "2026-03-17" },
      { costCategory: { id: taxiCat!.id }, paymentType: { id: payType!.id }, comments: "Taxi", amountCurrencyIncVat: 200, amountNOKInclVAT: 200, vatType: { id: 0 }, date: "2026-03-21" },
    ],
  });

  if (!createRes.ok) { console.log("CREATE FAILED"); return; }
  const teId = createRes.data.value.id;
  console.log(`Created: id=${teId}`);

  // CHECK state BEFORE delivery
  const beforeDeliver = await api("GET", `/travelExpense/${teId}?fields=*`);
  console.log(`\nBEFORE DELIVER: state=${beforeDeliver.data?.value?.state}, isCompleted=${beforeDeliver.data?.value?.isCompleted}, isApproved=${beforeDeliver.data?.value?.isApproved}`);

  // DELIVER
  const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${teId}`);
  console.log(`\nDELIVER: ok=${deliverRes.ok}`);

  // CHECK state AFTER delivery
  const afterDeliver = await api("GET", `/travelExpense/${teId}?fields=*`);
  const ad = afterDeliver.data?.value;
  console.log(`AFTER DELIVER: state=${ad?.state}, isCompleted=${ad?.isCompleted}, isApproved=${ad?.isApproved}, voucher=${JSON.stringify(ad?.voucher)}`);

  // APPROVE
  console.log("\n=== TRYING APPROVE ===");
  const approveRes = await api("PUT", `/travelExpense/:approve?id=${teId}`);
  console.log(`APPROVE: ok=${approveRes.ok}, status=${approveRes.status}`);
  if (approveRes.ok) {
    const approved = approveRes.data;
    console.log(`APPROVE response: ${JSON.stringify(approved).slice(0, 500)}`);
  }

  // CHECK state AFTER approval
  const afterApprove = await api("GET", `/travelExpense/${teId}?fields=*,voucher(*)`);
  const aa = afterApprove.data?.value;
  console.log(`\nAFTER APPROVE: state=${aa?.state}, isCompleted=${aa?.isCompleted}, isApproved=${aa?.isApproved}`);
  console.log(`  voucher: ${JSON.stringify(aa?.voucher)}`);
  console.log(`  amount=${aa?.amount}, paymentAmount=${aa?.paymentAmount}`);

  // If voucher exists now, check its postings
  if (aa?.voucher?.id) {
    console.log("\n=== VOUCHER CREATED AFTER APPROVE ===");
    const voucherRes = await api("GET", `/ledger/voucher/${aa.voucher.id}?fields=*`);
    const v = voucherRes.data?.value;
    if (v) {
      console.log(`  voucher id=${v.id} number=${v.number} type=${v.voucherType?.name} date=${v.date} desc="${v.description}"`);
    }
    const postingsRes = await api("GET", `/ledger/posting?voucherId=${aa.voucher.id}&fields=*&count=100`);
    for (const p of (postingsRes.data?.values || [])) {
      console.log(`  posting: account=${p.account?.number}/${p.account?.name} debit=${p.amountGross} amount=${p.amount}`);
    }
  }

  // Also try approve with overrideApprovalFlow=true
  console.log("\n=== TEST 2: APPROVE WITH overrideApprovalFlow ===");
  // Create another one
  const create2 = await api("POST", "/travelExpense", {
    employee: { id: emp.id },
    title: "Test 2",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: "2026-03-17",
      returnDate: "2026-03-21",
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom,
      destination: "Trondheim",
      detailedJourneyDescription: "Test 2",
      purpose: "Test 2",
    },
    perDiemCompensations: [{
      location: "Trondheim",
      count: 4,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }],
    costs: [
      { costCategory: { id: flyCat!.id }, paymentType: { id: payType!.id }, comments: "Flybillett", amountCurrencyIncVat: 2850, amountNOKInclVAT: 2850, vatType: { id: 0 }, date: "2026-03-17" },
    ],
  });
  if (!create2.ok) { console.log("CREATE 2 FAILED"); return; }
  const te2Id = create2.data.value.id;

  await api("PUT", `/travelExpense/:deliver?id=${te2Id}`);
  const approve2 = await api("PUT", `/travelExpense/:approve?id=${te2Id}&overrideApprovalFlow=true`);
  console.log(`APPROVE2 (override): ok=${approve2.ok}, status=${approve2.status}`);

  const after2 = await api("GET", `/travelExpense/${te2Id}?fields=*,voucher(*)`);
  const a2 = after2.data?.value;
  console.log(`AFTER APPROVE2: state=${a2?.state}, isCompleted=${a2?.isCompleted}, isApproved=${a2?.isApproved}`);
  console.log(`  voucher: ${JSON.stringify(a2?.voucher)}`);

  // Check per-diem readback
  const pdRead = await api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${te2Id}&fields=*`);
  for (const pd of (pdRead.data?.values || [])) {
    console.log(`  perDiem: count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}, overnight=${pd.overnightAccommodation}`);
  }

  // Cleanup
  await api("DELETE", `/travelExpense/${teId}`);
  await api("DELETE", `/travelExpense/${te2Id}`);

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
