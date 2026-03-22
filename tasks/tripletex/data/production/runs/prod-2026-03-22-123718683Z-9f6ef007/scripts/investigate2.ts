// Investigate project period data + supplier invoice details from the last sandbox run
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");
const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json().catch(() => r.text());
  console.log(`GET ${path} -> ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(b).slice(0, 500)); return null; }
  return b;
}

async function main() {
  // Use the project from the last deep-investigate run
  // Let me find recent projects first
  const projects = await get(`/project?name=LifecycleTest&count=5&sorting=-id&fields=*`);
  if (!projects?.values?.length) {
    console.log("No projects found, let me check recent ones");
    const recent = await get(`/project?count=5&sorting=-id&fields=*,customer(*),projectManager(*)`);
    console.log("Recent projects:", JSON.stringify(recent?.values?.map((p: any) => ({ id: p.id, name: p.name })), null, 2));
    return;
  }

  const pId = projects.values[0].id;
  console.log("Using project:", pId, projects.values[0].name);

  // 1. Project period endpoints
  console.log("\n=== PROJECT PERIOD DATA ===");

  const invoiced = await get(`/project/${pId}/period/invoiced?dateFrom=2026-01-01&dateTo=2027-01-01&fields=*`);
  console.log("\nINVOICED:", JSON.stringify(invoiced, null, 2));

  const monthlyStatus = await get(`/project/${pId}/period/monthlyStatus?dateFrom=2026-01-01&dateTo=2027-01-01&count=100&fields=*`);
  console.log("\nMONTHLY STATUS:", JSON.stringify(monthlyStatus, null, 2));

  const overallStatus = await get(`/project/${pId}/period/overallStatus?dateFrom=2026-01-01&dateTo=2027-01-01&fields=*`);
  console.log("\nOVERALL STATUS:", JSON.stringify(overallStatus, null, 2));

  const hourlistReport = await get(`/project/${pId}/period/hourlistReport?periodDateFrom=2026-01-01&periodDateTo=2027-01-01`);
  console.log("\nHOURLIST REPORT:", JSON.stringify(hourlistReport, null, 2));

  const invoicingReserve = await get(`/project/${pId}/period/invoicingReserve?periodDateFrom=2026-01-01&periodDateTo=2027-01-01`);
  console.log("\nINVOICING RESERVE:", JSON.stringify(invoicingReserve, null, 2));

  // 2. Supplier invoice full details
  console.log("\n=== SUPPLIER INVOICE DATA ===");
  const si = await get(`/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-01-01&count=5&sorting=-id&fields=*,supplier(*),voucher(*),orderLines(*)`);
  if (si?.values?.length) {
    for (const s of si.values) {
      console.log("\nSI:", JSON.stringify(s, null, 2));
    }
  }

  // 3. Check if there's a project cost summary endpoint
  const projectFull = await get(`/project/${pId}?fields=*`);
  console.log("\n=== PROJECT KEY FIELDS ===");
  const p = projectFull?.value;
  if (p) {
    console.log("contributionMarginPercent:", p.contributionMarginPercent);
    console.log("isFixedPrice:", p.isFixedPrice);
    console.log("fixedprice:", p.fixedprice);
    console.log("invoiceReserveTotalAmountCurrency:", p.invoiceReserveTotalAmountCurrency);
    console.log("totalInvoicedOnAccountAmountAbsoluteCurrency:", p.totalInvoicedOnAccountAmountAbsoluteCurrency);
  }

  // 4. Ledger postings specifically for the project
  const postings = await get(`/ledger/posting?projectId=${pId}&dateFrom=2026-01-01&dateTo=2027-01-01&count=100&fields=*,account(*)`);
  console.log("\n=== ALL LEDGER POSTINGS FOR PROJECT ===");
  for (const p of postings?.values || []) {
    console.log(`  voucher=${p.voucher?.id} acc=${p.account?.number}(${p.account?.name}) amount=${p.amount} amountCurrency=${p.amountCurrency} desc=${p.description}`);
  }

  // 5. Balance sheet for key accounts
  const bs = await get(`/balanceSheet?dateFrom=2026-03-22&dateTo=2026-03-22&accountNumberFrom=1000&accountNumberTo=9999&fields=*,account(*)`);
  console.log("\n=== BALANCE SHEET (non-zero) ===");
  for (const entry of bs?.values || []) {
    if (entry.closingBalance !== 0 || entry.sumAmount !== 0) {
      console.log(`  ${entry.account?.number} ${entry.account?.name}: closing=${entry.closingBalance}, sum=${entry.sumAmount}`);
    }
  }

  // 6. Check project participants with all details
  const parts = await get(`/project/participant?projectId=${pId}&count=10&fields=*,employee(id,firstName,lastName,email)`);
  console.log("\n=== PARTICIPANTS ===");
  for (const pp of parts?.values || []) {
    console.log(`  employee=${pp.employee?.firstName} ${pp.employee?.lastName} (${pp.employee?.email}) adminAccess=${pp.adminAccess}`);
  }

  // 7. Invoice details endpoint
  const invDetails = await get(`/invoice/details?invoiceDateFrom=2026-01-01&invoiceDateTo=2027-01-01&count=10&fields=*,project(*),invoice(*)`);
  console.log("\n=== INVOICE DETAILS ===");
  console.log(JSON.stringify(invDetails?.values, null, 2));
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
