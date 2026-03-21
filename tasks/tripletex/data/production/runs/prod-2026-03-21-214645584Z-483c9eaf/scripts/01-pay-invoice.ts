const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "TReAIWdbJFAiRGdawExZJsrGYaRqaqyRgNJrqzXJFF0";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: GET /invoice to find the unpaid invoice for Nordhav AS (841333608), 14200 excl MVA, "Skylagring"
const invUrl = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))`;
console.log("=== Step 1: GET /invoice ===");
const invRes = await fetch(invUrl, { headers: H });
console.log("Status:", invRes.status);
const invData = await invRes.json();

if (!invRes.ok) {
  console.log("ERROR:", JSON.stringify(invData));
  process.exit(1);
}

const invoices = invData.values || [];
console.log("Total invoices returned:", invoices.length);

// Filter: customer org 841333608, amountExcludingVatCurrency ~14200, outstanding > 0, description "Skylagring"
const matches = invoices.filter((inv: any) => {
  if (inv.customer?.organizationNumber !== "841333608") return false;
  if (inv.amountOutstanding <= 0 && inv.amountCurrencyOutstanding <= 0) return false;
  // Check description in orderLines and orders.orderLines
  const descriptions: string[] = [];
  if (inv.orderLines) {
    for (const ol of inv.orderLines) {
      if (ol.description) descriptions.push(ol.description);
    }
  }
  if (inv.orders) {
    for (const order of inv.orders) {
      if (order.orderLines) {
        for (const ol of order.orderLines) {
          if (ol.description) descriptions.push(ol.description);
        }
      }
    }
  }
  const hasDesc = descriptions.some((d: string) => d.toLowerCase().includes("skylagring"));
  return hasDesc;
});

console.log("Matching invoices:", matches.length);
if (matches.length === 0) {
  console.log("No matching invoice found!");
  process.exit(1);
}

const invoice = matches[0];
console.log("Invoice ID:", invoice.id);
console.log("Invoice number:", invoice.invoiceNumber);
console.log("Amount excl VAT:", invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat);
console.log("Amount outstanding:", invoice.amountOutstanding);
console.log("Amount currency outstanding:", invoice.amountCurrencyOutstanding);
console.log("Customer:", invoice.customer?.name, invoice.customer?.organizationNumber);

const paidAmount = invoice.amountOutstanding > 0 ? invoice.amountOutstanding : invoice.amountCurrencyOutstanding;
console.log("Will pay amount:", paidAmount);

// Step 2: GET /invoice/paymentType
console.log("\n=== Step 2: GET /invoice/paymentType ===");
const ptUrl = `${BASE}/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`;
const ptRes = await fetch(ptUrl, { headers: H });
console.log("Status:", ptRes.status);
const ptData = await ptRes.json();

if (!ptRes.ok) {
  console.log("ERROR:", JSON.stringify(ptData));
  process.exit(1);
}

const paymentTypes = ptData.values || [];
console.log("Payment types count:", paymentTypes.length);

// Prefer "Betalt til bank" or debitAccount.number starting with 19
let chosenPt = paymentTypes.find((pt: any) => pt.description === "Betalt til bank");
if (!chosenPt) {
  chosenPt = paymentTypes.find((pt: any) => pt.debitAccount?.number?.toString().startsWith("19"));
}
if (!chosenPt) {
  chosenPt = paymentTypes[0];
}

console.log("Chosen payment type ID:", chosenPt.id);
console.log("Chosen payment type description:", chosenPt.description);
console.log("Debit account:", chosenPt.debitAccount?.number);

// Step 3: PUT /invoice/{id}/:payment — all params as query parameters
const today = new Date().toISOString().slice(0, 10);
const payUrl = `${BASE}/invoice/${invoice.id}/:payment?paymentDate=${today}&paymentTypeId=${chosenPt.id}&paidAmount=${paidAmount}`;
console.log("\n=== Step 3: PUT /invoice/:payment ===");
console.log("URL:", payUrl);
const payRes = await fetch(payUrl, { method: "PUT", headers: H });
console.log("Status:", payRes.status);
const payData = await payRes.json();
console.log("Response:", JSON.stringify(payData, null, 2));

if (!payRes.ok) {
  console.log("PAYMENT FAILED");
  process.exit(1);
}

console.log("\n=== DONE ===");
console.log("Payment registered successfully.");
