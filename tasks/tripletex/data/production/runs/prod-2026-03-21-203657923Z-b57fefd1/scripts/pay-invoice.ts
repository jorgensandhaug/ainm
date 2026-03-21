const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "S5H3bcs9myhcGT_4xJIiD-ENu1xbjIzc8zIPPek4zQU";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // Invoice 2147572074, outstanding 39125, paymentType 28180406 "Betalt til bank"
  // All resolved from prior calls. Now just PUT payment with query params.
  const payUrl = `${BASE}/invoice/2147572074/:payment?paymentDate=2026-03-21&paymentTypeId=28180406&paidAmount=39125`;
  console.log("PUT", payUrl);
  const payRes = await fetch(payUrl, { method: "PUT", headers: H });
  const payData = await payRes.json();
  console.log("Payment response status:", payRes.status);
  console.log("Payment response:", JSON.stringify(payData, null, 2));

  if (!payRes.ok) {
    console.error("Payment failed");
    process.exit(1);
  }

  const remaining = payData.value?.amountOutstanding ?? payData.value?.amountCurrencyOutstanding;
  console.log("Remaining outstanding:", remaining);
  if (remaining === 0) {
    console.log("SUCCESS: Invoice fully paid");
  } else {
    console.log("WARNING: Remaining outstanding is not zero:", remaining);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
