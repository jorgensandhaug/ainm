// Investigate: can we skip the account lookup by using account number directly in voucher?
// Also: can we combine invoice + paymentType into fewer calls?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: any = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log("Status:", r.status);
  return { status: r.status, json };
}

async function main() {
  // Test 1: Can POST /ledger/voucher accept account: { number: 8060 } without id?
  console.log("\n=== Test 1: account by number only ===");
  const r1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-21",
    description: "Test voucher - number only",
    postings: [
      { row: 1, date: "2026-03-21", account: { number: 8060 }, amountGross: 100, amountGrossCurrency: 100, vatType: { id: 0 }, description: "test" },
      { row: 2, date: "2026-03-21", account: { number: 1920 }, amountGross: -100, amountGrossCurrency: -100, vatType: { id: 0 }, description: "test" }
    ]
  });
  console.log("Result:", JSON.stringify(r1.json).substring(0, 500));

  // Test 2: Can POST /ledger/voucher accept account: { number: 8060, name: "Valutagevinst (agio)" }?
  console.log("\n=== Test 2: account by number + name ===");
  const r2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-21",
    description: "Test voucher - number + name",
    postings: [
      { row: 1, date: "2026-03-21", account: { number: 8060, name: "Valutagevinst (agio)" }, amountGross: 100, amountGrossCurrency: 100, vatType: { id: 0 }, description: "test" },
      { row: 2, date: "2026-03-21", account: { number: 1920, name: "Bankinnskudd" }, amountGross: -100, amountGrossCurrency: -100, vatType: { id: 0 }, description: "test" }
    ]
  });
  console.log("Result:", JSON.stringify(r2.json).substring(0, 500));

  // Test 3: Get the actual account IDs and use them for comparison
  console.log("\n=== Test 3: Get account IDs for reference ===");
  const r3 = await api("GET", "/ledger/account?number=8060,1920&fields=id,number,name");
  console.log("Accounts:", JSON.stringify(r3.json));
}

main().catch(e => console.error(e));
