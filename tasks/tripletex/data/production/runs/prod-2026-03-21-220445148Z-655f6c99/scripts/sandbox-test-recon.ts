// Sandbox test: verify bank reconciliation flow end-to-end
// Goal: confirm POST /bank/reconciliation with isClosed:true works,
// and test whether CSV saldo can be used directly vs needing balance sheet read

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${path}`);
  const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  console.log(`  → ${r.status} ${text.substring(0, 300)}`);
  if (!r.ok) return null;
  return JSON.parse(text);
}

async function main() {
  // 1. Get accounting periods to find one we can use
  const periodsR = await api("GET", "/ledger/accountingPeriod?count=100&fields=*");
  if (!periodsR) return;

  const periods = periodsR.values || [];
  console.log(`\nAccounting periods: ${periods.length}`);
  for (const p of periods) {
    console.log(`  Period id=${p.id} start=${p.start} end=${p.end}`);
  }

  // Find period covering January 2026
  const janPeriod = periods.find((p: any) => p.start <= "2026-01-31" && p.end >= "2026-01-01");
  // Find period covering February 2026
  const febPeriod = periods.find((p: any) => p.start <= "2026-02-08" && p.end >= "2026-02-08");

  console.log(`\nJan period: ${janPeriod ? `id=${janPeriod.id} ${janPeriod.start}..${janPeriod.end}` : "not found"}`);
  console.log(`Feb period: ${febPeriod ? `id=${febPeriod.id} ${febPeriod.start}..${febPeriod.end}` : "not found"}`);

  // 2. Get account 1920 ID
  const acctR = await api("GET", "/ledger/account?number=1920&fields=*");
  if (!acctR) return;
  const acct1920 = acctR.values[0];
  console.log(`\nAccount 1920: id=${acct1920.id}`);

  // 3. Check existing bank reconciliations
  const existingRecons = await api("GET", "/bank/reconciliation?accountId=" + acct1920.id + "&count=100&fields=*");
  console.log(`\nExisting reconciliations: ${existingRecons?.values?.length || 0}`);
  if (existingRecons?.values) {
    for (const r of existingRecons.values) {
      console.log(`  Recon id=${r.id} period=${r.accountingPeriod?.id} closed=${r.isClosed} balance=${r.bankAccountClosingBalanceCurrency}`);
    }
  }

  // 4. Get balance sheet for account 1920 in a period where we haven't already reconciled
  // Try a period that doesn't have a reconciliation yet
  const usedPeriodIds = new Set((existingRecons?.values || []).map((r: any) => r.accountingPeriod?.id));
  const availablePeriod = periods.find((p: any) => !usedPeriodIds.has(p.id) && p.start >= "2026-01-01");

  if (!availablePeriod) {
    console.log("\nNo available period without existing reconciliation. Listing all for analysis.");
    // Try to find any unused period
    for (const p of periods) {
      if (!usedPeriodIds.has(p.id)) {
        console.log(`  Available: id=${p.id} ${p.start}..${p.end}`);
      }
    }
    return;
  }

  console.log(`\nUsing period: id=${availablePeriod.id} ${availablePeriod.start}..${availablePeriod.end}`);

  // 5. Read balance sheet for this period
  const balR = await api("GET", `/balanceSheet?dateFrom=${availablePeriod.start}&dateTo=${availablePeriod.end}&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*`);
  if (balR?.values?.[0]) {
    console.log(`\nBalance sheet 1920: balanceIn=${balR.values[0].balanceIn} balanceOut=${balR.values[0].balanceOut} balanceChange=${balR.values[0].balanceChange}`);
  }

  // 6. Try to create + close bank reconciliation
  const closingBalance = balR?.values?.[0]?.balanceOut ?? 0;
  console.log(`\nAttempting POST /bank/reconciliation with closingBalance=${closingBalance}`);

  const reconResult = await api("POST", "/bank/reconciliation", {
    account: { id: acct1920.id },
    accountingPeriod: { id: availablePeriod.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: closingBalance,
    isClosed: true,
  });

  if (reconResult) {
    console.log(`\nBank reconciliation created: id=${reconResult.value?.id} isClosed=${reconResult.value?.isClosed}`);
  }

  console.log("\nDone.");
}

main().catch(e => console.error(e));
