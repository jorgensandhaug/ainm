// Sandbox verification: Can we skip the GET /ledger/account call by using account number directly?
// Also: Can we combine paymentType + account lookup somehow?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

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
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error("ERROR:", JSON.stringify(json, null, 2));
  }
  return { status: res.status, ok: res.ok, json };
}

// Test 1: Can we use account number directly in voucher posting?
console.log("=== Test 1: account: { number: 1920 } in voucher ===");
const t1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: TODAY,
  description: "Test account by number",
  postings: [
    { row: 1, date: TODAY, account: { number: 1920 }, amountGross: 100, amountGrossCurrency: 100, vatType: { id: 0 }, description: "test" },
    { row: 2, date: TODAY, account: { number: 8060 }, amountGross: -100, amountGrossCurrency: -100, vatType: { id: 0 }, description: "test" },
  ],
});
console.log(`Result: ${t1.status} ok=${t1.ok}`);

// Test 2: Can we get paymentType debitAccount number AND reuse it for the voucher account lookup?
// i.e., does paymentType response contain bank account ID we could reuse?
console.log("\n=== Test 2: paymentType debitAccount contains full account data? ===");
const ptRes = await api("GET", "/invoice/paymentType?fields=*,debitAccount(*)");
if (ptRes.ok) {
  const pts = ptRes.json.values || [];
  const bankPt = pts.find((p: any) => p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000);
  if (bankPt) {
    console.log(`Bank paymentType: id=${bankPt.id}, debitAccount.id=${bankPt.debitAccount?.id}, debitAccount.number=${bankPt.debitAccount?.number}`);
    // The debitAccount.id from paymentType could potentially be reused for the 1920 account in the voucher
    // This would eliminate the need for GET /ledger/account for the bank account (1920)
    // But we'd still need the agio account (8060) ID
  }
}

// Test 3: Can we use the debitAccount.id from paymentType in a voucher?
console.log("\n=== Test 3: Use paymentType debitAccount.id in voucher ===");
if (ptRes.ok) {
  const pts = ptRes.json.values || [];
  const bankPt = pts.find((p: any) => p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000);
  if (bankPt) {
    // Still need agio account ID - get just 8060
    const acctRes = await api("GET", "/ledger/account?number=8060&fields=id,number");
    if (acctRes.ok) {
      const agioAcct = (acctRes.json.values || [])[0];
      console.log(`Using paymentType debitAccount.id=${bankPt.debitAccount.id} for 1920, and ledger account id=${agioAcct?.id} for 8060`);

      // Try creating a voucher using paymentType's debitAccount.id for 1920
      const vRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
        date: TODAY,
        description: "Test reusing paymentType debitAccount.id",
        postings: [
          { row: 1, date: TODAY, account: { id: bankPt.debitAccount.id }, amountGross: 50, amountGrossCurrency: 50, vatType: { id: 0 }, description: "bank via paymentType" },
          { row: 2, date: TODAY, account: { id: agioAcct.id }, amountGross: -50, amountGrossCurrency: -50, vatType: { id: 0 }, description: "agio" },
        ],
      });
      console.log(`Voucher result: ${vRes.status} ok=${vRes.ok}`);
      if (vRes.ok) {
        console.log(`Voucher created: ${vRes.json.value?.id}`);
        console.log("SUCCESS: paymentType debitAccount.id CAN be reused in vouchers!");
        console.log("This means we could potentially skip the GET /ledger/account for account 1920,");
        console.log("and only look up 8060 (or 8160 for disagio) - saving one call param but not a full call.");
      }
    }
  }
}

// Test 4: Can we get account 8060 from a different source to avoid the separate lookup?
// Check if GET /ledger/account can return multiple accounts with comma-separated numbers
console.log("\n=== Test 4: Combined account lookup optimization ===");
const acctCombo = await api("GET", "/ledger/account?number=1920,8060,8160&fields=id,number");
if (acctCombo.ok) {
  console.log(`Combined lookup returned ${(acctCombo.json.values || []).length} accounts:`);
  for (const a of (acctCombo.json.values || [])) {
    console.log(`  ${a.number} → id=${a.id}`);
  }
}
