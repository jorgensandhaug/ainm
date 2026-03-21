// Deep investigation: what do checks 4+5 actually check?
// Hypothesis 1: Wrong contra account for prepaid reversal
// Hypothesis 2: Missing result disposition (årsresultat → egenkapital)
// Hypothesis 3: Something about the opening balance on 1700

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
  if (!res.ok) {
    console.log(`${method} ${path} → ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    return null;
  }
  return data;
}

async function main() {
  // 1. Full details on account 1700
  console.log("=== Account 1700 full details ===");
  const acct1700 = await api("GET", "/ledger/account?number=1700&fields=*&count=10");
  if (acct1700?.values?.length) {
    const a = acct1700.values[0];
    console.log(JSON.stringify(a, null, 2));
  }

  // 2. Check what accounts exist in 1700-1799 range
  console.log("\n=== All accounts in 1700-1799 range ===");
  const accts1700s = await api("GET", "/ledger/account?from=1700&to=1799&fields=id,number,name&count=100");
  for (const a of accts1700s?.values || []) {
    console.log(`  ${a.number}: ${a.name}`);
  }

  // 3. Check what accounts exist in 6000-6999 range (expense accounts)
  console.log("\n=== All accounts in 6000-6999 range ===");
  const accts6000s = await api("GET", "/ledger/account?from=6000&to=6999&fields=id,number,name&count=100");
  for (const a of accts6000s?.values || []) {
    console.log(`  ${a.number}: ${a.name}`);
  }

  // 4. Check what accounts exist in 7000-7999 range
  console.log("\n=== All accounts in 7000-7999 range ===");
  const accts7000s = await api("GET", "/ledger/account?from=7000&to=7999&fields=id,number,name&count=100");
  for (const a of accts7000s?.values || []) {
    console.log(`  ${a.number}: ${a.name}`);
  }

  // 5. Check opening balance entries (voucher type 10 = opening balance)
  console.log("\n=== Opening balance vouchers ===");
  const obVouchers = await api("GET", "/ledger/voucher?dateFrom=2025-01-01&dateTo=2025-01-02&fields=id,date,description,number,voucherType(id,name),postings(id,row,account(id,number,name),amount,amountGross,amountGrossCurrency,description)&count=50");
  for (const v of obVouchers?.values || []) {
    console.log(`\nVoucher ${v.id} (${v.date}, "${v.description}", type=${v.voucherType?.name || 'unknown'}):`);
    for (const p of v.postings || []) {
      if (Math.abs(p.amount || 0) > 0) {
        console.log(`  row=${p.row} ${p.account?.number} (${p.account?.name}): amount=${p.amount} gross=${p.amountGross} desc="${p.description}"`);
      }
    }
  }

  // 6. Check what happens when we look at all postings on account 1700
  console.log("\n=== All postings on account 1700 ===");
  const postings1700 = await api("GET", "/ledger/posting?accountNumberFrom=1700&accountNumberTo=1700&dateFrom=2024-01-01&dateTo=2026-12-31&fields=id,date,amount,description,voucher(id,date,description,voucherType(id,name))&count=100");
  for (const p of postings1700?.values || []) {
    console.log(`  date=${p.date} amount=${p.amount} desc="${p.description}" voucher="${p.voucher?.description}" type=${p.voucher?.voucherType?.name || 'unknown'}`);
  }

  // 7. Check result disposition accounts (8800, 2050, etc.)
  console.log("\n=== Result disposition accounts ===");
  const resultAccts = await api("GET", "/ledger/account?number=8800,8900,8920,8960,2050,2080&fields=id,number,name&count=100");
  for (const a of resultAccts?.values || []) {
    console.log(`  ${a.number}: ${a.name} (id=${a.id})`);
  }

  // 8. Check what the full chart of accounts looks like for prepaid-related accounts
  console.log("\n=== Accounts related to 'forskudd' or 'forhåndsbetalt' ===");
  const forskudd = await api("GET", "/ledger/account?fields=id,number,name&count=1000");
  for (const a of forskudd?.values || []) {
    const name = (a.name || "").toLowerCase();
    if (name.includes("forskudd") || name.includes("forhånd") || name.includes("prepaid") || name.includes("periodis") || a.number === 1700) {
      console.log(`  ${a.number}: ${a.name}`);
    }
  }

  // 9. Check what a voucher looks like with full field expansion
  console.log("\n=== Voucher schema: post a test voucher and read back ALL fields ===");
  // First get account IDs
  const testAccts = await api("GET", "/ledger/account?number=6010,6300&fields=id,number,name&count=10");
  const acctMap: Record<number, number> = {};
  for (const a of testAccts?.values || []) acctMap[a.number] = a.id;

  if (acctMap[6010] && acctMap[6300]) {
    const testVoucher = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Test prepaid reversal",
      postings: [
        { row: 1, account: { id: acctMap[6300] }, amountGross: 1000, amountGrossCurrency: 1000, description: "Test debit" },
        { row: 2, account: { id: acctMap[6010] }, amountGross: -1000, amountGrossCurrency: -1000, description: "Test credit" },
      ],
    });
    if (testVoucher?.value?.id) {
      const fullVoucher = await api("GET", `/ledger/voucher/${testVoucher.value.id}?fields=*,postings(*,account(*))&count=100`);
      console.log(JSON.stringify(fullVoucher?.value, null, 2));
    }
  }

  // 10. Check the voucherType options available
  console.log("\n=== Available voucher types ===");
  const vTypes = await api("GET", "/ledger/voucherType?fields=id,name&count=100");
  for (const vt of vTypes?.values || []) {
    console.log(`  id=${vt.id}: ${vt.name}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
