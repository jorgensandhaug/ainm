const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  if (!res.ok) {
    console.log("Error:", text);
    return null;
  }
  return JSON.parse(text);
}

// 1. Check existing invoices
console.log("=== INVOICES ===");
const invRes = await api("GET", "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&fields=*,currency(*)");
if (invRes) {
  for (const inv of invRes.values || []) {
    console.log(`  ID=${inv.id} date=${inv.invoiceDate} amount=${inv.amount} amountCurrency=${inv.amountCurrency} outstanding=${inv.amountOutstanding} outstandingCurrency=${inv.amountCurrencyOutstanding} currency=${inv.currency?.code} exVat=${inv.amountExcludingVat}`);
  }
}

// 2. Check existing customers
console.log("\n=== CUSTOMERS ===");
const custRes = await api("GET", "/customer?fields=*");
if (custRes) {
  for (const c of custRes.values || []) {
    console.log(`  ID=${c.id} name=${c.name} orgNumber=${c.organizationNumber}`);
  }
}

// 3. Check payment types
console.log("\n=== PAYMENT TYPES ===");
const ptRes = await api("GET", "/invoice/paymentType?fields=*,debitAccount(*)");
if (ptRes) {
  for (const pt of ptRes.values || []) {
    console.log(`  ID=${pt.id} desc=${pt.description} debitAcct=${pt.debitAccount?.number} isBankAcct=${pt.debitAccount?.isBankAccount}`);
  }
}

// 4. Check the voucher postings for the production invoice (if it exists on this sandbox)
console.log("\n=== VOUCHER 609076259 POSTINGS ===");
const postRes = await api("GET", "/ledger/posting?voucherId=609076259&fields=*,account(*)");
if (postRes) {
  for (const p of postRes.values || []) {
    console.log(`  Account ${p.account?.number} (${p.account?.name}): amount=${p.amount} amountCurrency=${p.amountCurrency} currency=${p.currency?.code || p.currency?.id}`);
  }
}

// 5. Check what account 8060 is (agio)
console.log("\n=== ACCOUNT 8060 ===");
const acctRes = await api("GET", "/ledger/account?number=8060&fields=*");
if (acctRes) {
  for (const a of acctRes.values || []) {
    console.log(`  ID=${a.id} number=${a.number} name=${a.name}`);
  }
}

// 6. Check what account 8060 exists as
console.log("\n=== ACCOUNT 8060 via numberFrom/numberTo ===");
const acctRes2 = await api("GET", "/ledger/account?numberFrom=8050&numberTo=8170&fields=*");
if (acctRes2) {
  for (const a of acctRes2.values || []) {
    console.log(`  ID=${a.id} number=${a.number} name=${a.name}`);
  }
}
