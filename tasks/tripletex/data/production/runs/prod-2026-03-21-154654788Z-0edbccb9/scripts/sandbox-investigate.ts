const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } });
  const text = await r.text();
  console.log(`${method} ${url} -> ${r.status}`);
  if (!r.ok) { console.log(`  ERROR: ${text}`); return null; }
  if (!text) return null;
  const json = JSON.parse(text);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // 1. Verify counterpart account IDs come from voucher posting expansion
  console.log("=== Voucher discovery with nested expansion ===");
  const vouchers: any[] = await api("GET",
    "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-02-28&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000"
  ) || [];

  console.log(`\nTotal vouchers: ${vouchers.length}`);

  // Show a sample to verify that account(id,number) is fully expanded
  if (vouchers.length > 0) {
    const v = vouchers[0];
    console.log(`\nSample voucher ${v.id} (${v.date}): ${v.description}`);
    for (const p of v.postings || []) {
      console.log(`  acct.id=${p.account?.id} acct.number=${p.account?.number} amount=${p.amount} gross=${p.amountGross} vatType.id=${p.vatType?.id} supplier.id=${p.supplier?.id}`);
    }
  }

  // Show all 7xxx postings and their vatType to understand vatType constraints
  console.log("\n=== All 7xxx postings and their vatTypes ===");
  for (const v of vouchers) {
    for (const p of v.postings || []) {
      const num = p.account?.number;
      if (num && num >= 7000 && num < 8000) {
        console.log(`  V${v.id} acct=${num} gross=${p.amountGross} vatType=${p.vatType?.id} desc="${p.description}"`);
      }
    }
  }

  // 2. Check which accounts have vatType locks
  console.log("\n=== Checking account vatType constraints ===");
  const accounts7xxx: any[] = await api("GET", "/ledger/account?number=7000,7100,7300&fields=id,number,name,vatType(id,name)") || [];
  for (const a of accounts7xxx) {
    console.log(`  ${a.number} "${a.name}" vatType=${JSON.stringify(a.vatType)}`);
  }

  // 3. Count how many unique account IDs we can get from just the voucher postings
  const acctIdsFromVouchers = new Map<number, number>();
  for (const v of vouchers) {
    for (const p of v.postings || []) {
      if (p.account?.id && p.account?.number) {
        acctIdsFromVouchers.set(p.account.number, p.account.id);
      }
    }
  }
  console.log("\n=== Account IDs available from voucher postings ===");
  for (const [num, id] of [...acctIdsFromVouchers.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${num} -> ${id}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
