// Test: can we use account.number instead of account.id on voucher postings?
// Also test: can we hardcode vatType.id=1 safely?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n=== ${method} ${path} => ${res.status} ===`);
  if (res.status >= 400) {
    console.log("ERROR:", JSON.stringify(json, null, 2).substring(0, 500));
  }
  return { status: res.status, json };
}

async function main() {
  // Test 1: Use account.number instead of account.id
  console.log("\n--- TEST 1: account.number on voucher posting ---");
  const voucherNumber = {
    date: "2026-02-22",
    description: "Kontorstoler number-test",
    postings: [
      {
        row: 1,
        date: "2026-02-22",
        description: "Kontorstoler",
        account: { number: 6540 },
        department: { id: 927069 },
        vatType: { id: 1 },
        amountGross: 13500,
        amountGrossCurrency: 13500,
      },
      {
        row: 2,
        date: "2026-02-22",
        description: "Kontorstoler",
        account: { number: 1920 },
        amount: -13500,
        amountCurrency: -13500,
        amountGross: -13500,
        amountGrossCurrency: -13500,
      },
    ],
  };
  const res1 = await api("POST", "/ledger/voucher", voucherNumber);
  if (res1.status < 300) {
    const v = res1.json?.value;
    console.log(`Voucher: id=${v?.id}`);
    for (const p of v?.postings || []) {
      console.log(`  acct=${p.account?.id}(${p.account?.number}), amount=${p.amount}, amountGross=${p.amountGross}, vatType=${p.vatType?.id}`);
    }
  }

  // Test 2: Check what happens if we GET account and extract vatType.id from it
  console.log("\n--- TEST 2: Account vatType.id from GET /ledger/account ---");
  const acctRes = await api("GET", "/ledger/account?number=6540&fields=id,number,name,vatType(*)");
  const accts = acctRes.json?.values || [];
  for (const a of accts) {
    console.log(`Account ${a.number}: id=${a.id}, vatType=`, JSON.stringify(a.vatType));
  }

  // Test 3: Verify the correct gross amount interpretation
  // by checking what the auto-generated VAT posting looks like
  console.log("\n--- TEST 3: Verify final state of proof A voucher ---");
  const verifyRes = await api("GET", "/ledger/voucher/609014744?fields=*,postings(*,account(*),vatType(*))");
  if (verifyRes.status < 300) {
    const v = verifyRes.json?.value;
    console.log(`Voucher ${v?.id}: date=${v?.date}, desc="${v?.description}"`);
    console.log("Postings:");
    for (const p of v?.postings || []) {
      console.log(`  acct=${p.account?.number}(${p.account?.name}), amount=${p.amount}, amountGross=${p.amountGross}, vatType.number=${p.vatType?.number}(${p.vatType?.name}), dept=${p.department?.id}`);
    }
  }
}

main().catch(console.error);
