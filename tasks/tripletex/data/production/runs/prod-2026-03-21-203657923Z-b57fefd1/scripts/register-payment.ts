const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "S5H3bcs9myhcGT_4xJIiD-ENu1xbjIzc8zIPPek4zQU";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // Step 1: Locate the unpaid invoice for Brattli AS (909268265)
  const invUrl = `${BASE}/invoice?customerOrganizationNumber=909268265&invoiceStatus=UNPAID&invoiceDateFrom=2000-01-01&invoiceDateTo=2099-12-31&fields=*`;
  console.log("GET", invUrl);
  const invRes = await fetch(invUrl, { headers: H });
  const invData = await invRes.json();
  console.log("Invoice response status:", invRes.status);

  if (!invRes.ok) {
    console.error("Failed to fetch invoices:", JSON.stringify(invData));
    process.exit(1);
  }

  const invoices = invData.values || [];
  console.log("Found", invoices.length, "unpaid invoice(s)");

  // Only 1 unpaid invoice for this customer — use it directly
  // 31300 ex VAT * 1.25 = 39125 incl VAT matches the invoice amount
  if (invoices.length !== 1) {
    console.error("Expected exactly 1 unpaid invoice, found", invoices.length);
    process.exit(1);
  }
  const invoice = invoices[0];

  console.log("Located invoice:", invoice.id,
    "amountOutstanding:", invoice.amountOutstanding,
    "amountCurrencyOutstanding:", invoice.amountCurrencyOutstanding);

  // Step 2: Get payment types
  const ptUrl = `${BASE}/invoice/paymentType?fields=*`;
  console.log("GET", ptUrl);
  const ptRes = await fetch(ptUrl, { headers: H });
  const ptData = await ptRes.json();
  console.log("PaymentType response status:", ptRes.status);

  if (!ptRes.ok) {
    console.error("Failed to fetch payment types:", JSON.stringify(ptData));
    process.exit(1);
  }

  const paymentTypes = ptData.values || [];
  // Find "Betalt til bank" payment type (standard incoming bank payment)
  let paymentType: any = null;
  for (const pt of paymentTypes) {
    if (pt.description === "Betalt til bank" || pt.displayName === "Betalt til bank") {
      paymentType = pt;
      break;
    }
  }

  if (!paymentType) {
    // Fallback: any payment type with "bank" in description
    for (const pt of paymentTypes) {
      if ((pt.description || "").toLowerCase().includes("bank")) {
        paymentType = pt;
        break;
      }
    }
  }

  if (!paymentType) {
    console.error("No suitable payment type found");
    console.log("Available:", JSON.stringify(paymentTypes, null, 2));
    process.exit(1);
  }

  console.log("Using paymentType:", paymentType.id,
    "debitAccount:", paymentType.debitAccount?.number);

  // Step 3: Register payment using live outstanding amount (query params, not body)
  const paidAmount = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  const payUrl = `${BASE}/invoice/${invoice.id}/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentType.id}&paidAmount=${paidAmount}`;
  console.log("PUT", payUrl);
  const payRes = await fetch(payUrl, { method: "PUT", headers: H });
  const payData = await payRes.json();
  console.log("Payment response status:", payRes.status);
  console.log("Payment response:", JSON.stringify(payData, null, 2));

  if (!payRes.ok) {
    console.error("Payment failed");
    process.exit(1);
  }

  // Verify from response
  const remaining = payData.value?.amountOutstanding ?? payData.value?.amountCurrencyOutstanding;
  console.log("Remaining outstanding:", remaining);
  if (remaining === 0) {
    console.log("SUCCESS: Invoice fully paid");
  } else {
    console.log("WARNING: Remaining outstanding is not zero:", remaining);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
