/**
 * Task 13: Can we approve directly without delivering first?
 * Also: what changes between delivered and approved states?
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
  const listRes = await api("GET", "/travelExpense?count=1000&fields=id");
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

  const payload = {
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
  };

  // TEST 1: Approve OPEN (no deliver)
  console.log("=== TEST 1: Approve OPEN (no deliver) ===");
  const create1 = await api("POST", "/travelExpense", payload);
  if (create1.ok) {
    const te1 = create1.data.value.id;
    const approveRes = await api("PUT", `/travelExpense/:approve?id=${te1}`);
    console.log(`  Approve OPEN: ok=${approveRes.ok}`);
    if (approveRes.ok) {
      const read = await api("GET", `/travelExpense/${te1}?fields=*`);
      console.log(`  state=${read.data?.value?.state}, isApproved=${read.data?.value?.isApproved}`);
    }
    await api("DELETE", `/travelExpense/${te1}`);
  }

  // TEST 2: Field-by-field comparison: DELIVERED vs APPROVED
  console.log("\n=== TEST 2: DELIVERED vs APPROVED field comparison ===");
  const create2 = await api("POST", "/travelExpense", payload);
  const create3 = await api("POST", "/travelExpense", payload);
  if (create2.ok && create3.ok) {
    const te2 = create2.data.value.id;
    const te3 = create3.data.value.id;

    // Deliver both
    await api("PUT", `/travelExpense/:deliver?id=${te2}`);
    await api("PUT", `/travelExpense/:deliver?id=${te3}`);
    // Approve only te3
    await api("PUT", `/travelExpense/:approve?id=${te3}`);

    // Read both
    const [read2, read3] = await Promise.all([
      api("GET", `/travelExpense/${te2}?fields=*`),
      api("GET", `/travelExpense/${te3}?fields=*`),
    ]);

    const d = read2.data?.value;
    const a = read3.data?.value;

    console.log("\n  Fields that differ:");
    const skipKeys = new Set(['id', 'url', 'version', 'changes']);
    for (const key of Object.keys(a || {})) {
      if (skipKeys.has(key)) continue;
      const dv = JSON.stringify(d?.[key]);
      const av = JSON.stringify(a?.[key]);
      if (dv !== av) {
        console.log(`  ${key}: DELIVERED=${dv} → APPROVED=${av}`);
      }
    }

    // Read per-diem for both
    const [pd2, pd3] = await Promise.all([
      api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${te2}&fields=*`),
      api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${te3}&fields=*`),
    ]);
    const pd2v = pd2.data?.values?.[0];
    const pd3v = pd3.data?.values?.[0];
    console.log("\n  Per-diem differences:");
    for (const key of Object.keys(pd3v || {})) {
      if (skipKeys.has(key)) continue;
      const dv = JSON.stringify(pd2v?.[key]);
      const av = JSON.stringify(pd3v?.[key]);
      if (dv !== av) {
        console.log(`  ${key}: DELIVERED=${dv} → APPROVED=${av}`);
      }
    }

    await api("DELETE", `/travelExpense/${te2}`);
    await api("DELETE", `/travelExpense/${te3}`);
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
