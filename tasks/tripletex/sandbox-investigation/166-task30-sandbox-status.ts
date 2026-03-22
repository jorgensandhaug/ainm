/**
 * Check sandbox state for task 30 year-end: existing vouchers, yearEnd API, accounts.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function main() {
  // 1. Check all vouchers with date 2025-12-31
  console.log("=== Vouchers on 2025-12-31 ===");
  const v = await api("GET", "/ledger/voucher?dateFrom=2025-12-31&dateTo=2025-12-31&fields=id,number,date,description&count=100");
  if (v.data.values?.length) {
    for (const voucher of v.data.values) {
      console.log(`  id=${voucher.id} #${voucher.number} "${voucher.description}"`);
    }
    console.log(`  Total: ${v.data.values.length} vouchers`);
  } else {
    console.log("  No vouchers found");
  }

  // 2. Check yearEnd API
  console.log("\n=== Year-end API ===");
  const ye = await api("GET", "/yearEnd?fields=*");
  if (ye.status < 400) {
    const d = ye.data.value;
    console.log(`  annualResult: ${d.annualResult}`);
    console.log(`  taxCost: ${JSON.stringify(d.taxCost)}`);
    console.log(`  sentDate: ${d.sentDate}`);
    // Check equity / disposition
    if (d.equity) {
      console.log("  equity posts:");
      for (const p of d.equity.posts || []) {
        console.log(`    ${p.groupNumber} "${p.name}" grouping=${p.grouping}: ${p.sumAmount}`);
      }
    }
    if (d.currentDebt) {
      console.log("  currentDebt posts:");
      for (const p of d.currentDebt.posts || []) {
        console.log(`    ${p.groupNumber} "${p.name}" grouping=${p.grouping}: ${p.sumAmount}`);
      }
    }
  }

  // 3. Check relevant accounts
  console.log("\n=== Key accounts ===");
  const accts = await api("GET", "/ledger/account?number=1209,6010,1700,6300,7500,8300,2500,8800,2050,8700,2920&fields=id,number,name,type");
  for (const a of (accts.data.values || [])) {
    console.log(`  ${a.number}: "${a.name}" type=${a.type} id=${a.id}`);
  }

  // 4. Check balance sheet 3000-8299 (pre-tax P&L)
  console.log("\n=== Balance sheet 3000-8299 (pre-tax P&L) ===");
  const bs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(number,name)&count=1000");
  let sum = 0;
  for (const r of (bs.data.values || [])) {
    if (Math.abs(r.balanceOut) > 0.01) {
      console.log(`  ${r.account?.number} "${r.account?.name}": ${r.balanceOut}`);
      sum += r.balanceOut;
    }
  }
  console.log(`  Sum: ${sum}, preTaxProfit: ${-sum}`);

  // 5. Check if any vouchers can be deleted (not locked)
  console.log("\n=== Check if vouchers are deletable ===");
  if (v.data.values?.length) {
    // Try to get more info on first voucher
    const first = v.data.values[0];
    const detail = await api("GET", `/ledger/voucher/${first.id}?fields=*,postings(*,account(number,name))`);
    console.log(`  First voucher detail: ${JSON.stringify(detail.data.value, null, 2).slice(0, 500)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
