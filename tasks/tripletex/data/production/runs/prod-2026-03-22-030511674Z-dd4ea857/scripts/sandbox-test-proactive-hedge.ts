// Sandbox investigation: test proactive bank-account hedge approach
// Goal: prove that GET /ledger/account + conditional PUT before POST /invoice
// is strictly better than reactive recovery (POST 422 → GET → PUT → retry POST)
// for fresh accounts.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const j = await r.json();
  console.log(`GET ${path} → ${r.status}`);
  return { ok: r.ok, status: r.status, data: j };
}

// Step 1: Check the bank account situation
console.log("=== Checking bank account state ===");
const acctRes = await get("/ledger/account?isBankAccount=true&fields=*");
if (acctRes.ok) {
  const accts = acctRes.data.values;
  console.log(`Found ${accts.length} bank accounts:`);
  for (const a of accts) {
    console.log(`  id=${a.id} number=${a.number} bankAccountNumber=${a.bankAccountNumber} isInvoiceAccount=${a.isInvoiceAccount}`);
  }

  // Check if any invoice account is missing bankAccountNumber
  const invoiceAcct = accts.find((a: any) => a.isInvoiceAccount);
  if (invoiceAcct) {
    console.log(`\nInvoice account: id=${invoiceAcct.id} number=${invoiceAcct.number} bankAccountNumber=${invoiceAcct.bankAccountNumber}`);
    if (invoiceAcct.bankAccountNumber) {
      console.log("→ Bank account number EXISTS — proactive hedge would add 1 wasted GET");
      console.log("→ But reactive recovery would also work (4 calls, 0 errors)");
    } else {
      console.log("→ Bank account number MISSING — proactive hedge saves 1 call + 1 error vs reactive");
    }
  }
}

// Step 2: Check if there are existing customers and products to test with
console.log("\n=== Checking for existing test entities ===");
const custRes = await get("/customer?count=3&fields=id,name,organizationNumber");
if (custRes.ok) {
  console.log("Customers:", custRes.data.values.map((c: any) => `${c.id}:${c.name}(${c.organizationNumber})`).join(", "));
}

const prodRes = await get("/product?count=5&fields=id,number,name,vatType(*)");
if (prodRes.ok) {
  console.log("Products:", prodRes.data.values.map((p: any) => `${p.id}:${p.number}/${p.name} (vatPct=${p.vatType?.percentage})`).join(", "));
}

// Step 3: Check if we have paymentTypes
const ptRes = await get("/invoice/paymentType?count=5&fields=id,description");
if (ptRes.ok) {
  console.log("PaymentTypes:", ptRes.data.values.map((pt: any) => `${pt.id}:${pt.description}`).join(", "));
}

console.log("\n=== Analysis ===");
console.log("For fresh production accounts:");
console.log("  Proactive hedge: GET customer + GET product + GET paymentType + GET /ledger/account + (conditional PUT) + POST /invoice");
console.log("  = 5 calls (bank acct exists) or 6 calls (bank acct missing), 0 errors");
console.log("  Reactive recovery: GET customer + GET product + GET paymentType + POST /invoice");
console.log("  = 4 calls (bank acct exists) or 7 calls + 1 error (bank acct missing)");
console.log("  Expected value for fresh accounts where bank acct is sometimes missing:");
console.log("  Proactive is strictly better when bank acct is missing (6 vs 7, 0 errors vs 1)");
console.log("  Reactive is 1 call cheaper when bank acct exists (4 vs 5)");
