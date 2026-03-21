// Investigate: can we avoid GET /ledger/account by using a known account number pattern?
// If account 1920 is always the invoice account, can we find its ID more efficiently?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Authorization": AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) console.log(JSON.stringify(json, null, 2).slice(0, 500));
  return { status: r.status, data: json };
}

async function main() {
  // Test 1: Can we narrow the account search with number=1920 to reduce payload?
  const res1 = await api("GET", "ledger/account?number=1920&isBankAccount=true&fields=id,number,name,bankAccountNumber,isInvoiceAccount");
  console.log("Accounts with number=1920:", JSON.stringify(res1.data?.values, null, 2));

  // Test 2: Check if isBankAccount=true filter with number=1920 returns exactly one result
  const res2 = await api("GET", "ledger/account?isBankAccount=true&fields=id,number,name,isInvoiceAccount");
  console.log("All bank accounts:", JSON.stringify(res2.data?.values, null, 2));

  // Test 3: Can we parallelize the initial GET customer + GET vatType + preemptive GET account?
  // Already documented as suboptimal (4 calls vs 3 in happy case), but let's check the exact timing
  console.log("\n--- Checking parallel timing ---");
  const start = Date.now();
  const [a, b, c] = await Promise.all([
    api("GET", "customer?organizationNumber=841254546&fields=id,name"),
    api("GET", "ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=id,number,percentage"),
    api("GET", "ledger/account?isBankAccount=true&number=1920&fields=id,number,name,bankAccountNumber"),
  ]);
  console.log(`3-way parallel took ${Date.now() - start}ms`);

  // Customer may or may not exist in sandbox
  console.log("Customer result:", a.status, JSON.stringify(a.data?.values?.length));
  console.log("VatType result:", b.status, JSON.stringify(b.data?.values?.map((v: any) => `${v.number}:${v.percentage}%`)));
  console.log("Account 1920 result:", c.status, JSON.stringify(c.data?.values?.map((v: any) => `id=${v.id},num=${v.number},bank=${v.bankAccountNumber}`)));
}

main().catch(console.error);
