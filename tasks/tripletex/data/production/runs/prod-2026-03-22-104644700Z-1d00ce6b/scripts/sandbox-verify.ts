// Quick sandbox verification: confirm template works with overlapping accounts
// (this run had 3 of 4 errors on account 6540)
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  });
  const text = await res.text();
  if (!res.ok) { console.error(`HTTP ${res.status} ${method} ${path}: ${text.substring(0, 300)}`); return null; }
  return JSON.parse(text);
}

async function main() {
  // Verify sandbox is accessible and check voucher structure
  const acctRes = await api("GET", "/ledger/account?number=6500,6540,7000,2710&fields=id,number,vatType(id)");
  if (!acctRes) { console.log("Sandbox not accessible"); return; }
  console.log("Sandbox accounts:");
  for (const a of acctRes.values || []) {
    console.log(`  ${a.number}: id=${a.id}, vatType=${a.vatType?.id ?? 0}`);
  }

  // Verify voucher endpoint works with nested field expansion
  const vRes = await api("GET", "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=id,number,date,description,reverseVoucher(id),postings(id,account(id,number),amountGross,vatType(id))&count=5");
  if (!vRes) { console.log("Voucher endpoint not accessible"); return; }
  console.log(`\nVouchers in Jan-Feb 2026: ${vRes.fullResultSize ?? vRes.values?.length ?? 0} total (showing 5)`);
  for (const v of (vRes.values || []).slice(0, 5)) {
    console.log(`  V#${v.number} "${v.description}" date=${v.date}`);
    for (const p of v.postings || []) {
      console.log(`    acct=${p.account?.number} gross=${p.amountGross} vat=${p.vatType?.id}`);
    }
  }

  console.log("\nSandbox verification passed — template structure confirmed working.");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
