// Task 30 investigation: Verify year-end closing bugs
// Bug 1: Is 6300 the right contra for 1700 prepaid? Check what postings exist on 1700.
// Bug 2: Does the tax calc need post-voucher balance sheet? Test post-then-read approach.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) {
    console.log(`${method} ${path} → ${r.status}: ${text.slice(0, 400)}`);
    return { ok: false, status: r.status, error: text };
  }
  return { ok: true, status: r.status, data: JSON.parse(text) };
}

async function main() {
  console.log("========== INVESTIGATION 1: What's on account 1700? ==========\n");

  // Check if account 1700 exists and what its name is
  const acct1700 = await api("GET", "/ledger/account?number=1700&fields=id,number,name");
  console.log("Account 1700:", JSON.stringify(acct1700.data?.values?.[0]));

  // Check if there are any existing postings on 1700
  const postings1700 = await api("GET", "/ledger/posting?accountNumberFrom=1700&accountNumberTo=1700&dateFrom=2025-01-01&dateTo=2026-01-01&fields=*,account(id,number),voucher(id,description)&count=100");
  console.log(`\nPostings on 1700 in 2025: ${postings1700.data?.values?.length ?? 0} entries`);
  for (const p of postings1700.data?.values || []) {
    console.log(`  date=${p.date} amount=${p.amount} amountGross=${p.amountGross} desc="${p.description}" voucher="${p.voucher?.description}" acct=${p.account?.number}`);
  }

  // Also check: what expense accounts have balances that could be the contra for 1700?
  // Look at the original voucher that debited 1700 — what was the contra account?
  if (postings1700.data?.values?.length > 0) {
    const voucherIds = [...new Set(postings1700.data.values.map((p: any) => p.voucher?.id).filter(Boolean))];
    console.log(`\nVoucher IDs touching 1700: ${voucherIds}`);
    for (const vid of voucherIds) {
      const vr = await api("GET", `/ledger/voucher/${vid}?fields=id,description,postings(id,account(id,number,name),amount,amountGross,description)`);
      console.log(`\nVoucher ${vid} (${vr.data?.value?.description}):`);
      for (const p of vr.data?.value?.postings || []) {
        console.log(`  acct=${p.account?.number} (${p.account?.name}) amount=${p.amount} amountGross=${p.amountGross} desc="${p.description}"`);
      }
    }
  }

  console.log("\n\n========== INVESTIGATION 2: Balance sheet check ==========\n");

  // Read balance sheet for 2025 (revenue + expenses before tax)
  const bs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000");
  console.log(`Balance sheet entries (3000-8699): ${bs.data?.values?.length ?? 0}`);
  let totalBalanceOut = 0;
  for (const row of bs.data?.values || []) {
    const num = row.account?.number;
    const bal = row.balanceOut;
    if (bal !== 0) {
      console.log(`  ${num} (${row.account?.name}): balanceOut=${bal}`);
    }
    totalBalanceOut += bal;
  }
  console.log(`\n  Total balanceOut: ${totalBalanceOut}`);
  console.log(`  Pre-tax profit (negated sum): ${-totalBalanceOut}`);

  // Check if prepaid (1700) is in the balance sheet
  const bs1700 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1700&accountNumberTo=1701&fields=*,account(id,number,name)");
  console.log(`\nBalance on 1700: ${JSON.stringify(bs1700.data?.values?.[0])}`);

  console.log("\n\n========== INVESTIGATION 3: Check if posting-then-reading approach works ==========\n");

  // The hypothesis: instead of manually adjusting the balance sheet sum for planned depreciation/prepaid,
  // we should POST the dep/prepaid vouchers FIRST, then read the balance sheet, then compute tax.
  // Let's see what the balance sheet looks like for a fresh sandbox.

  // Check all account ranges to understand the full picture
  const bsFull = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1000&accountNumberTo=9999&fields=*,account(id,number,name)&count=2000");
  console.log(`Full balance sheet entries: ${bsFull.data?.values?.length ?? 0}`);
  let assetTotal = 0, liabTotal = 0, revExpTotal = 0;
  for (const row of bsFull.data?.values || []) {
    const num = row.account?.number;
    const bal = row.balanceOut;
    if (bal === 0) continue;
    if (num < 2000) assetTotal += bal;
    else if (num < 3000) liabTotal += bal;
    else revExpTotal += bal;
  }
  console.log(`  Assets (1xxx): ${assetTotal}`);
  console.log(`  Liabilities (2xxx): ${liabTotal}`);
  console.log(`  Revenue+Expenses (3xxx-8xxx): ${revExpTotal}`);

  // Check if /ledger/posting endpoint supports querying by account to find contra accounts
  console.log("\n\n========== INVESTIGATION 4: Can we find contra accounts via /ledger/posting? ==========\n");
  const postingEndpoint = await api("GET", "/ledger/posting?accountNumberFrom=1700&accountNumberTo=1700&dateFrom=2024-01-01&dateTo=2026-01-01&fields=id,date,amount,account(id,number),voucher(id)&count=20");
  console.log(`Posting results for 1700: ${postingEndpoint.ok ? 'OK' : 'FAILED'} (${postingEndpoint.data?.values?.length ?? 0} entries)`);
  if (!postingEndpoint.ok) {
    console.log(`  Error: ${postingEndpoint.error?.slice(0, 200)}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
