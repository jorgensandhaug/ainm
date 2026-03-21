const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "-pijy2bVJPXFofA1MXEhRSo-imxDY9lFGjphwTzJUFM";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Step 1: Get payment type
const ptUrl = `${BASE}/invoice/paymentType?fields=*,debitAccount(*)`;
console.log("GET", ptUrl);
const ptRes = await fetch(ptUrl, { headers: { Authorization: AUTH } });
const ptData = await ptRes.json();
console.log("PaymentType status:", ptRes.status);

// Find incoming bank payment type (debitAccount.number in 19xx range, isBankAccount=true)
let paymentTypeId: number | null = null;
if (ptData.values) {
  for (const pt of ptData.values) {
    const da = pt.debitAccount;
    if (!da) continue;
    const num = da.number;
    if (num >= 1900 && num < 2000) {
      if (da.isBankAccount === true || da.isBankAccount === undefined) {
        paymentTypeId = pt.id;
        console.log("Selected paymentType:", pt.id, "debitAccount:", num, "description:", pt.description);
        break;
      }
    }
  }
  if (!paymentTypeId) {
    // fallback: description-based
    for (const pt of ptData.values) {
      if (pt.description && pt.description.toLowerCase().includes("bank")) {
        paymentTypeId = pt.id;
        console.log("Fallback paymentType:", pt.id, "description:", pt.description);
        break;
      }
    }
  }
}

if (!paymentTypeId) {
  console.log("No payment type found! All types:");
  console.log(JSON.stringify(ptData.values, null, 2));
  process.exit(1);
}

// Step 2: Register payment - simple NOK payment
const invoiceId = 2147616501;
const paidAmount = 17365; // amountOutstanding
const paymentDate = "2026-03-21";

const payUrl = `${BASE}/invoice/${invoiceId}/:payment?paymentDate=${paymentDate}&paymentTypeId=${paymentTypeId}&paidAmount=${paidAmount}`;
console.log("\nPUT", payUrl);

const payRes = await fetch(payUrl, {
  method: "PUT",
  headers: { Authorization: AUTH, "Content-Type": "application/json" },
});
const payData = await payRes.json();
console.log("Payment status:", payRes.status);
console.log("Response:", JSON.stringify(payData, null, 2));
