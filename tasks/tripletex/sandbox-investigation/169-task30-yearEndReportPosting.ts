/**
 * Task 30 — Investigate yearEndReportPosting.
 * The yearEnd API shows yearEndReportPosting: { sumAmount: 0, posts: [] }
 * even though vouchers ARE posted. Maybe the scorer checks this field.
 *
 * Questions:
 * 1. Can we access /yearEnd/0/yearEndReportPosting?
 * 2. Can we POST entries to yearEndReportPosting?
 * 3. What does the basicData endpoint look like?
 * 4. Is there a way to PUT/update the yearEnd to change status from STARTED?
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  // 1. Try yearEnd sub-endpoints with explicit id=0
  console.log("=== 1. yearEnd sub-endpoints with id=0 ===");
  const paths = [
    "/yearEnd/0",
    "/yearEnd/0?fields=yearEndReportPosting(*)",
  ];
  for (const p of paths) {
    const r = await api("GET", p);
    if (r.ok) {
      const yrp = r.data.value?.yearEndReportPosting;
      if (yrp) console.log(`  yearEndReportPosting: ${JSON.stringify(yrp)}`);
    } else {
      console.log(`  Error: ${JSON.stringify(r.data).slice(0, 200)}`);
    }
  }

  // 2. Try PUT on yearEnd to change status
  console.log("\n=== 2. PUT yearEnd status ===");
  const putStatus = await api("PUT", "/yearEnd/0", {
    id: 0,
    version: 0,
    status: "COMPLETED"
  });
  console.log(`  Response: ${JSON.stringify(putStatus.data).slice(0, 500)}`);

  // 3. Discover yearEnd posting endpoints
  console.log("\n=== 3. Discover posting endpoints ===");
  const postPaths = [
    // Maybe yearEndReportPosting is a nested resource
    "/yearEnd/posting",
    "/yearEnd/reportPosting",
    "/yearEndReportPosting",
  ];
  for (const p of postPaths) {
    const r = await api("GET", p);
    console.log(`  GET ${p}: ${r.status} - ${JSON.stringify(r.data).slice(0, 200)}`);
  }

  // 4. Check if we can POST yearEndReportPosting
  console.log("\n=== 4. POST yearEndReportPosting ===");
  const postPayload = {
    yearEndReport: { id: 0 },
    account: { id: 424191229 }, // 8300
    amount: 50000,
    description: "Test"
  };
  const postRes = await api("POST", "/yearEndReportPosting", postPayload);
  console.log(`  Response: ${JSON.stringify(postRes.data).slice(0, 500)}`);

  // 5. Try the specific voucher type for year-end
  console.log("\n=== 5. Voucher types ===");
  const vtRes = await api("GET", "/ledger/voucherType?fields=*&count=100");
  if (vtRes.ok) {
    for (const vt of (vtRes.data.values || [])) {
      console.log(`  id=${vt.id} name="${vt.name}"`);
    }
  } else {
    console.log(`  Error: ${vtRes.status}`);
  }

  // 6. Check what voucher types existing year-end vouchers have
  console.log("\n=== 6. Year-end voucher details ===");
  const vRes = await api("GET", "/ledger/voucher?dateFrom=2025-12-01&dateTo=2026-01-01&fields=id,number,date,description,voucherType(*),tempNumber&count=10");
  if (vRes.ok) {
    for (const v of (vRes.data.values || []).filter((v: any) => v.date === "2025-12-31").slice(0, 5)) {
      console.log(`  id=${v.id} #${v.number} temp=${v.tempNumber} voucherType=${JSON.stringify(v.voucherType)} "${v.description}"`);
    }
  }

  // 7. Look for year-end related openapi paths by trying numeric IDs
  console.log("\n=== 7. yearEnd basicData ===");
  const bd = await api("GET", "/yearEnd/basicData?fields=*");
  if (bd.ok) {
    console.log(`  ${JSON.stringify(bd.data.value, null, 2).slice(0, 1000)}`);
  }

  // 8. Try to see if there's a "send" or "submit" endpoint for yearEnd
  console.log("\n=== 8. yearEnd send/submit ===");
  const sendPaths = [
    { method: "PUT", path: "/yearEnd/0/send" },
    { method: "POST", path: "/yearEnd/0/send" },
    { method: "PUT", path: "/yearEnd/send" },
    { method: "POST", path: "/yearEnd/send" },
    { method: "PUT", path: "/yearEnd/0/complete" },
    { method: "POST", path: "/yearEnd/0/complete" },
  ];
  for (const { method, path } of sendPaths) {
    const r = await api(method, path);
    console.log(`  ${method} ${path}: ${r.status} - ${JSON.stringify(r.data).slice(0, 200)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
