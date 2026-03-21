// Investigate task 11 - Part 5: Test the dedicated supplierInvoice postings endpoint
// with correct field names (no 'row' field)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Use the voucher from Approach A (609181884) which has an import but no postings yet
const VOUCHER_ID = 609181884;
const EXPENSE_ACCT_ID = 424191132;
const SUPPLIER_ID = 108439805;
const SUPPLIER_LEDGER_ID = 424190921;
const GROSS = 42100;
const NET = 33680;
const DESCRIPTION = "kontortjenester";
const INVOICE_NR = "INV-A-1774131434509";
const DATE = "2026-03-21";

// ============================================================
// PART 1: Try different formats for /supplierInvoice/voucher/{id}/postings
// ============================================================

// First, check what fields the endpoint's posting object expects
// The error said "row" doesn't exist. Let's look at what the openapi spec says about posting objects for this endpoint

// Test 1: Without row, just account-based postings
console.log("=== Test 1: Without row field ===");
const test1Res = await fetch(`${BASE}/supplierInvoice/voucher/${VOUCHER_ID}/postings?sendToLedger=false`, {
  method: "PUT",
  headers: H,
  body: JSON.stringify([
    {
      account: { id: EXPENSE_ACCT_ID },
      description: DESCRIPTION,
      vatType: { id: 1 },
      amount: NET,
      amountCurrency: NET,
      amountGross: GROSS,
      amountGrossCurrency: GROSS,
    },
    {
      account: { id: SUPPLIER_LEDGER_ID },
      supplier: { id: SUPPLIER_ID },
      description: DESCRIPTION,
      amount: -GROSS,
      amountCurrency: -GROSS,
      amountGross: -GROSS,
      amountGrossCurrency: -GROSS,
      invoiceNumber: INVOICE_NR,
      termOfPayment: DATE,
    },
  ]),
});
console.log("Status:", test1Res.status);
const test1Data = await test1Res.json();
console.log("Response:", JSON.stringify(test1Data, null, 2));

if (test1Res.ok) {
  // Try booking now
  console.log("\n=== Booking with sendToLedger=true ===");
  const bookRes = await fetch(`${BASE}/supplierInvoice/voucher/${VOUCHER_ID}/postings?sendToLedger=true`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify([]),
  });
  console.log("Status:", bookRes.status);
  const bookData = await bookRes.json();
  console.log("Response:", JSON.stringify(bookData, null, 2));

  // Check voucher state
  console.log("\n=== Get voucher state ===");
  const vRes = await fetch(`${BASE}/ledger/voucher/${VOUCHER_ID}?fields=*`, { headers: H });
  const vData = await vRes.json();
  console.log("Voucher number:", vData.value?.number);
  console.log("Voucher:", JSON.stringify(vData.value, null, 2));
} else {
  // Try another approach - maybe the endpoint wants OrderLine objects, not Posting objects
  console.log("\n=== Test 2: Try with different field names ===");

  // Check what the endpoint actually expects by sending minimal object
  const test2Res = await fetch(`${BASE}/supplierInvoice/voucher/${VOUCHER_ID}/postings?sendToLedger=false`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify([
      {
        description: DESCRIPTION,
        amountGross: GROSS,
      },
    ]),
  });
  console.log("Status:", test2Res.status);
  const test2Data = await test2Res.json();
  console.log("Response:", JSON.stringify(test2Data, null, 2));

  // Test 3: Maybe it expects the same format as order lines
  console.log("\n=== Test 3: Try order-line style format ===");
  const test3Res = await fetch(`${BASE}/supplierInvoice/voucher/${VOUCHER_ID}/postings?sendToLedger=false`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify([
      {
        description: DESCRIPTION,
        count: 1,
        unitCostCurrency: NET,
        vatType: { id: 1 },
        account: { id: EXPENSE_ACCT_ID },
      },
    ]),
  });
  console.log("Status:", test3Res.status);
  const test3Data = await test3Res.json();
  console.log("Response:", JSON.stringify(test3Data, null, 2));
}
