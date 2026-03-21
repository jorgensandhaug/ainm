const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "CcO_uXJeuE9u6tcVsDdaHZy-DKsQ9BEBE9ddX8Wi-y8";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Locate the paid invoice
const invoiceUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`;
const res1 = await fetch(invoiceUrl, { headers: H });
const data1 = await res1.json();
console.log("Invoice search status:", res1.status, "count:", data1.count);

const invoices = (data1.values || []).filter((inv: any) => {
  if (inv.customer?.organizationNumber !== "943745862") return false;
  if (inv.amountExcludingVatCurrency !== 33900) return false;
  // Check description in orderLines
  const allLines = [
    ...(inv.orderLines || []),
    ...((inv.orders || []).flatMap((o: any) => o.orderLines || []))
  ];
  const hasDesc = allLines.some((l: any) =>
    (l.description || "").includes("Conseil en données") ||
    (l.displayName || "").includes("Conseil en données")
  );
  return hasDesc;
});

if (invoices.length === 0) {
  // Fallback: just match by org number and amount
  const fallback = (data1.values || []).filter((inv: any) =>
    inv.customer?.organizationNumber === "943745862" &&
    inv.amountExcludingVatCurrency === 33900
  );
  if (fallback.length === 0) {
    console.log("No matching invoice found");
    console.log("All invoices for org 943745862:", (data1.values || []).filter((inv: any) => inv.customer?.organizationNumber === "943745862").map((inv: any) => ({ id: inv.id, amountExcludingVatCurrency: inv.amountExcludingVatCurrency, amountCurrency: inv.amountCurrency })));
    process.exit(1);
  }
  invoices.push(...fallback);
}

const invoice = invoices[0];
console.log("Found invoice:", invoice.id, "amountCurrency:", invoice.amountCurrency, "amountExcludingVatCurrency:", invoice.amountExcludingVatCurrency, "outstanding:", invoice.amountCurrencyOutstanding);

// Extract payment voucher from postings
const postings = invoice.postings || [];

// Look for INCOMING_PAYMENT or INCOMING_PAYMENT_OPPOSITE type postings first
let paymentPostings = postings.filter((p: any) =>
  p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE"
);

let paymentVoucherId: number | null = null;

if (paymentPostings.length > 0) {
  // Get unique voucher ids from payment-type postings
  const voucherIds = [...new Set(paymentPostings.map((p: any) => p.voucher?.id).filter(Boolean))];
  if (voucherIds.length === 1) {
    paymentVoucherId = voucherIds[0] as number;
  }
}

if (!paymentVoucherId) {
  // Fallback: find the unique negative "Betaling: ..." posting
  const betalingPostings = postings.filter((p: any) =>
    (p.description || "").startsWith("Betaling:") && p.amountCurrency < 0
  );
  const voucherIds = [...new Set(betalingPostings.map((p: any) => p.voucher?.id).filter(Boolean))];

  // Make sure it's not the same voucher as the invoice posting
  const invoiceVoucherIds = [...new Set(postings.filter((p: any) => !(p.description || "").startsWith("Betaling:")).map((p: any) => p.voucher?.id).filter(Boolean))];
  const paymentOnlyVouchers = voucherIds.filter(v => !invoiceVoucherIds.includes(v));

  if (paymentOnlyVouchers.length === 1) {
    paymentVoucherId = paymentOnlyVouchers[0] as number;
  } else if (voucherIds.length === 1) {
    paymentVoucherId = voucherIds[0] as number;
  }
}

if (!paymentVoucherId) {
  console.log("Could not identify payment voucher. Postings:", JSON.stringify(postings, null, 2));
  process.exit(1);
}

console.log("Payment voucher id:", paymentVoucherId);

// Step 2: Reverse the payment voucher
const reverseUrl = `${BASE}/ledger/voucher/${paymentVoucherId}/:reverse?date=2026-03-21`;
const res2 = await fetch(reverseUrl, { method: "PUT", headers: H });
const data2 = await res2.json();
console.log("Reverse status:", res2.status);
console.log("Reverse voucher id:", data2.value?.id);
console.log("Done.");
