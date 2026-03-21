// Sandbox: pay invoice 2147637165, then reverse with 2-call path
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };
const TODAY = "2026-03-21";

const invoiceId = 2147637165;
const paymentTypeId = 32813747; // Kontant

// Pay the invoice
const gross = 19250; // no VAT in sandbox
const payUrl = `${BASE}/invoice/${invoiceId}/:payment?paymentDate=${TODAY}&paymentTypeId=${paymentTypeId}&paidAmount=${gross}&paidAmountCurrency=${gross}`;
console.log("Paying invoice...");
const payRes = await fetch(payUrl, { method: "PUT", headers });
console.log("Payment status:", payRes.status);
if (!payRes.ok) {
  console.log("Payment error:", await payRes.text());
  process.exit(1);
}
const payData = await payRes.json();
console.log("Payment done:", JSON.stringify(payData).substring(0, 200));

console.log("\n=== 2-call reverse path ===\n");

// CALL 1: Decisive GET with org number filter
const url1 = `${BASE}/invoice?customerOrgNumber=910318144&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`;
console.log("CALL 1: GET /invoice?customerOrgNumber=910318144...");
const r1 = await fetch(url1, { headers });
const data1 = await r1.json();
console.log("Invoice count:", data1.count);

const invoices = data1.values as any[];
const target = invoices.find((inv: any) => inv.id === invoiceId);

if (!target) {
  console.log("Invoice not in broad search (sandbox trap). Using direct GET...");
  const directRes = await fetch(`${BASE}/invoice/${invoiceId}?fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`, { headers });
  const directData = await directRes.json();
  const inv = directData.value;
  console.log("Direct GET found invoice:", inv?.id);

  const postings = inv.postings as any[];
  for (const p of postings) {
    console.log(`  posting: amount=${p.amountCurrency}, desc="${p.description}", type=${p.type}, voucher=${p.voucher?.id}, account=${p.account?.number}`);
  }
  const paymentPostings = postings.filter((p: any) => {
    if (p.amountCurrency >= 0) return false;
    if (p.description && p.description.startsWith("Betaling:")) return true;
    if (p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE") return true;
    return false;
  });
  const paymentVoucherIds = [...new Set(paymentPostings.map((p: any) => p.voucher?.id).filter(Boolean))];
  console.log("Payment voucher ids:", paymentVoucherIds);

  if (paymentVoucherIds.length === 1) {
    const reverseUrl = `${BASE}/ledger/voucher/${paymentVoucherIds[0]}/:reverse?date=${TODAY}`;
    console.log("CALL 2: PUT /ledger/voucher/" + paymentVoucherIds[0] + "/:reverse");
    const r2 = await fetch(reverseUrl, { method: "PUT", headers });
    console.log("Reverse status:", r2.status);
    const data2 = await r2.json();
    console.log("Reverse voucher id:", data2.value?.id);
  }
} else {
  console.log("Target invoice id:", target.id, "exVat:", target.amountExcludingVatCurrency, "gross:", target.amountCurrency);

  const postings = target.postings as any[];
  for (const p of postings) {
    console.log(`  posting: amount=${p.amountCurrency}, desc="${p.description}", type=${p.type}, voucher=${p.voucher?.id}, account=${p.account?.number}`);
  }

  const paymentPostings = postings.filter((p: any) => {
    if (p.amountCurrency >= 0) return false;
    if (p.description && p.description.startsWith("Betaling:")) return true;
    if (p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE") return true;
    return false;
  });
  const paymentVoucherIds = [...new Set(paymentPostings.map((p: any) => p.voucher?.id).filter(Boolean))];
  console.log("Payment voucher ids:", paymentVoucherIds);

  if (paymentVoucherIds.length === 1) {
    const reverseUrl = `${BASE}/ledger/voucher/${paymentVoucherIds[0]}/:reverse?date=${TODAY}`;
    console.log("CALL 2: PUT /ledger/voucher/" + paymentVoucherIds[0] + "/:reverse");
    const r2 = await fetch(reverseUrl, { method: "PUT", headers });
    console.log("Reverse status:", r2.status);
    if (!r2.ok) { console.error("Reverse failed:", await r2.text()); process.exit(1); }
    const data2 = await r2.json();
    console.log("Reverse voucher id:", data2.value?.id);
  }
}

// Verify
const verifyRes = await fetch(`${BASE}/invoice/${invoiceId}?fields=amountCurrency,amountCurrencyOutstanding,amountExcludingVatCurrency`, { headers });
const verifyData = await verifyRes.json();
console.log("\nVerification after reversal:");
console.log("  amountCurrency:", verifyData.value?.amountCurrency);
console.log("  amountExcludingVatCurrency:", verifyData.value?.amountExcludingVatCurrency);
console.log("  amountCurrencyOutstanding:", verifyData.value?.amountCurrencyOutstanding);
console.log("\nSandbox verification complete.");
