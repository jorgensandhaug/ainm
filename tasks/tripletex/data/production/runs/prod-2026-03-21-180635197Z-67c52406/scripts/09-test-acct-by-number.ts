const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n${method} ${url}`);
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  let data;
  try { data = JSON.parse(text); } catch { console.log("Raw:", text); return null; }
  if (!res.ok) { console.log("Error:", JSON.stringify(data, null, 2)); return null; }
  return data;
}

// Test 1: Can we use account.number instead of account.id in POST /ledger/voucher?
console.log("=== TEST: account by number ===");
const testRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-03-21",
  description: "Test account by number",
  postings: [
    {
      row: 1,
      account: { number: 1920 },
      amount: 1,
      amountCurrency: 1,
      amountGross: 1,
      amountGrossCurrency: 1,
    },
    {
      row: 2,
      account: { number: 8060 },
      amount: -1,
      amountCurrency: -1,
      amountGross: -1,
      amountGrossCurrency: -1,
    },
  ],
});
if (testRes?.value) {
  console.log("SUCCESS! Voucher created with account by number:", testRes.value.id);
  // Verify
  const v = await api("GET", `/ledger/voucher/${testRes.value.id}?fields=*,postings(id,row,account(id,number,name),amount)`);
  if (v?.value) {
    for (const p of v.value.postings || []) {
      console.log(`  Row ${p.row}: Account ${p.account?.number} (${p.account?.name}) amount=${p.amount}`);
    }
  }
} else {
  console.log("FAILED: Cannot use account by number");
}

// Test 2: Can I reuse the debitAccount from paymentType for voucher posting?
const ptRes = await api("GET", "/invoice/paymentType?fields=*,debitAccount(*)");
if (ptRes?.values) {
  const bankPt = ptRes.values.find((pt: any) => pt.debitAccount?.number >= 1900 && pt.debitAccount?.number < 2000 && pt.debitAccount?.isBankAccount);
  if (bankPt) {
    console.log("\nBank payment type:", bankPt.id, "debit account ID:", bankPt.debitAccount.id, "number:", bankPt.debitAccount.number);
  }
}
