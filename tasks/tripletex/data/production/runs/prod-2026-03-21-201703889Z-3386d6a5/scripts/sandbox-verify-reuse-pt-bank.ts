// Verify: reusing paymentType debitAccount.id for the bank side of agio voucher
// This avoids looking up account 1920 separately — only need to look up 8060 or 8160

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

// Step 1: Get paymentType with bank account
const ptRes = await api("GET", "/invoice/paymentType?fields=*,debitAccount(*)");
const pts = ptRes.json.values || [];
const bankPt = pts.find((p: any) => p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000 && p.debitAccount?.isBankAccount === true)
  || pts.find((p: any) => p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000);

if (!bankPt) { console.log("No bank payment type found"); process.exit(1); }
console.log(`Bank paymentType: id=${bankPt.id}, debitAccount.id=${bankPt.debitAccount.id}, debitAccount.number=${bankPt.debitAccount.number}`);

// Step 2: Look up ONLY the agio account (8060) — not 1920 anymore
const acctRes = await api("GET", "/ledger/account?number=8060&fields=id,number");
const agioAcct = (acctRes.json.values || [])[0];
console.log(`Agio account: 8060 → id=${agioAcct?.id}`);

// Step 3: Create voucher using paymentType debitAccount.id for bank + looked-up agio account
const vRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: TODAY,
  description: "Verify: reuse paymentType bank account for agio voucher",
  postings: [
    { row: 1, date: TODAY, account: { id: bankPt.debitAccount.id }, amountGross: 123.45, amountGrossCurrency: 123.45, vatType: { id: 0 }, description: "Bank (from paymentType)" },
    { row: 2, date: TODAY, account: { id: agioAcct.id }, amountGross: -123.45, amountGrossCurrency: -123.45, vatType: { id: 0 }, description: "Agio (8060)" },
  ],
});

if (vRes.ok) {
  console.log(`\nVoucher created successfully: id=${vRes.json.value?.id}`);
  console.log("CONFIRMED: paymentType debitAccount.id works in voucher postings.");
  console.log("Optimization: GET /ledger/account only needs to look up 8060 (or 8160 for disagio),");
  console.log("not 1920 — reuse paymentType.debitAccount.id for the bank side.");
  console.log("Call count stays at 5 but the account lookup is simpler.");
}

// Step 4: Also test with 8160 for disagio case
const acctRes2 = await api("GET", "/ledger/account?number=8160&fields=id,number");
const disagioAcct = (acctRes2.json.values || [])[0];
console.log(`\nDisagio account: 8160 → id=${disagioAcct?.id}`);

const vRes2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: TODAY,
  description: "Verify: disagio with paymentType bank account",
  postings: [
    { row: 1, date: TODAY, account: { id: disagioAcct.id }, amountGross: 67.89, amountGrossCurrency: 67.89, vatType: { id: 0 }, description: "Disagio (8160)" },
    { row: 2, date: TODAY, account: { id: bankPt.debitAccount.id }, amountGross: -67.89, amountGrossCurrency: -67.89, vatType: { id: 0 }, description: "Bank (from paymentType)" },
  ],
});

if (vRes2.ok) {
  console.log(`Disagio voucher created: id=${vRes2.json.value?.id}`);
  console.log("CONFIRMED: disagio with paymentType debitAccount.id also works.");
}
