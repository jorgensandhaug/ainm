const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "h8uzues5lK1nUYbtqDNoNGPzqtyKGF_Dhg2nucx5Flk";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const hdrs = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Locate the invoice
const invUrl = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))`;
console.log("=== Step 1: GET /invoice ===");
const invRes = await fetch(invUrl, { headers: hdrs });
const invData = await invRes.json();
console.log("Status:", invRes.status);
console.log("Total count:", invData.fullResultSize);

const invoices = (invData.values || []).filter((inv: any) => {
  if (inv.customer?.organizationNumber !== "896571559") return false;
  const outstanding = inv.amountCurrencyOutstanding ?? inv.amountOutstanding ?? 0;
  if (outstanding <= 0) return false;
  const exVat = inv.amountExcludingVatCurrency ?? inv.amountExcludingVat ?? 0;
  if (exVat !== 15200) return false;
  // Check for "Datarådgivning" in order lines
  const allLines: any[] = [
    ...(inv.orderLines || []),
    ...(inv.orders || []).flatMap((o: any) => o.orderLines || []),
  ];
  return allLines.some(
    (l: any) =>
      (l.description || "").includes("Datarådgivning") ||
      (l.displayName || "").includes("Datarådgivning")
  );
});

if (invoices.length !== 1) {
  console.error("Expected exactly 1 matching invoice, found", invoices.length);
  if (invoices.length > 0) invoices.forEach((i: any) => console.log("  id:", i.id, "outstanding:", i.amountCurrencyOutstanding ?? i.amountOutstanding));
  process.exit(1);
}

const inv = invoices[0];
const invoiceId = inv.id;
const paidAmount = inv.amountCurrencyOutstanding ?? inv.amountOutstanding;
console.log("Found invoice:", invoiceId, "outstanding:", paidAmount, "exVat:", inv.amountExcludingVatCurrency ?? inv.amountExcludingVat);

// Step 2: Get payment type
const ptUrl = `${BASE}/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`;
console.log("\n=== Step 2: GET /invoice/paymentType ===");
const ptRes = await fetch(ptUrl, { headers: hdrs });
const ptData = await ptRes.json();
console.log("Status:", ptRes.status);

const paymentTypes = (ptData.values || []);
// Prefer bank-style incoming payment type with 19xx debit account
let chosen = paymentTypes.find((pt: any) => {
  const acctNum = String(pt.debitAccount?.number || "");
  return acctNum.startsWith("19") && (pt.debitAccount?.isBankAccount || pt.debitAccount?.isInvoiceAccount);
});
if (!chosen) {
  chosen = paymentTypes.find((pt: any) => String(pt.debitAccount?.number || "").startsWith("19"));
}
if (!chosen && paymentTypes.length > 0) {
  chosen = paymentTypes[0];
}
if (!chosen) {
  console.error("No payment type found");
  process.exit(1);
}
console.log("Chosen paymentType:", chosen.id, "name:", chosen.name, "debitAccount:", chosen.debitAccount?.number);

// Step 3: Register full payment
const payUrl = `${BASE}/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${chosen.id}&paidAmount=${paidAmount}`;
console.log("\n=== Step 3: PUT /invoice/:payment ===");
const payRes = await fetch(payUrl, { method: "PUT", headers: hdrs });
const payData = await payRes.json();
console.log("Status:", payRes.status);
const remaining = payData.value?.amountCurrencyOutstanding ?? payData.value?.amountOutstanding ?? "unknown";
console.log("Remaining outstanding:", remaining);

if (remaining === 0) {
  console.log("\nSUCCESS: Invoice fully paid.");
} else {
  console.log("\nWARNING: Remaining outstanding is not 0:", remaining);
}
