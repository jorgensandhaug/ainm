/**
 * Investigate sandbox reset options:
 * 1. Check for Tripletex test company reset API
 * 2. List all 2025 vouchers to understand the pollution
 * 3. Try reversal of 2025 vouchers
 * 4. Check if we can use a clean 2026 year for testing
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
  // 1. Check for reset/test company APIs
  console.log("=== Check for reset APIs ===");
  const resetEndpoints = [
    "/company/resetTestCompany",
    "/testCompany/reset",
    "/company/reset",
    "/sandbox/reset",
  ];
  for (const ep of resetEndpoints) {
    const r = await api("PUT", ep);
    console.log(`  PUT ${ep}: ${r.status} ${JSON.stringify(r.data).slice(0, 150)}`);
  }

  // 2. List ALL 2025 vouchers (use dateTo=2026-01-01 for exclusive end)
  console.log("\n=== All 2025 vouchers ===");
  const v2025 = await api("GET", "/ledger/voucher?dateFrom=2025-01-01&dateTo=2026-01-01&fields=id,number,date,description&count=1000");
  const vouchers = v2025.data.values || [];
  console.log(`Total 2025 vouchers: ${vouchers.length}`);

  // Group by description pattern
  const groups: Record<string, { count: number; ids: number[]; examples: string[] }> = {};
  for (const v of vouchers) {
    const desc = (v.description || "").replace(/\d+/g, "N");
    if (!groups[desc]) groups[desc] = { count: 0, ids: [], examples: [] };
    groups[desc].count++;
    groups[desc].ids.push(v.id);
    if (groups[desc].examples.length < 2) groups[desc].examples.push(`#${v.number}: ${v.description} (id=${v.id})`);
  }
  for (const [pattern, group] of Object.entries(groups).sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  [${group.count}x] "${pattern}"`);
    for (const ex of group.examples) console.log(`    ${ex}`);
  }

  // 3. Check 2026 vouchers
  console.log("\n=== All 2026 vouchers ===");
  const v2026 = await api("GET", "/ledger/voucher?dateFrom=2026-01-01&dateTo=2027-01-01&fields=id,number,date,description&count=1000");
  const vouchers2026 = v2026.data.values || [];
  console.log(`Total 2026 vouchers: ${vouchers2026.length}`);
  for (const v of vouchers2026.slice(0, 20)) {
    console.log(`  #${v.number} (${v.date}): "${v.description}" (id=${v.id})`);
  }

  // 4. Check the balance sheet for 2026 (clean year?)
  console.log("\n=== Balance sheet for 2026 (P&L: 3000-8999) ===");
  const bs2026 = await api("GET", "/balanceSheet?dateFrom=2026-01-01&dateTo=2027-01-01&accountNumberFrom=3000&accountNumberTo=8999&fields=*,account(number,name)&count=1000");
  let sum2026 = 0;
  for (const r of (bs2026.data.values || [])) {
    if (Math.abs(r.balanceOut || 0) > 0.01) {
      sum2026 += r.balanceOut;
      console.log(`  ${r.account?.number} "${r.account?.name}": ${r.balanceOut}`);
    }
  }
  console.log(`  Total: ${sum2026.toFixed(2)} (profit: ${(-sum2026).toFixed(2)})`);

  // 5. Check /yearEnd for 2026
  console.log("\n=== /yearEnd for 2026 ===");
  // The yearEnd API might need a year parameter
  const ye2026 = await api("GET", "/yearEnd?year=2026&fields=*");
  console.log(`  Status: ${ye2026.status}`);
  if (ye2026.status < 400) {
    console.log(`  year: ${ye2026.data.value?.year}`);
    console.log(`  annualResult: ${ye2026.data.value?.annualResult}`);
    console.log(`  status: ${ye2026.data.value?.status}`);
  } else {
    console.log(`  ${JSON.stringify(ye2026.data).slice(0, 200)}`);
  }

  // 6. Check what fiscal years are configured
  console.log("\n=== Company info ===");
  const company = await api("GET", "/company?fields=*");
  if (company.status < 400) {
    const c = company.data.value;
    console.log(`  name: ${c?.name}`);
    console.log(`  type: ${c?.type}`);
    console.log(`  accountingPeriod: ${JSON.stringify(c?.accountingPeriod)}`);
  }

  // 7. Try to understand the voucher date constraints
  console.log("\n=== Voucher date constraints ===");
  // Can we create a voucher on 2025-12-31 and delete it?
  const testAcct = await api("GET", "/ledger/account?number=6010&fields=id");
  const acctId = testAcct.data.values?.[0]?.id;
  const acct2 = await api("GET", "/ledger/account?number=1209&fields=id");
  const acctId2 = acct2.data.values?.[0]?.id;

  if (acctId && acctId2) {
    // Try 2026-12-31 voucher
    console.log("\n  Testing 2026-12-31 voucher (create + delete)...");
    const v = await api("POST", "/ledger/voucher", {
      date: "2026-12-31",
      description: "TEST DELETE ME",
      postings: [
        { row: 1, account: { id: acctId }, amountGross: 100, amountGrossCurrency: 100, description: "test" },
        { row: 2, account: { id: acctId2 }, amountGross: -100, amountGrossCurrency: -100, description: "test" },
      ],
    });
    console.log(`  Create: ${v.status} (id=${v.data.value?.id})`);
    if (v.data.value?.id) {
      const del = await api("DELETE", `/ledger/voucher/${v.data.value.id}`);
      console.log(`  Delete: ${del.status}`);
    }

    // Try reversing a 2025 voucher
    console.log("\n  Testing 2025 voucher reversal...");
    // Pick the first non-baseline 2025 voucher
    if (vouchers.length > 0) {
      // Find a test voucher (one of our depreciation vouchers)
      const testV = vouchers.find((v: any) => v.description?.includes("Avskrivning") || v.description?.includes("TEST"));
      if (testV) {
        console.log(`  Trying to reverse voucher #${testV.number} (${testV.description}), id=${testV.id}`);
        const rev = await api("PUT", `/ledger/voucher/${testV.id}/:reverse?date=2026-03-22`);
        console.log(`  Reverse: ${rev.status}`);
        if (rev.status < 300) {
          console.log(`  Reverse voucher created: ${JSON.stringify(rev.data.value?.id || rev.data.value)}`);
        } else {
          console.log(`  ${JSON.stringify(rev.data).slice(0, 200)}`);
        }
      }
    }
  }

  // 8. Check baseline voucher IDs to know which are "original"
  console.log("\n=== Baseline voucher check ===");
  // Read the baseline file to know which voucher IDs are original
  const baselineFile = Bun.file("data/sandbox-baseline.json");
  const baseline = await baselineFile.json();
  const baselineVoucherIds = new Set(baseline.resources.vouchers as number[]);
  console.log(`Baseline voucher count: ${baselineVoucherIds.size}`);

  // Find non-baseline vouchers in 2025
  const nonBaselineVouchers = vouchers.filter((v: any) => !baselineVoucherIds.has(v.id));
  console.log(`Non-baseline 2025 vouchers: ${nonBaselineVouchers.length}`);
  for (const v of nonBaselineVouchers.slice(0, 30)) {
    console.log(`  #${v.number} (${v.date}): "${v.description}" id=${v.id}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
