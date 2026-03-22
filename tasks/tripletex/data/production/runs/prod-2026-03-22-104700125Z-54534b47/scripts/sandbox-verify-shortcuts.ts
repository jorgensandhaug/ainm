// Sandbox verification: can we skip the GET /ledger/account call
// by using account: { number } in POST /ledger/voucher?
// If yes, NOK fallback could be 4 calls instead of 5.

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
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) console.log("ERROR:", JSON.stringify(json, null, 2));
  return { status: res.status, json };
}

async function main() {
  // Test 1: Can POST /ledger/voucher accept account: { number: 8060 } without ID?
  console.log("=== Test 1: account: { number } without ID ===");
  const test1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-22",
    description: "Test shortcut - number only",
    postings: [
      { row: 1, date: "2026-03-22", account: { number: 1920 }, amountGross: 100, amountGrossCurrency: 100, vatType: { id: 0 }, description: "Test" },
      { row: 2, date: "2026-03-22", account: { number: 8060 }, amountGross: -100, amountGrossCurrency: -100, vatType: { id: 0 }, description: "Test" },
    ],
  });
  console.log(`Result: ${test1.status}`);
  if (test1.status === 201) {
    console.log("SUCCESS! account: { number } works — GET /ledger/account can be eliminated!");
    console.log("Voucher:", JSON.stringify(test1.json.value, null, 2));
  }

  // Test 2: Can we use account: { number, name } ?
  console.log("\n=== Test 2: account: { number, name } ===");
  const test2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-22",
    description: "Test shortcut - number+name",
    postings: [
      { row: 1, date: "2026-03-22", account: { number: 1920, name: "Bankinnskudd" }, amountGross: 100, amountGrossCurrency: 100, vatType: { id: 0 }, description: "Test" },
      { row: 2, date: "2026-03-22", account: { number: 8060, name: "Valutagevinst (agio)" }, amountGross: -100, amountGrossCurrency: -100, vatType: { id: 0 }, description: "Test" },
    ],
  });
  console.log(`Result: ${test2.status}`);

  // Test 3: Can we get paymentType and ledger/account in a single call somehow?
  // Check if GET /invoice/paymentType returns debitAccount with enough info to skip the account lookup
  console.log("\n=== Test 3: paymentType debitAccount details ===");
  const ptRes = await api("GET", "/invoice/paymentType?fields=*,debitAccount(*)");
  if (ptRes.status === 200) {
    const pts = ptRes.json.values || [];
    const bankPt = pts.find((p: any) => p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000);
    if (bankPt) {
      console.log(`Bank PT: id=${bankPt.id}, debitAccount.id=${bankPt.debitAccount?.id}, debitAccount.number=${bankPt.debitAccount?.number}`);
    }
  }

  // Test 4: Does GET /ledger/account support multiple numbers in one call?
  console.log("\n=== Test 4: multi-account lookup ===");
  const multiAcct = await api("GET", "/ledger/account?number=1920,8060&fields=id,number");
  if (multiAcct.status === 200) {
    console.log(`Multi-account results: ${multiAcct.json.count} accounts`);
    (multiAcct.json.values || []).forEach((a: any) => console.log(`  ${a.number}: id=${a.id}`));
  }
}

main().catch(e => console.error(e));
