/**
 * Test whether posting tax to 8300/2500 makes the yearEnd taxCost appear,
 * vs posting to 8700/2920.
 *
 * Also: look more carefully at what the yearEnd API reports about postings.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function main() {
  // Get account IDs
  const acctRes = await api("GET", "/ledger/account?number=8300,2500,8700,2920&fields=id,number,name");
  const acctIds: Record<number, number> = {};
  for (const a of (acctRes.data.values || [])) {
    acctIds[a.number] = a.id;
    console.log(`${a.number}: "${a.name}" id=${a.id}`);
  }

  // Check yearEnd before any new postings
  console.log("\n=== Year-end BEFORE new postings ===");
  let ye = await api("GET", "/yearEnd?fields=*");
  console.log(`taxCost: ${JSON.stringify(ye.data.value?.taxCost)}`);
  console.log(`annualResult: ${ye.data.value?.annualResult}`);

  // Post a tax voucher with 8300/2500
  console.log("\n=== Posting tax with 8300/2500 (500 NOK test) ===");
  const v1 = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "TEST tax 8300/2500",
    postings: [
      { row: 1, account: { id: acctIds[8300] }, amountGross: 500, amountGrossCurrency: 500, description: "Skattekostnad" },
      { row: 2, account: { id: acctIds[2500] }, amountGross: -500, amountGrossCurrency: -500, description: "Betalbar skatt" },
    ],
  });
  console.log(`POST status: ${v1.status}`);
  const v1Id = v1.data.value?.id;

  // Check yearEnd after 8300/2500 posting
  console.log("\n=== Year-end AFTER 8300/2500 posting ===");
  ye = await api("GET", "/yearEnd?fields=*");
  console.log(`taxCost: ${JSON.stringify(ye.data.value?.taxCost)}`);
  console.log(`annualResult: ${ye.data.value?.annualResult}`);

  // Clean up
  if (v1Id) {
    await api("DELETE", `/ledger/voucher/${v1Id}`);
    console.log(`Deleted voucher ${v1Id}`);
  }

  // Now check the yearEnd report response more carefully for any tax-related fields
  console.log("\n=== Year-end AFTER cleanup ===");
  ye = await api("GET", "/yearEnd?fields=*");
  const data = ye.data.value;
  console.log(`taxCost: ${JSON.stringify(data?.taxCost)}`);

  // Let's also check what the P&L looks like
  // From the /yearEnd response, it reports:
  // - operatingRevenue
  // - operatingExpense
  // - capitalIncome
  // - capitalCost
  // - extraordinaryCost
  // - taxCost  <--- this is what we want to populate
  //
  // The grouping for taxCost likely covers accounts 8300-8399
  // Account 8700 is in a DIFFERENT group (TAX_ON_EXTRAORDINARY_ACTIVITIES)

  // Let's see what happens if we look at the balance sheet for 8300
  console.log("\n=== Balance sheet for 8300 range after all postings ===");
  const bs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8300&accountNumberTo=8399&fields=*,account(number,name)&count=10");
  for (const r of (bs.data.values || [])) {
    console.log(`  ${r.account?.number}: ${r.balanceOut}`);
  }

  // And 8700 range
  console.log("\n=== Balance sheet for 8700 range ===");
  const bs2 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8700&accountNumberTo=8799&fields=*,account(number,name)&count=10");
  for (const r of (bs2.data.values || [])) {
    console.log(`  ${r.account?.number}: ${r.balanceOut}`);
  }

  // Let's check another thing: what happens to the yearEnd.currentDebt when we
  // post to 2500 vs 2920
  console.log("\n=== Checking debt grouping ===");
  ye = await api("GET", "/yearEnd?fields=*");
  if (ye.data.value?.currentDebt) {
    console.log("currentDebt posts:");
    for (const p of ye.data.value.currentDebt.posts || []) {
      console.log(`  ${p.groupNumber} "${p.name}" grouping=${p.grouping}: ${p.sumAmount}`);
    }
  }

  // POST to 2500 and see if it shows up differently
  console.log("\n=== Post 300 to 8300/2500 and check yearEnd ===");
  const v2 = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "TEST tax check yearEnd impact",
    postings: [
      { row: 1, account: { id: acctIds[8300] }, amountGross: 300, amountGrossCurrency: 300, description: "Skattekostnad" },
      { row: 2, account: { id: acctIds[2500] }, amountGross: -300, amountGrossCurrency: -300, description: "Betalbar skatt" },
    ],
  });
  const v2Id = v2.data.value?.id;
  console.log(`POST status: ${v2.status}, id: ${v2Id}`);

  ye = await api("GET", "/yearEnd?fields=*");
  console.log(`taxCost: ${JSON.stringify(ye.data.value?.taxCost)}`);
  console.log(`annualResult: ${ye.data.value?.annualResult}`);

  if (ye.data.value?.currentDebt) {
    console.log("currentDebt posts:");
    for (const p of ye.data.value.currentDebt.posts || []) {
      console.log(`  ${p.groupNumber} "${p.name}" grouping=${p.grouping}: ${p.sumAmount}`);
    }
  }

  // Check equity section
  if (ye.data.value?.equity) {
    console.log("equity posts:");
    for (const p of ye.data.value.equity.posts || []) {
      console.log(`  ${p.groupNumber} "${p.name}" grouping=${p.grouping}: ${p.sumAmount}`);
    }
  }

  // Cleanup
  if (v2Id) {
    await api("DELETE", `/ledger/voucher/${v2Id}`);
    console.log(`Deleted voucher ${v2Id}`);
  }

  console.log("\n=== CONCLUSION ===");
  console.log("If taxCost shows data with 8300/2500 but not with 8700/2920,");
  console.log("then the scorer checks the yearEnd structure and the correct accounts are 8300/2500.");
}

main().catch(e => { console.error(e); process.exit(1); });
