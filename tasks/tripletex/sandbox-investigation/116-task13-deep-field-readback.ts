/**
 * Task 13: Deep field readback — discover ALL stored fields.
 *
 * Create a travel expense with the exact production payload (new approach),
 * then read back EVERY single field to find what might differ from expectations.
 * Also explore parent-level per-diem summary fields.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H: Record<string, string> = {
  "Content-Type": "application/json",
  Authorization: AUTH,
};

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch {
    if (r.ok) return { ok: true, status: r.status, data: null };
    return { ok: false, status: r.status, data: null };
  }
  if (!r.ok) {
    console.log(`  ERR: ${method} ${path} → ${r.status}: ${JSON.stringify(json.validationMessages || json.message || json).slice(0, 400)}`);
  }
  return { ok: r.ok, status: r.status, data: json };
}

async function main() {
  // CLEANUP
  const listRes = await api("GET", "/travelExpense?count=1000&fields=id");
  for (const te of (listRes.data?.values || [])) {
    await api("DELETE", `/travelExpense/${te.id}`);
  }

  // SETUP
  const [empRes, catRes, ptRes] = await Promise.all([
    api("GET", "/employee?email=lucy.walker@example.org&count=10&fields=*"),
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = (empRes.data?.values || []).find((e: any) => e.email === "lucy.walker@example.org") || empRes.data?.values?.[0];
  const travelCats = (catRes.data?.values || []).filter((c: any) => c.showOnTravelExpenses);
  const flyCat = travelCats.find((c: any) => c.description === "Fly");
  const taxiCat = travelCats.find((c: any) => c.description === "Taxi");
  const payType = (ptRes.data?.values || []).filter((p: any) => p.showOnTravelExpenses)[0];

  // Company fallback
  const compRes = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
  const departureFrom = compRes.data?.value?.address?.city || "Oslo";

  console.log("=== CREATE WITH NEW APPROACH ===");
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
    perDiemCompensations: [
      {
        location: "Trondheim",
        count: 4,
        // NO rate, NO amount — system fills
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    ],
    costs: [
      {
        costCategory: { id: flyCat!.id },
        paymentType: { id: payType!.id },
        comments: "Flybillett",
        amountCurrencyIncVat: 2850,
        amountNOKInclVAT: 2850,
        vatType: { id: 0 }, // sandbox
        date: "2026-03-17",
      },
      {
        costCategory: { id: taxiCat!.id },
        paymentType: { id: payType!.id },
        comments: "Taxi",
        amountCurrencyIncVat: 200,
        amountNOKInclVAT: 200,
        vatType: { id: 0 },
        date: "2026-03-21",
      },
    ],
  };

  const createRes = await api("POST", "/travelExpense", payload);
  if (!createRes.ok) { console.log("CREATE FAILED"); return; }
  const te = createRes.data.value;
  console.log(`Created: id=${te.id}`);

  // DELIVER
  const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${te.id}`);
  if (!deliverRes.ok) { console.log("DELIVER FAILED"); return; }
  const del = deliverRes.data.values?.[0] || deliverRes.data.value;
  console.log(`Delivered: state=${del.state}`);

  // FULL READBACK — parent with all expansions
  console.log("\n=== PARENT (all fields) ===");
  const parentRes = await api("GET", `/travelExpense/${te.id}?fields=*`);
  const p = parentRes.data?.value;
  if (p) {
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === "object" && v !== null) {
        console.log(`  ${k}: ${JSON.stringify(v)}`);
      } else {
        console.log(`  ${k}: ${v}`);
      }
    }
  }

  // FULL READBACK — per-diem compensations
  console.log("\n=== PER-DIEM COMPENSATIONS (all fields) ===");
  const pdRes = await api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${te.id}&fields=*`);
  for (const pd of (pdRes.data?.values || [])) {
    console.log("  --- Per-diem row ---");
    for (const [k, v] of Object.entries(pd)) {
      console.log(`    ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
    }
  }

  // FULL READBACK — costs
  console.log("\n=== COSTS (all fields) ===");
  const costRes = await api("GET", `/travelExpense/cost?travelExpenseId=${te.id}&fields=*`);
  for (const c of (costRes.data?.values || [])) {
    console.log(`  --- Cost: "${c.comments}" ---`);
    for (const [k, v] of Object.entries(c)) {
      console.log(`    ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
    }
  }

  // Check if there are per-diem SUMMARY fields on the parent
  console.log("\n=== PARENT PER-DIEM AMOUNT FIELDS ===");
  const parentAmt = await api("GET", `/travelExpense/${te.id}?fields=*,perDiemCompensations(*),costs(*)`);
  const pFull = parentAmt.data?.value;
  if (pFull) {
    console.log(`  amount: ${pFull.amount}`);
    console.log(`  paymentAmount: ${pFull.paymentAmount}`);
    console.log(`  perDiemCompensations: ${JSON.stringify(pFull.perDiemCompensations)}`);
    console.log(`  costs: ${JSON.stringify(pFull.costs)}`);
    // Look for any per-diem related summary field
    for (const [k, v] of Object.entries(pFull)) {
      if (typeof k === "string" && (k.toLowerCase().includes("diem") || k.toLowerCase().includes("diet") || k.toLowerCase().includes("allowance") || k.toLowerCase().includes("compensation"))) {
        console.log(`  DIEM-RELATED: ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
      }
    }
  }

  // Check ALL available cost categories to see if there's a "Diett" category
  console.log("\n=== ALL TRAVEL COST CATEGORIES ===");
  for (const cat of travelCats) {
    console.log(`  id=${cat.id} desc="${cat.description}" vatType=${cat.vatType?.id} number=${cat.number}`);
  }

  // Check if there's a per-diem COST (not compensation) concept
  console.log("\n=== ALL COST CATEGORIES (full list) ===");
  const allCats = catRes.data?.values || [];
  for (const cat of allCats) {
    if (cat.description?.toLowerCase().includes("diet") ||
        cat.description?.toLowerCase().includes("diem") ||
        cat.description?.toLowerCase().includes("kost") ||
        cat.description?.toLowerCase().includes("allowance")) {
      console.log(`  DIETT-RELATED: id=${cat.id} desc="${cat.description}" showOnTravel=${cat.showOnTravelExpenses} vatType=${cat.vatType?.id}`);
    }
  }

  // Cleanup
  await api("DELETE", `/travelExpense/${te.id}`);
  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
