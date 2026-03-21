// Sandbox: verify bank reconciliation Step 6 flow
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) { const t = await r.text(); console.error(`GET ${path} → ${r.status}: ${t}`); return null; }
  return r.json();
}

async function main() {
  // 1. Get accounting periods to understand the format
  const periods = await get("/ledger/accountingPeriod?count=20&fields=*");
  if (periods) {
    console.log("Accounting periods:");
    for (const p of (periods.values || []).slice(0, 6)) {
      console.log(`  id=${p.id} start=${p.start} end=${p.end}`);
    }
  }

  // 2. Get account 1920 ID
  const acc = await get("/ledger/account?number=1920&fields=*");
  const acc1920 = acc?.values?.[0];
  console.log(`\nAccount 1920: id=${acc1920?.id}`);

  // 3. Check balance sheet for a period
  const bal = await get("/balanceSheet?dateFrom=2026-01-01&dateTo=2026-02-28&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*");
  if (bal?.values?.length) {
    const b = bal.values[0];
    console.log(`\nBalance 1920 for 2026-01-01 to 2026-02-28: balanceIn=${b.balanceIn} balanceOut=${b.balanceOut} balanceChange=${b.balanceChange}`);
  }

  // 4. Check existing bank reconciliations
  const recons = await get("/bank/reconciliation?count=10&fields=*");
  console.log(`\nExisting reconciliations: ${recons?.values?.length || 0}`);
  for (const r of (recons?.values || []).slice(0, 3)) {
    console.log(`  id=${r.id} accountId=${r.account?.id} periodId=${r.accountingPeriod?.id} closed=${r.isClosed} closingBalance=${r.bankAccountClosingBalanceCurrency}`);
  }

  console.log("\nSandbox bank reconciliation check complete.");
}

main().catch(e => { console.error(e); process.exit(1); });
