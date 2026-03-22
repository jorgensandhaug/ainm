/**
 * Task 13: Check if delivery creates a voucher and what it contains.
 * Also check ledger postings after delivery.
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
  if (!r.ok) console.log(`  ERR: ${method} ${path} → ${r.status}: ${JSON.stringify(json.validationMessages || json.message || json).slice(0,400)}`);
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

  // Create and deliver
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

  // Deliver
  const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${teId}`);
  console.log(`Delivered: ok=${deliverRes.ok}`);

  // Check parent with voucher expansion
  console.log("\n=== PARENT WITH VOUCHER ===");
  const parentRes = await api("GET", `/travelExpense/${teId}?fields=*,voucher(*)`);
  const parent = parentRes.data?.value;
  console.log(`  voucher: ${JSON.stringify(parent?.voucher)}`);
  console.log(`  state: ${parent?.state}`);
  console.log(`  isCompleted: ${parent?.isCompleted}`);
  console.log(`  isApproved: ${parent?.isApproved}`);

  // Check if voucher was created
  if (parent?.voucher?.id) {
    console.log("\n=== VOUCHER DETAILS ===");
    const voucherRes = await api("GET", `/ledger/voucher/${parent.voucher.id}?fields=*`);
    const voucher = voucherRes.data?.value;
    if (voucher) {
      for (const [k,v] of Object.entries(voucher)) {
        console.log(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      }
    }

    // Check postings
    console.log("\n=== VOUCHER POSTINGS ===");
    const postingsRes = await api("GET", `/ledger/posting?voucherId=${parent.voucher.id}&fields=*&count=100`);
    for (const p of (postingsRes.data?.values || [])) {
      console.log(`  account=${p.account?.number}/${p.account?.name} debit=${p.amountGross} credit=${p.amountGrossCurrency} amount=${p.amount} currency=${p.currency?.code}`);
    }
  }

  // Check ALL ledger postings after deliver
  console.log("\n=== ALL RECENT LEDGER POSTINGS ===");
  const allPostingsRes = await api("GET", `/ledger/posting?dateFrom=2026-03-01&dateTo=2026-03-31&fields=*&count=100`);
  for (const p of (allPostingsRes.data?.values || [])) {
    console.log(`  voucher=${p.voucher?.number} date=${p.date} account=${p.account?.number} debit=${p.amountGross} amount=${p.amount}`);
  }

  // Check all vouchers
  console.log("\n=== ALL VOUCHERS ===");
  const allVouchersRes = await api("GET", `/ledger/voucher?dateFrom=2026-03-01&dateTo=2026-03-31&fields=*&count=100`);
  for (const v of (allVouchersRes.data?.values || [])) {
    console.log(`  id=${v.id} number=${v.number} type=${v.voucherType?.name} date=${v.date} desc="${v.description}"`);
  }

  // DON'T delete — leave for inspection
  console.log(`\n=== Travel expense ${teId} left for inspection ===`);
  console.log("=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
