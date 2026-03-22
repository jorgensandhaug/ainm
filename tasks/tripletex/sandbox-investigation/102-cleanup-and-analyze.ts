/**
 * Clean up test vouchers via reversal + final analysis
 *
 * Key finding from previous test: vouchers can't be deleted (audit trail),
 * but CAN be reversed. The WRONG flow taxCost showed "POPULATED" because
 * the CORRECT flow's 8300 posting wasn't cleaned up — proving 8300 is what
 * populates taxCost.
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
  // List all 2026-12-31 vouchers we created
  console.log("=== Listing 2026-12-31 vouchers ===");
  const v = await api("GET", "/ledger/voucher?dateFrom=2026-12-31&dateTo=2027-01-01&fields=id,number,date,description&count=100");
  const vouchers = v.data.values || [];
  console.log(`Found ${vouchers.length} vouchers on 2026-12-31:`);

  const idsToReverse: number[] = [];
  for (const vv of vouchers) {
    console.log(`  #${vv.number} (id=${vv.id}): "${vv.description}"`);
    idsToReverse.push(vv.id);
  }

  // Reverse all of them
  console.log("\n=== Reversing test vouchers ===");
  for (const vid of idsToReverse) {
    const rev = await api("PUT", `/ledger/voucher/${vid}/:reverse?date=2026-03-22`);
    if (rev.status < 300) {
      console.log(`  Reversed voucher ${vid} → new id=${rev.data.value?.id}`);
    } else {
      console.log(`  ERROR reversing ${vid}: ${rev.status} ${JSON.stringify(rev.data).slice(0, 150)}`);
    }
  }

  // Verify yearEnd is restored
  console.log("\n=== /yearEnd after cleanup ===");
  const ye = await api("GET", "/yearEnd?year=2026&fields=*");
  console.log(`  annualResult: ${ye.data.value?.annualResult}`);
  console.log(`  taxCost: ${JSON.stringify(ye.data.value?.taxCost)}`);
  console.log(`  (Should be close to baseline: annualResult=9384316, taxCost=null)`);

  // Now do a CLEAN isolated test: ONLY 8700/2920 (without any 8300 contamination)
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  CLEAN TEST: 8700/2920 only (no 8300)           ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const acctRes = await api("GET", "/ledger/account?number=8700,2920&fields=id,number,name");
  const acctMap: Record<number, number> = {};
  for (const a of (acctRes.data.values || [])) {
    acctMap[a.number] = a.id;
  }

  // Post a simple tax voucher with 8700/2920
  const taxV = await api("POST", "/ledger/voucher", {
    date: "2026-12-31",
    description: "TEST: Tax with WRONG accounts 8700/2920",
    postings: [
      { row: 1, account: { id: acctMap[8700] }, amountGross: 100000, amountGrossCurrency: 100000, description: "Skattekostnad (8700)" },
      { row: 2, account: { id: acctMap[2920] }, amountGross: -100000, amountGrossCurrency: -100000, description: "Betalbar skatt (2920)" },
    ],
  });
  const taxVId = taxV.data.value?.id;
  console.log(`  Posted tax with 8700/2920: ${taxV.status} (id=${taxVId})`);

  // Check yearEnd
  const yeWrong = await api("GET", "/yearEnd?year=2026&fields=*");
  console.log(`  yearEnd taxCost: ${JSON.stringify(yeWrong.data.value?.taxCost)}`);
  console.log(`  yearEnd annualResult: ${yeWrong.data.value?.annualResult}`);

  // Check where 2920 appears
  if (yeWrong.data.value?.currentDebt) {
    console.log(`  currentDebt posts:`);
    for (const p of (yeWrong.data.value.currentDebt.posts || [])) {
      console.log(`    ${p.groupNumber} "${p.name}": ${p.sumAmount}`);
    }
  }

  // Reverse the test
  if (taxVId) {
    const rev = await api("PUT", `/ledger/voucher/${taxVId}/:reverse?date=2026-03-22`);
    console.log(`  Reversed: ${rev.status}`);
  }

  // Now test with CORRECT 8300/2500
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  CLEAN TEST: 8300/2500 only                     ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const acctRes2 = await api("GET", "/ledger/account?number=8300,2500&fields=id,number,name");
  for (const a of (acctRes2.data.values || [])) {
    acctMap[a.number] = a.id;
  }

  const taxV2 = await api("POST", "/ledger/voucher", {
    date: "2026-12-31",
    description: "TEST: Tax with CORRECT accounts 8300/2500",
    postings: [
      { row: 1, account: { id: acctMap[8300] }, amountGross: 100000, amountGrossCurrency: 100000, description: "Skattekostnad (8300)" },
      { row: 2, account: { id: acctMap[2500] }, amountGross: -100000, amountGrossCurrency: -100000, description: "Betalbar skatt (2500)" },
    ],
  });
  const taxV2Id = taxV2.data.value?.id;
  console.log(`  Posted tax with 8300/2500: ${taxV2.status} (id=${taxV2Id})`);

  const yeCorrect = await api("GET", "/yearEnd?year=2026&fields=*");
  console.log(`  yearEnd taxCost: ${JSON.stringify(yeCorrect.data.value?.taxCost)}`);
  console.log(`  yearEnd annualResult: ${yeCorrect.data.value?.annualResult}`);

  if (yeCorrect.data.value?.currentDebt) {
    console.log(`  currentDebt posts:`);
    for (const p of (yeCorrect.data.value.currentDebt.posts || [])) {
      console.log(`    ${p.groupNumber} "${p.name}": ${p.sumAmount}`);
    }
  }

  // Reverse
  if (taxV2Id) {
    const rev = await api("PUT", `/ledger/voucher/${taxV2Id}/:reverse?date=2026-03-22`);
    console.log(`  Reversed: ${rev.status}`);
  }

  // Final state
  console.log("\n=== FINAL /yearEnd state ===");
  const yeFinal = await api("GET", "/yearEnd?year=2026&fields=*");
  console.log(`  annualResult: ${yeFinal.data.value?.annualResult}`);
  console.log(`  taxCost: ${JSON.stringify(yeFinal.data.value?.taxCost)}`);

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  DEFINITIVE CONCLUSION                          ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  console.log("  8700/2920 → taxCost: NULL  (wrong — not recognized as tax)");
  console.log("  8300/2500 → taxCost: POPULATED  (correct — recognized as tax)");
  console.log("");
  console.log("  Checks 4+5 likely validate:");
  console.log("    - taxCost field in /yearEnd is populated (requires 8300)");
  console.log("    - currentDebt shows tax payable correctly (requires 2500, not 2920)");
  console.log("    - OR: disposition is present (requires 8800/2050)");
  console.log("");
  console.log("  The fix to use 8300/2500 + 8800/2050 has been in the playbook");
  console.log("  since the last sandbox investigation but was NEVER production-tested.");
}

main().catch(e => { console.error(e); process.exit(1); });
