// Test: create TWO reconciliations (Jan + Feb) and match bank txns to the correct period
// This is the fix for the production 422 errors

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

let callCount = 0;
async function api(method: string, path: string, body?: any, isFormData = false): Promise<any> {
  callCount++;
  const url = `${BASE}/${path}`;
  const headers: any = { Authorization: AUTH };
  if (body && !isFormData) headers["Content-Type"] = "application/json";
  const opts: any = { method, headers };
  if (body) opts.body = isFormData ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) console.error(`ERROR ${res.status} ${method} /${path}:`, JSON.stringify(data).substring(0, 300));
  return { ok: res.ok, status: res.status, data };
}

const get = (p: string) => api("GET", p);
const post = (p: string, b?: any, f = false) => api("POST", p, b, f);
const put = (p: string, b: any) => api("PUT", p, b);

// Step 1: Get periods for Jan and Feb 2026
// Use a broader range to get both in one call
const periodsRes = await get("ledger/accountingPeriod?startFrom=2026-01-01&startTo=2026-03-01&count=12&fields=*");
const allPeriods = periodsRes.data.values || [];
console.log("Periods found:", allPeriods.length);
for (const p of allPeriods) {
  console.log(`  Period: ${p.name} id=${p.id} start=${p.start} end=${p.end}`);
}

const janPeriod = allPeriods.find((p: any) => p.start === "2026-01-01");
const febPeriod = allPeriods.find((p: any) => p.start === "2026-02-01");
console.log(`Jan period id=${janPeriod?.id}, Feb period id=${febPeriod?.id}`);

// Get account 1920
const acctRes = await get("ledger/account?number=1920&fields=*");
const acct1920Id = acctRes.data.values?.[0]?.id;
console.log(`Account 1920 id=${acct1920Id}`);

// Check existing bank statements in this date range
const stmtRes = await get("bank/statement?count=100&fields=id,fromDate,toDate");
console.log("\nExisting bank statements:");
for (const s of (stmtRes.data.values || [])) {
  console.log(`  id=${s.id} from=${s.fromDate} to=${s.toDate}`);
}

// Get the latest bank statement (from our previous sandbox tests) that has Jan+Feb data
// We need one that spans both months
const stmtWithBothMonths = stmtRes.data.values?.find((s: any) => s.fromDate <= "2026-01-20" && s.toDate >= "2026-02-01");
if (stmtWithBothMonths) {
  console.log(`\nUsing existing bank statement: id=${stmtWithBothMonths.id}`);

  // Get its transactions
  const txnRes = await get(`bank/statement/transaction?bankStatementId=${stmtWithBothMonths.id}&count=100&fields=id,postedDate,amountCurrency,description,matched`);
  const txns = txnRes.data.values || [];
  console.log(`Transactions: ${txns.length}`);

  // Split by period
  const janTxns = txns.filter((t: any) => t.postedDate < "2026-02-01");
  const febTxns = txns.filter((t: any) => t.postedDate >= "2026-02-01");
  console.log(`Jan txns: ${janTxns.length}, Feb txns: ${febTxns.length}`);

  for (const t of txns) {
    console.log(`  ${t.postedDate} ${t.amountCurrency} matched=${t.matched} ${t.description?.substring(0, 40)}`);
  }

  // Check for existing recons on these periods
  const reconRes = await get("bank/reconciliation?count=100&fields=id,accountingPeriod(id,start),isClosed");
  const existingRecons = reconRes.data.values || [];
  const janRecon = existingRecons.find((r: any) => r.accountingPeriod?.start === "2026-01-01");
  const febRecon = existingRecons.find((r: any) => r.accountingPeriod?.start === "2026-02-01");

  console.log(`\nExisting Jan recon: ${janRecon ? `id=${janRecon.id} closed=${janRecon.isClosed}` : "NONE"}`);
  console.log(`Existing Feb recon: ${febRecon ? `id=${febRecon.id} closed=${febRecon.isClosed}` : "NONE"}`);

  // If Jan recon exists and is closed, we can't create a new one or match against it
  // We need to test with OPEN reconciliations

  // Try creating a new reconciliation for January (if none exists or if existing is closed)
  if (!janRecon || janRecon.isClosed) {
    console.log("\nCreating January reconciliation...");
    const createJan = await post("bank/reconciliation", {
      account: { id: acct1920Id },
      accountingPeriod: { id: janPeriod.id },
      type: "MANUAL",
      bankAccountClosingBalanceCurrency: 0,
      isClosed: false,
    });
    console.log(`Jan recon create: ok=${createJan.ok} id=${createJan.data?.value?.id}`);

    if (createJan.ok) {
      // Try matching a January transaction
      const testJanTxn = janTxns.find((t: any) => !t.matched);
      if (testJanTxn) {
        // Get postings
        const postRes = await get(`ledger/posting?accountId=${acct1920Id}&dateFrom=2026-01-01&dateTo=2026-02-01&count=1000&fields=id,date,amount,description`);
        const janPostings = postRes.data.values || [];
        console.log(`Jan postings on 1920: ${janPostings.length}`);

        const matchPosting = janPostings.find((p: any) => Math.abs(p.amount - testJanTxn.amountCurrency) < 0.01);
        if (matchPosting) {
          console.log(`\nAttempting match: txn ${testJanTxn.id} (${testJanTxn.amountCurrency}) -> posting ${matchPosting.id} (${matchPosting.amount})`);
          const matchRes = await post("bank/reconciliation/match", {
            bankReconciliation: { id: createJan.data.value.id },
            transactions: [{ id: testJanTxn.id }],
            postings: [{ id: matchPosting.id }],
          });
          console.log(`Match result: ok=${matchRes.ok}`);
          if (!matchRes.ok) console.log("Match error:", JSON.stringify(matchRes.data).substring(0, 300));
        } else {
          console.log(`No posting found matching amount ${testJanTxn.amountCurrency}`);
        }
      }
    }
  }
} else {
  console.log("\nNo bank statement spanning Jan+Feb found. Would need to import one.");
}

console.log(`\nTotal sandbox API calls: ${callCount}`);
