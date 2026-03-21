// Explore /yearEnd/annualAccounts and the year-end module in detail

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.log("  ERROR:", JSON.stringify(data).slice(0, 500));
  }
  return { ok: res.ok, data, status: res.status };
}

async function main() {
  // 1. Annual accounts
  console.log("=== GET /yearEnd/annualAccounts ===");
  const aa = await api("GET", "/yearEnd/annualAccounts?fields=*&count=1000");
  if (aa.ok) {
    const str = JSON.stringify(aa.data, null, 2);
    console.log(str.slice(0, 3000));
    if (str.length > 3000) console.log("... (truncated, total length:", str.length, ")");
  }

  // 2. Year-end with full fields
  console.log("\n=== GET /yearEnd with full fields ===");
  const ye = await api("GET", "/yearEnd?fields=*");
  if (ye.ok) {
    const str = JSON.stringify(ye.data, null, 2);
    console.log(str.slice(0, 3000));
    if (str.length > 3000) console.log("... (truncated)");
  }

  // 3. Check /ledger/closeGroup properly
  console.log("\n=== GET /ledger/closeGroup for 2025 ===");
  const cg = await api("GET", "/ledger/closeGroup?dateFrom=2025-01-01&dateTo=2025-12-31&fields=*&count=100");
  if (cg.ok) {
    const str = JSON.stringify(cg.data, null, 2);
    console.log(str.slice(0, 2000));
  }

  // 4. Look at what vouchers exist on 2025-12-31
  console.log("\n=== Vouchers on 2025-12-31 ===");
  const v = await api("GET", "/ledger/voucher?dateFrom=2025-12-31&dateTo=2025-12-31&fields=id,date,description,number,voucherType(id,name)&count=50");
  if (v.ok) {
    for (const voucher of v.data?.values || []) {
      console.log(`  #${voucher.number} id=${voucher.id} "${voucher.description}" type=${voucher.voucherType?.name || 'none'}`);
    }
  }

  // 5. Let's look at the opening balance for the WHOLE chart of accounts
  console.log("\n=== Opening balance (Jan 1) for key accounts ===");
  const ob = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2025-01-02&accountNumberFrom=1000&accountNumberTo=9999&fields=*,account(id,number,name)&count=1000");
  if (ob.ok) {
    for (const row of ob.data?.values || []) {
      if ((row.balanceIn || 0) !== 0 || (row.balanceOut || 0) !== 0) {
        console.log(`  ${row.account?.number} (${row.account?.name}): balIn=${row.balanceIn} balOut=${row.balanceOut}`);
      }
    }
  }

  // 6. Check if production tasks might have an opening balance voucher
  // In production, the fresh Tripletex has pre-populated opening balances
  // Let's look for Åpningsbalanse vouchers
  console.log("\n=== Åpningsbalanse (opening balance) vouchers ===");
  const obv = await api("GET", "/ledger/voucher?dateFrom=2024-01-01&dateTo=2025-01-02&fields=id,date,description,number,voucherType(id,name),postings(account(number,name),amount)&count=10");
  if (obv.ok) {
    for (const voucher of obv.data?.values || []) {
      console.log(`\n  Voucher #${voucher.number} id=${voucher.id} "${voucher.description}" type=${voucher.voucherType?.name || 'none'}`);
      for (const p of voucher.postings || []) {
        if (Math.abs(p.amount || 0) > 0) {
          console.log(`    ${p.account?.number} (${p.account?.name}): ${p.amount}`);
        }
      }
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
