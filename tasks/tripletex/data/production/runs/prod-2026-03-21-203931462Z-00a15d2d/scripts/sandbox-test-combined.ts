// Sandbox test: Can we get paymentType info from the invoice locate call?
// Also test: Can we post a voucher with account number+name to skip the account GET?

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
  const r = await fetch(url, opts);
  const txt = await r.text();
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) {
    console.log("ERROR:", txt.substring(0, 500));
    return null;
  }
  const json = JSON.parse(txt);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Test 1: Does GET /invoice return any paymentType-related fields we could use?
console.log("=== TEST 1: Check invoice fields for paymentType info ===");
const invoices = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-12-31&count=5&sorting=-invoiceDate&fields=*,customer(*)");
if (invoices && invoices.length > 0) {
  const inv = invoices[0];
  // Check if there's any payment type info embedded
  console.log("Invoice keys:", Object.keys(inv).join(", "));
  console.log("Has paymentType?", "paymentType" in inv);
  console.log("Has paymentTypeId?", "paymentTypeId" in inv);
  if (inv.paymentType) console.log("paymentType:", JSON.stringify(inv.paymentType));
  if (inv.paymentTypeId) console.log("paymentTypeId:", inv.paymentTypeId);
}

// Test 2: Can we get the account IDs from a single combined query?
console.log("\n=== TEST 2: Verify account query returns both 1500 and 3400 ===");
const accounts = await api("GET", "/ledger/account?number=1500,3400&fields=*");
if (accounts) {
  for (const a of accounts) {
    console.log(`Account ${a.number}: id=${a.id}, name=${a.name}, isInactive=${a.isInactive}`);
  }
}

// Test 3: Can we get the payment types AND accounts in a combined way?
// Actually let's test: does the invoice itself carry enough info about payment types?
console.log("\n=== TEST 3: Check /invoice/paymentType count ===");
const pts = await api("GET", "/invoice/paymentType?count=5&fields=*,debitAccount(*),creditAccount(*)");
if (pts) {
  console.log(`Found ${pts.length} payment types`);
  for (const p of pts) {
    console.log(`  id=${p.id} name=${p.name} debit=${p.debitAccount?.number} credit=${p.creditAccount?.number}`);
  }
}

// Test 4: Can we post a voucher using account.number instead of account.id?
// (Already proven to fail, but re-confirm)
console.log("\n=== TEST 4: Voucher with account.number (expected to fail) ===");
const voucherByNumber = await api("POST", "/ledger/voucher", {
  date: "2026-03-21",
  description: "Test voucher by number",
  voucherType: null,
  postings: [
    {
      row: 1,
      date: "2026-03-21",
      description: "Test",
      account: { number: 1500 },
      currency: { id: 1 },
      amount: 1,
      amountCurrency: 1,
      amountGross: 1,
      amountGrossCurrency: 1,
    },
    {
      row: 2,
      date: "2026-03-21",
      description: "Test",
      account: { number: 3400 },
      currency: { id: 1 },
      amount: -1,
      amountCurrency: -1,
      amountGross: -1,
      amountGrossCurrency: -1,
    },
  ],
});

console.log("\n=== CONCLUSIONS ===");
console.log("If invoice has paymentType embedded -> could skip GET /invoice/paymentType");
console.log("If voucher by number works -> could skip GET /ledger/account");
