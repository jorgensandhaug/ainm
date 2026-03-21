const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) {
    console.error(`HTTP ${r.status}: ${text}`);
    return null;
  }
  return JSON.parse(text);
}

// Step 1: Check what accounts exist in sandbox
const acctRes = await api("GET", "/ledger/account?number=7140,7100,6540,4500,2710,6860&fields=id,number");
if (acctRes) {
  console.log("Accounts found:", JSON.stringify(acctRes.values));
}

// Step 2: Check existing vouchers
const vRes = await api("GET",
  "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01" +
  "&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)" +
  "&count=1000"
);
if (vRes) {
  console.log(`Found ${vRes.values.length} vouchers`);
  for (const v of vRes.values) {
    console.log(`  Voucher ${v.id} (${v.date}): "${v.description}"`);
    for (const p of v.postings) {
      console.log(`    Posting: acct=${p.account?.number}, gross=${p.amountGross}, net=${p.amount}, vatType=${p.vatType?.id}, supplier=${p.supplier?.id}`);
    }
  }
}
