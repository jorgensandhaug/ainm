// Task 30: Test discovering the contra account for prepaid 1700
// Can we find what expense account the original prepaid was charged against?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers: H });
  const text = await r.text();
  if (!r.ok) {
    console.log(`${method} ${path} → ${r.status}: ${text.slice(0, 400)}`);
    return { ok: false, status: r.status, error: text };
  }
  return { ok: true, status: r.status, data: JSON.parse(text) };
}

async function main() {
  // Method 1: GET /ledger/posting to find all postings on account 1700
  console.log("=== Method 1: GET /ledger/posting for account 1700 ===\n");
  const r1 = await api("GET", "/ledger/posting?accountNumberFrom=1700&accountNumberTo=1700&dateFrom=2024-01-01&dateTo=2026-12-31&fields=*,account(id,number,name),voucher(id,description)&count=100");
  if (r1.ok) {
    console.log(`Found ${r1.data?.values?.length ?? 0} postings on 1700`);
    for (const p of r1.data?.values || []) {
      console.log(`  date=${p.date} amount=${p.amount} desc="${p.description}" voucher="${p.voucher?.description}" voucherId=${p.voucher?.id}`);
    }
  }

  // Method 2: For each voucher touching 1700, find ALL postings to discover contra
  console.log("\n\n=== Method 2: Discover contra accounts via voucher postings ===\n");
  const voucherIds = new Set<number>();
  for (const p of r1.data?.values || []) {
    if (p.voucher?.id) voucherIds.add(p.voucher.id);
  }
  for (const vid of voucherIds) {
    const vr = await api("GET", `/ledger/voucher/${vid}?fields=id,date,description,postings(id,account(id,number,name),amount,amountGross,description)`);
    if (vr.ok) {
      const v = vr.data?.value;
      console.log(`Voucher ${vid} (${v?.date} "${v?.description}"):`);
      for (const p of v?.postings || []) {
        console.log(`  ${p.account?.number} (${p.account?.name}): amount=${p.amount} desc="${p.description}"`);
      }
      // The contra is any non-1700 account in this voucher
      const contraAccts = (v?.postings || []).filter((p: any) => p.account?.number !== 1700);
      if (contraAccts.length > 0) {
        console.log(`  → Contra accounts: ${contraAccts.map((p: any) => `${p.account?.number} (${p.account?.name})`).join(", ")}`);
      }
    }
  }

  // Method 3: What if 1700 has a debit balance and we need to find the original debit?
  console.log("\n\n=== Method 3: Balance on 1700 ===\n");
  const bs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1700&accountNumberTo=1701&fields=*,account(id,number,name)");
  if (bs.ok) {
    for (const row of bs.data?.values || []) {
      console.log(`  ${row.account?.number} (${row.account?.name}): balanceIn=${row.balanceIn} balanceChange=${row.balanceChange} balanceOut=${row.balanceOut}`);
    }
  }

  // Method 4: Can we use GET /ledger/voucher to find vouchers with 1700 postings?
  console.log("\n\n=== Method 4: Search vouchers with 1700 via posting filter ===\n");
  const r4 = await api("GET", "/ledger/voucher?dateFrom=2025-01-01&dateTo=2026-01-01&fields=id,date,description,postings(id,account(id,number),amount)&count=50");
  if (r4.ok) {
    let found = 0;
    for (const v of r4.data?.values || []) {
      const has1700 = (v.postings || []).some((p: any) => p.account?.number === 1700);
      if (has1700) {
        found++;
        console.log(`  Voucher ${v.id} (${v.date} "${v.description}"):`);
        for (const p of v.postings || []) {
          console.log(`    ${p.account?.number}: amount=${p.amount}`);
        }
      }
    }
    console.log(`Found ${found} vouchers with 1700 postings`);
  }

  // Method 5: Check what the account 1700 name is in this environment
  console.log("\n\n=== Method 5: Account 1700 details ===\n");
  const acct = await api("GET", "/ledger/account?number=1700&fields=*");
  if (acct.ok) {
    const a = acct.data?.values?.[0];
    console.log(`Account 1700:`);
    for (const [k, v] of Object.entries(a || {}).sort()) {
      if (v !== null && v !== undefined && !['url', 'changes'].includes(k)) {
        console.log(`  ${k}: ${JSON.stringify(v)}`);
      }
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
