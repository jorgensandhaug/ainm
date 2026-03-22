// Verify: are the Nov 2026 ledger postings from our salary transaction or from other sources?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method: "GET", headers: h });
  const json = await r.json();
  console.log(`GET ${path} → ${r.status}`);
  return json;
}

async function main() {
  // Get ALL ledger postings for November 2026 with full details
  const res = await api("GET", "/ledger/posting?dateFrom=2026-11-01&dateTo=2026-11-30&count=100&fields=*,account(number,name),voucher(id,number,voucherType(id,name))");
  const postings = res.values || [];

  console.log(`\nTotal postings in Nov 2026: ${postings.length}`);
  console.log(`\nAll postings with voucher details:`);
  for (const p of postings) {
    console.log(`  account=${p.account?.number} (${p.account?.name}), amount=${p.amount}, amountGross=${p.amountGross}, voucher=${p.voucher?.id} (type=${p.voucher?.voucherType?.name}, num=${p.voucher?.number})`);
  }

  // Group by voucher
  const byVoucher = new Map<string, any[]>();
  for (const p of postings) {
    const key = `${p.voucher?.id || 'none'}`;
    if (!byVoucher.has(key)) byVoucher.set(key, []);
    byVoucher.get(key)!.push(p);
  }

  console.log(`\nGrouped by voucher:`);
  for (const [key, posts] of byVoucher) {
    const vType = posts[0].voucher?.voucherType?.name || 'unknown';
    const vNum = posts[0].voucher?.number;
    console.log(`\n  Voucher id=${key}, type=${vType}, number=${vNum}:`);
    for (const p of posts) {
      console.log(`    account ${p.account?.number}: amount=${p.amount}, amountGross=${p.amountGross}`);
    }
  }

  // Check: did POST /salary/transaction create a voucher automatically?
  const salaryVouchers = [...byVoucher.entries()].filter(([_, posts]) =>
    posts[0].voucher?.voucherType?.name?.includes('ønn') || posts[0].voucher?.voucherType?.name?.includes('Salary')
  );
  console.log(`\n=== SALARY-TYPE VOUCHERS ===`);
  console.log(`Found ${salaryVouchers.length} vouchers with salary-related types`);
  for (const [key, posts] of salaryVouchers) {
    console.log(`  Voucher ${key}: type=${posts[0].voucher?.voucherType?.name}, postings=${posts.length}`);
  }

  // Also check: our payslip (id=32630455) and transaction (id=6959437)
  const txRes = await api("GET", "/salary/transaction/6959437?fields=*");
  console.log(`\nTransaction 6959437:`, JSON.stringify(txRes.value, null, 2));

  const psRes = await api("GET", "/salary/payslip/32630455?fields=*");
  console.log(`\nPayslip 32630455 voucher:`, JSON.stringify(psRes.value?.voucher));
  console.log(`Payslip 32630455 compilation:`, JSON.stringify(psRes.value?.compilation));
}

main().catch(e => { console.error(e); process.exit(1); });
