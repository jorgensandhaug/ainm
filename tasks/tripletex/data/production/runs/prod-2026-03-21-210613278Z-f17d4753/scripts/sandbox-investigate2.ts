// Further sandbox investigation for task 29
// 1. Read project activity via correct endpoint
// 2. Read participants via correct endpoint
// 3. Read timesheet with date params
// 4. Check what the overallStatus actually shows for costs
// 5. Read voucher postings to verify linkage

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Content-Type": "application/json", Authorization: AUTH },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (r.status >= 400) {
    console.log(`${method} ${path} → ${r.status} ERROR:`, JSON.stringify(json).slice(0, 500));
  } else {
    console.log(`${method} ${path} → ${r.status}`);
  }
  return { status: r.status, data: json };
}

async function main() {
  // Use the project from previous run
  const projectId = 402041125;

  // 1. Read project activities - try the search endpoint with project filter
  console.log("=== Project Activities (search) ===");
  const paSearch = await api("GET", `/project/${projectId}?fields=projectActivities(*)`,);
  if (paSearch.status === 200) {
    const proj = paSearch.data.value;
    console.log("projectActivities:", JSON.stringify(proj.projectActivities, null, 2)?.slice(0, 2000));
  }

  // 2. Try to GET project activities directly
  console.log("\n=== Project Activities (direct) ===");
  const paList = await api("GET", `/project/projectActivity?project.id=${projectId}&count=10&fields=*`);
  console.log("paList:", JSON.stringify(paList.data, null, 2)?.slice(0, 1500));

  // 3. Read participants
  console.log("\n=== Participants (direct) ===");
  const partList = await api("GET", `/project/participant?project.id=${projectId}&count=10&fields=*`);
  console.log("partList:", JSON.stringify(partList.data, null, 2)?.slice(0, 1500));

  // 4. Read timesheet entries with date params
  console.log("\n=== Timesheet entries ===");
  const tsRes = await api("GET", `/timesheet/entry?projectId=${projectId}&dateFrom=2026-03-01&dateTo=2026-12-31&fields=*&count=100`);
  if (tsRes.status === 200) {
    let totalHrs = 0;
    const empHours: Record<string, number> = {};
    for (const e of tsRes.data.values || []) {
      totalHrs += e.hours;
      const empId = e.employee?.id;
      empHours[empId] = (empHours[empId] || 0) + e.hours;
    }
    console.log("total entries:", tsRes.data.values?.length, "total hours:", totalHrs);
    for (const [empId, hrs] of Object.entries(empHours)) {
      console.log(`  employee ${empId}: ${hrs}h`);
    }
  }

  // 5. Read voucher postings
  console.log("\n=== Voucher postings ===");
  const voucherId = 609180403;
  const vRes = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  if (vRes.status === 200) {
    console.log("voucher:", JSON.stringify(vRes.data.value, null, 2)?.slice(0, 1500));
  }

  // 6. Read postings on voucher
  console.log("\n=== Voucher postings detail ===");
  const postingsRes = await api("GET", `/ledger/posting?voucherId=${voucherId}&fields=*&count=10`);
  if (postingsRes.status === 200) {
    for (const p of postingsRes.data.values || []) {
      console.log(`  posting row=${p.row} account=${p.account?.number} amount=${p.amount} project=${p.project?.id} supplier=${p.supplier?.id}`);
    }
  }

  // 7. Try reading project overall status - check what costs field looks like
  console.log("\n=== Project overall status ===");
  const statusRes = await api("GET", `/project/${projectId}/period/overallStatus?dateFrom=2026-01-01&dateTo=2026-12-31&fields=*`);
  if (statusRes.status === 200) {
    console.log("overallStatus:", JSON.stringify(statusRes.data.value, null, 2));
  }

  // 8. Check if project has any orderLines
  console.log("\n=== Project orderLines ===");
  const olRes = await api("GET", `/project/orderline?projectId=${projectId}&fields=*&count=10`);
  console.log("orderLines:", JSON.stringify(olRes.data, null, 2)?.slice(0, 500));

  // 9. Check project with FULL fields expansion
  console.log("\n=== Project full expansion ===");
  const projFull = await api("GET", `/project/${projectId}?fields=id,name,fixedprice,isFixedPrice,projectManager(*),participants(*),projectActivities(*)`);
  if (projFull.status === 200) {
    const p = projFull.data.value;
    console.log("name:", p.name);
    console.log("fixedprice:", p.fixedprice);
    console.log("isFixedPrice:", p.isFixedPrice);
    console.log("projectManager:", JSON.stringify(p.projectManager));
    console.log("participants count:", p.participants?.length);
    for (const part of p.participants || []) {
      console.log(`  participant id=${part.id} employee=${JSON.stringify(part.employee)} admin=${part.adminAccess}`);
    }
    console.log("projectActivities count:", p.projectActivities?.length);
    for (const act of p.projectActivities || []) {
      console.log(`  activity id=${act.id} budget=${act.budgetFeeCurrency} hours=${act.budgetHours}`);
    }
  }

  // 10. Check invoice details
  console.log("\n=== Invoice details ===");
  const invRes = await api("GET", `/invoice?invoiceDateFrom=2026-03-21&invoiceDateTo=2026-12-31&customerId=108439205&fields=*&count=10`);
  if (invRes.status === 200) {
    for (const inv of invRes.data.values || []) {
      console.log(`invoice id=${inv.id} number=${inv.invoiceNumber} amount=${inv.amountExcludingVatCurrency}`);
      console.log("  projectInvoiceDetails:", JSON.stringify(inv.projectInvoiceDetails)?.slice(0, 500));
      console.log("  orders:", JSON.stringify(inv.orders)?.slice(0, 500));
    }
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
