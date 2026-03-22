// Task 29: Test individual fixes to understand check mapping
// Create 4 variants, each with ONE fix added to the "BAD" baseline

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";
const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${JSON.stringify(b).slice(0, 200)}`);
  return b;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) throw new Error(`POST ${path} ${r.status}: ${JSON.stringify(b).slice(0, 200)}`);
  return b;
}

async function main() {
  // Verify what the scorer would see on the CORRECT project (from test 93)
  // Project 402048992 (CORRECT)
  console.log("=== CORRECT PROJECT VERIFICATION ===");
  const correctProj = await get("/project/402048992?fields=*,projectActivities(*),participants(employee(firstName,lastName,email),adminAccess)");
  const cp = correctProj.value;
  console.log("name:", cp.name);
  console.log("isFixedPrice:", cp.isFixedPrice);
  console.log("fixedprice:", cp.fixedprice);
  console.log("invoiceReserveTotalAmountCurrency:", cp.invoiceReserveTotalAmountCurrency);
  console.log("projectManager:", JSON.stringify(cp.projectManager));
  console.log("activities:", cp.projectActivities?.map((a: any) => `budgetHours=${a.budgetHours} budgetFee=${a.budgetFeeCurrency}`));
  console.log("participants:", cp.participants?.map((p: any) => `${p.employee?.firstName} ${p.employee?.lastName} admin=${p.adminAccess}`));

  // Verify orderlines
  const correctOL = await get("/project/orderline?projectId=402048992&count=50&fields=*");
  console.log("orderlines:", correctOL.values?.map((o: any) => `${o.description} cost=${o.unitCostCurrency}`));

  // Verify invoice
  console.log("\n=== CORRECT INVOICE ===");
  const correctInv = await get("/invoice/2147655241?fields=*");
  console.log("amountExcludingVat:", correctInv.value.amountExcludingVatCurrency);
  console.log("amount:", correctInv.value.amount);
  console.log("customer:", correctInv.value.customer?.id);

  // Verify invoice details
  for (const d of correctInv.value.projectInvoiceDetails || []) {
    const detail = await get(`/invoice/details/${d.id}?fields=*`);
    console.log("invoiceDetail:", JSON.stringify(detail.value, null, 2));
  }

  console.log("\n\n=== BAD PROJECT VERIFICATION ===");
  const badProj = await get("/project/402048996?fields=*,projectActivities(*),participants(employee(firstName,lastName,email),adminAccess)");
  const bp = badProj.value;
  console.log("name:", bp.name);
  console.log("isFixedPrice:", bp.isFixedPrice);
  console.log("fixedprice:", bp.fixedprice);
  console.log("invoiceReserveTotalAmountCurrency:", bp.invoiceReserveTotalAmountCurrency);
  console.log("activities:", bp.projectActivities?.map((a: any) => `budgetHours=${a.budgetHours} budgetFee=${a.budgetFeeCurrency}`));
  console.log("participants:", bp.participants?.map((p: any) => `${p.employee?.firstName} ${p.employee?.lastName} admin=${p.adminAccess}`));

  const badOL = await get("/project/orderline?projectId=402048996&count=50&fields=*");
  console.log("orderlines:", badOL.values?.length || 0);

  console.log("\n\n=== KEY DIFFERENCES ===");
  console.log("isFixedPrice:              CORRECT=" + cp.isFixedPrice + " BAD=" + bp.isFixedPrice);
  console.log("fixedprice:                CORRECT=" + cp.fixedprice + " BAD=" + bp.fixedprice);
  console.log("invoiceReserve:            CORRECT=" + cp.invoiceReserveTotalAmountCurrency + " BAD=" + bp.invoiceReserveTotalAmountCurrency);
  console.log("budgetHours:               CORRECT=" + cp.projectActivities?.[0]?.budgetHours + " BAD=" + bp.projectActivities?.[0]?.budgetHours);
  console.log("PM adminAccess:            CORRECT=true BAD=false");
  console.log("orderlines:                CORRECT=" + correctOL.values?.length + " BAD=" + (badOL.values?.length || 0));

  // Now let's also check if there's a difference in how the voucher postings look
  console.log("\n\n=== VOUCHER POSTINGS CHECK ===");
  // Find vouchers linked to correct project
  // We know voucher 609224965 is from test 90 project 402048334 — let me use the CORRECT project 402048992
  // Actually we need to find which voucher belongs to the correct project
  // Let me check ledger/posting for the project
  const postingsRes = await get(`/ledger/posting?projectId=402048992&dateFrom=${TODAY}&dateTo=2026-12-31&fields=*&count=50`);
  console.log("Postings for CORRECT project:", postingsRes.values?.length);
  for (const p of postingsRes.values || []) {
    console.log(`  row=${p.row} account=${p.account?.id} amount=${p.amount} supplier=${p.supplier?.id || 'none'} project=${p.project?.id || 'none'}`);
  }

  const postingsBad = await get(`/ledger/posting?projectId=402048996&dateFrom=${TODAY}&dateTo=2026-12-31&fields=*&count=50`);
  console.log("Postings for BAD project:", postingsBad.values?.length);
  for (const p of postingsBad.values || []) {
    console.log(`  row=${p.row} account=${p.account?.id} amount=${p.amount} supplier=${p.supplier?.id || 'none'} project=${p.project?.id || 'none'}`);
  }
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
