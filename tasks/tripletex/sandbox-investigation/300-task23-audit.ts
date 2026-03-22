/**
 * 300-task23-audit.ts — Audit sandbox state for Task 23 (bank reconciliation)
 *
 * Checks: bank statements, reconciliations, invoices, vouchers, suppliers, accounting periods
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");

async function api(method: string, path: string, body?: any): Promise<any> {
  const url = `${BASE}/${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const opts: RequestInit = { method, headers };
  if (body) opts.body = body instanceof FormData ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) console.error(`ERR ${res.status} ${method} /${path.split("?")[0]}: ${typeof json === "string" ? json.slice(0, 200) : JSON.stringify(json).slice(0, 200)}`);
  return json;
}

async function main() {
  console.log("=== SANDBOX AUDIT FOR TASK 23 ===\n");

  // 1. Bank statements
  console.log("--- Bank Statements ---");
  const bs = await api("GET", "bank/statement?count=100&fields=*");
  const statements = bs.values || [];
  console.log(`Total bank statements: ${statements.length}`);
  for (const s of statements) {
    console.log(`  id=${s.id} fromDate=${s.fromDate} toDate=${s.toDate} account=${s.account?.id}`);
  }

  // 2. Bank statement transactions (for each statement)
  console.log("\n--- Bank Statement Transactions ---");
  for (const s of statements.slice(-3)) { // last 3
    const txns = await api("GET", `bank/statement/transaction?bankStatementId=${s.id}&count=100&fields=*`);
    console.log(`  Statement ${s.id} (${s.fromDate} - ${s.toDate}): ${txns.values?.length || 0} txns`);
    for (const t of (txns.values || []).slice(0, 5)) {
      console.log(`    txn ${t.id}: amount=${t.amountCurrency} desc="${t.description}" matched=${t.matched} matchType=${t.matchType}`);
    }
  }

  // 3. Bank reconciliations
  console.log("\n--- Bank Reconciliations ---");
  const recons = await api("GET", "bank/reconciliation?count=100&fields=*,accountingPeriod(*)");
  const reconsList = recons.values || [];
  console.log(`Total reconciliations: ${reconsList.length}`);
  for (const r of reconsList) {
    console.log(`  id=${r.id} isClosed=${r.isClosed} period=${r.accountingPeriod?.start} closing=${r.bankAccountClosingBalanceCurrency} v=${r.version}`);
  }

  // 4. Accounting periods
  console.log("\n--- Accounting Periods (2026) ---");
  const periods = await api("GET", "ledger/accountingPeriod?startFrom=2026-01-01&startTo=2026-12-01&count=12&fields=*");
  for (const p of (periods.values || [])) {
    console.log(`  id=${p.id} start=${p.start} end=${p.end}`);
  }

  // 5. Open customer invoices
  console.log("\n--- Open Customer Invoices ---");
  const invs = await api("GET", "invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=100&fields=*,customer(*)");
  const openInvs = (invs.values || []).filter((i: any) => (i.amountCurrencyOutstanding ?? i.amountOutstanding ?? 0) > 0.01);
  console.log(`Total invoices: ${invs.values?.length || 0}, Open: ${openInvs.length}`);
  for (const inv of openInvs.slice(0, 10)) {
    console.log(`  inv#${inv.invoiceNumber} id=${inv.id} customer="${inv.customer?.name}" outstanding=${inv.amountCurrencyOutstanding ?? inv.amountOutstanding} total=${inv.amount}`);
  }

  // 6. Suppliers
  console.log("\n--- Suppliers ---");
  const supps = await api("GET", "supplier?count=100&fields=*");
  console.log(`Total suppliers: ${supps.values?.length || 0}`);
  for (const s of (supps.values || []).slice(0, 10)) {
    console.log(`  id=${s.id} name="${s.name}" orgNr=${s.organizationNumber}`);
  }

  // 7. Key accounts
  console.log("\n--- Key Accounts ---");
  const accts = await api("GET", "ledger/account?number=1920,2050,2400,2600,7770,8050&fields=*");
  for (const a of (accts.values || [])) {
    console.log(`  ${a.number}: id=${a.id} name="${a.name}"`);
  }

  // 8. Payment types
  console.log("\n--- Payment Types ---");
  const pts = await api("GET", "invoice/paymentType?count=100&fields=*,debitAccount(*)");
  for (const pt of (pts.values || [])) {
    console.log(`  id=${pt.id} name="${pt.description}" debit=${pt.debitAccount?.number}`);
  }

  // 9. Balance on 1920
  console.log("\n--- Balance Sheet (1920) ---");
  const balRes = await api("GET", "balanceSheet?dateFrom=2025-01-01&dateTo=2026-12-31&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*");
  for (const b of (balRes.values || [])) {
    console.log(`  balanceIn=${b.balanceIn} balanceOut=${b.balanceOut}`);
  }

  // 10. Vouchers on account 1920
  console.log("\n--- Postings on 1920 (recent) ---");
  const postings = await api("GET", "ledger/posting?accountId=424190862&dateFrom=2026-01-01&dateTo=2026-12-31&count=50&fields=id,date,amount,description,voucher(id)");
  console.log(`Total postings on 1920: ${postings.values?.length || 0}`);
  for (const p of (postings.values || []).slice(0, 20)) {
    console.log(`  posting=${p.id} date=${p.date} amount=${p.amount} desc="${p.description}" voucher=${p.voucher?.id}`);
  }

  // 11. Bank reconciliation matches
  console.log("\n--- Reconciliation Matches ---");
  for (const r of reconsList.slice(-3)) {
    const matches = await api("GET", `bank/reconciliation/match?bankReconciliationId=${r.id}&count=100&fields=*`);
    console.log(`  Recon ${r.id} (period ${r.accountingPeriod?.start}): ${matches.values?.length || 0} matches`);
  }

  // 12. Check if DELETE endpoints work
  console.log("\n--- Testing Delete Capabilities ---");
  // Can we delete bank statements?
  console.log("  Checking DELETE /bank/statement/{id} availability...");
  // Don't actually delete, just check the latest OpenAPI for the endpoint

  // Check matches
  console.log("\n--- All reconciliation matches for cleanup ---");
  for (const r of reconsList) {
    const matches = await api("GET", `bank/reconciliation/match?bankReconciliationId=${r.id}&count=100&fields=*`);
    const matchList = matches.values || [];
    if (matchList.length > 0) {
      console.log(`  Recon ${r.id}: ${matchList.length} matches — IDs: [${matchList.map((m:any)=>m.id).join(",")}]`);
    }
  }

  // 13. Supplier invoices
  console.log("\n--- Supplier Invoices ---");
  const sis = await api("GET", "supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=100&fields=*,supplier(*)");
  console.log(`Total supplier invoices: ${sis.values?.length || 0}`);

  console.log("\n=== AUDIT COMPLETE ===");
}

main().catch(console.error);
