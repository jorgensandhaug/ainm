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

// Test: account by number + name (hardcoded standard account names)
console.log("=== TEST: account by number+name ===");
const testRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-03-21",
  description: "Test account by number+name",
  postings: [
    {
      row: 1,
      account: { number: 1920, name: "Bankinnskudd" },
      amount: 1,
      amountCurrency: 1,
      amountGross: 1,
      amountGrossCurrency: 1,
    },
    {
      row: 2,
      account: { number: 8060, name: "Valutagevinst (agio)" },
      amount: -1,
      amountCurrency: -1,
      amountGross: -1,
      amountGrossCurrency: -1,
    },
  ],
});
if (testRes?.value) {
  console.log("SUCCESS! Voucher ID:", testRes.value.id);
  const v = await api("GET", `/ledger/voucher/${testRes.value.id}?fields=*,postings(id,row,account(id,number,name),amount)`);
  if (v?.value) {
    for (const p of v.value.postings || []) {
      console.log(`  Row ${p.row}: Account ${p.account?.number} (${p.account?.name}) amount=${p.amount}`);
    }
  }
} else {
  console.log("FAILED");
}

// Test 2: Use the debitAccount.id from paymentType for bank (avoids account lookup for 1920)
// and still lookup 8060 separately
console.log("\n=== TEST: reuse debitAccount.id from paymentType ===");
// Payment type debit account ID = 424190862 (account 1920)
const test2Res = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-03-21",
  description: "Test reuse debitAccount.id",
  postings: [
    {
      row: 1,
      account: { id: 424190862 },  // from paymentType.debitAccount.id
      amount: 2,
      amountCurrency: 2,
      amountGross: 2,
      amountGrossCurrency: 2,
    },
    {
      row: 2,
      account: { number: 8060, name: "Valutagevinst (agio)" },
      amount: -2,
      amountCurrency: -2,
      amountGross: -2,
      amountGrossCurrency: -2,
    },
  ],
});
if (test2Res?.value) {
  console.log("SUCCESS! Voucher ID:", test2Res.value.id);
} else {
  console.log("FAILED");
}
