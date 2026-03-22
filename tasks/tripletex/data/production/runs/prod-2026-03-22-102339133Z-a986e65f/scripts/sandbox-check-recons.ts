/**
 * Check what existing recons exist in the sandbox and find a clean period.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string): Promise<any> {
  const url = `${BASE}/${path}`;
  const res = await fetch(url, { headers: { Authorization: AUTH } });
  const data = await res.json();
  return data;
}

// List all recons
const reconsRes = await api("GET", "bank/reconciliation?count=100&fields=*");
const recons = reconsRes.values || [];
console.log(`Found ${recons.length} bank reconciliations:`);
for (const r of recons) {
  console.log(`  id=${r.id} period=${r.accountingPeriod?.id} closed=${r.isClosed} bal=${r.bankAccountClosingBalanceCurrency} v=${r.version}`);
}

// List all periods for 2026
const periodsRes = await api("GET", "ledger/accountingPeriod?startFrom=2026-01-01&startTo=2027-01-01&count=24&fields=*");
const periods = periodsRes.values || [];
console.log(`\nPeriods for 2026:`);
const reconPeriodIds = new Set(recons.map((r: any) => r.accountingPeriod?.id));
for (const p of periods) {
  const hasRecon = reconPeriodIds.has(p.id);
  console.log(`  id=${p.id} ${p.start} to ${p.end} ${hasRecon ? "HAS RECON" : "CLEAN"}`);
}

// List bank statements
const bsRes = await api("GET", "bank/statement?count=100&fields=id,fromDate,toDate");
const statements = bsRes.values || [];
console.log(`\nBank statements: ${statements.length}`);
for (const s of statements) {
  console.log(`  id=${s.id} from=${s.fromDate} to=${s.toDate}`);
}
