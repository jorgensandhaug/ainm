/**
 * 68-task23-bank-reconciliation.ts — Round 4
 * Key findings so far:
 *  - Tripletex auto-creates a new open reconciliation for the NEXT period after the last closed
 *  - DELETE on open recon works (204), but Tripletex immediately creates a replacement
 *  - Can't POST to a period that already has a reconciliation (even open)
 *  - Can't POST to periods BEFORE the latest closed
 *
 * New tests:
 *  A) Try PUT on the existing open reconciliation (12705483, Aug 2026) to close it
 *  B) Try POST to Sep 2026 (next period after existing open Aug)
 *  C) Try DELETE + immediate POST to same period
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: RequestInit = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  console.log(`\n>>> ${method} ${path}`);
  if (body) console.log("Body:", JSON.stringify(body, null, 2));
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`<<< ${res.status} ${res.statusText}`);
  console.log(JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

async function main() {
  const ACCT_1920_ID = 424190862;
  const OPEN_RECON_ID = 12705483; // Aug 2026, isClosed: false
  const AUG_PERIOD_ID = 23726307;

  // Get balance for Aug 2026
  console.log("=== Balance for Aug 2026 ===");
  const balRes = await api("GET",
    "balanceSheet?dateFrom=2026-08-01&dateTo=2026-09-01&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*"
  );
  const balance = balRes.data?.values?.[0]?.balanceOut ?? -64026.22;
  console.log("Balance:", balance);

  // TEST A: PUT to close the existing open reconciliation
  console.log("\n=== TEST A: PUT to close existing open recon ===");
  // First GET the full object to see what version we need
  const getRes = await api("GET", `bank/reconciliation/${OPEN_RECON_ID}?fields=*`);
  const version = getRes.data?.value?.version;
  console.log("Current version:", version);

  const putRes = await api("PUT", `bank/reconciliation/${OPEN_RECON_ID}`, {
    id: OPEN_RECON_ID,
    version: version,
    account: { id: ACCT_1920_ID },
    accountingPeriod: { id: AUG_PERIOD_ID },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: balance,
    isClosed: true,
  });

  if (putRes.status < 400) {
    console.log("\n=== TEST A: Verify after PUT ===");
    await api("GET", `bank/reconciliation/${OPEN_RECON_ID}?fields=*`);

    // Clean up by reopening? Or just delete?
    console.log("\n=== TEST A cleanup: DELETE closed recon ===");
    const delRes = await api("DELETE", `bank/reconciliation/${OPEN_RECON_ID}`);
    console.log("DELETE closed:", delRes.status);

    if (delRes.status >= 400) {
      // Can't delete closed - try PUT to reopen
      console.log("Can't delete closed recon, trying PUT to reopen...");
      await api("PUT", `bank/reconciliation/${OPEN_RECON_ID}`, {
        id: OPEN_RECON_ID,
        account: { id: ACCT_1920_ID },
        accountingPeriod: { id: AUG_PERIOD_ID },
        type: "MANUAL",
        bankAccountClosingBalanceCurrency: balance,
        isClosed: false,
      });
    }
  }

  // Check state after TEST A
  console.log("\n=== State after TEST A ===");
  await api("GET", "bank/reconciliation?count=100&fields=id,isClosed,accountingPeriod(start),bankAccountClosingBalanceCurrency");

  // TEST B: Try with wrong balance on PUT
  console.log("\n=== TEST B: Check if wrong balance on PUT is rejected ===");
  // First, get the latest open recon
  const stateB = await api("GET", "bank/reconciliation?count=100&fields=id,isClosed,accountingPeriod(id,start)");
  const openRecon = (stateB.data?.values || []).find((r: any) => !r.isClosed);

  if (openRecon) {
    console.log("Open recon for test B:", openRecon.id, "period:", openRecon.accountingPeriod?.start);

    const getB = await api("GET", `bank/reconciliation/${openRecon.id}?fields=*`);
    const versionB = getB.data?.value?.version;

    await api("PUT", `bank/reconciliation/${openRecon.id}`, {
      id: openRecon.id,
      version: versionB,
      account: { id: ACCT_1920_ID },
      accountingPeriod: { id: openRecon.accountingPeriod?.id },
      type: "MANUAL",
      bankAccountClosingBalanceCurrency: 999999.99,
      isClosed: true,
    });
  }

  // FINAL STATE
  console.log("\n=== FINAL STATE ===");
  await api("GET", "bank/reconciliation?count=100&fields=id,isClosed,accountingPeriod(start),bankAccountClosingBalanceCurrency,closedDate");
}

main().catch(console.error);
