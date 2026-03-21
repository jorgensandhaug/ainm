// Sandbox investigation: can we skip GET /ledger/account by using account number directly in voucher?
// Already proven to fail, but let's re-confirm and also check if there's a way to batch.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log("ERROR:", JSON.stringify(json).slice(0, 300));
  return { ok: r.ok, status: r.status, data: json };
}

async function main() {
  // Test 1: Can we get account 8060 ID from /ledger/account and paymentType in parallel?
  // This doesn't save calls but let's confirm both work
  const [acctRes, ptRes] = await Promise.all([
    api("GET", "/ledger/account?number=8060&fields=id,number"),
    api("GET", "/invoice/paymentType?fields=*,debitAccount(*)"),
  ]);

  const acct8060 = (acctRes.data.values || [])[0];
  console.log("Account 8060:", acct8060);

  const bankPt = (ptRes.data.values || []).find((p: any) =>
    p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000
  );
  console.log("Bank payment type:", bankPt?.id, bankPt?.debitAccount?.number, bankPt?.debitAccount?.id);

  // Test 2: Can we use account: { number: 8060 } directly (confirmed should fail)?
  const bankAcctId = bankPt?.debitAccount?.id;
  const testVoucher1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: TODAY,
    description: "Test: account by number only",
    postings: [
      { row: 1, date: TODAY, account: { number: 8060 }, amountGross: 100, amountGrossCurrency: 100, vatType: { id: 0 }, description: "test" },
      { row: 2, date: TODAY, account: { id: bankAcctId }, amountGross: -100, amountGrossCurrency: -100, vatType: { id: 0 }, description: "test" },
    ],
  });
  console.log("Test voucher with number only:", testVoucher1.ok ? "SUCCESS" : "FAILED");

  // Test 3: Can we batch GET /ledger/account with multiple numbers?
  const batchAcct = await api("GET", "/ledger/account?number=8060,8160&fields=id,number");
  console.log("Batch account lookup:", (batchAcct.data.values || []).map((a: any) => `${a.number}=${a.id}`));

  // Test 4: Check if paymentType call can also return account 8060 somehow
  // (No, this is just for payment types, not ledger accounts)

  console.log("\n=== CONCLUSION ===");
  console.log("5 calls is the minimum for NOK fallback:");
  console.log("1. GET /invoice (find the invoice)");
  console.log("2. GET /invoice/paymentType (find bank payment type + get bank account ID)");
  console.log("3. PUT /invoice/:payment (register payment)");
  console.log("4. GET /ledger/account (resolve agio account ID - CANNOT skip, number-only fails)");
  console.log("5. POST /ledger/voucher (book manual agio)");
}

main().catch(e => { console.error(e); process.exit(1); });
