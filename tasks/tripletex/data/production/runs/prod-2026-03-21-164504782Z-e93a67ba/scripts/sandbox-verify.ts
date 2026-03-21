const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const hdrs: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

// 1. List unpaid invoices to find one we can test with
console.log("=== Step 1: GET /invoice (find unpaid) ===");
const invRes = await fetch(`${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=50&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))`, { headers: hdrs });
const invData = await invRes.json();
console.log("Status:", invRes.status, "count:", invData.fullResultSize);

const unpaid = (invData.values || []).filter((inv: any) => {
  const outstanding = inv.amountCurrencyOutstanding ?? inv.amountOutstanding ?? 0;
  return outstanding > 0;
});
console.log("Unpaid invoices:", unpaid.length);
for (const inv of unpaid.slice(0, 5)) {
  console.log(`  id=${inv.id} customer=${inv.customer?.name} orgNr=${inv.customer?.organizationNumber} exVat=${inv.amountExcludingVatCurrency} outstanding=${inv.amountCurrencyOutstanding ?? inv.amountOutstanding}`);
  const lines = [...(inv.orderLines || []), ...(inv.orders || []).flatMap((o: any) => o.orderLines || [])];
  for (const l of lines) console.log(`    line: "${l.description}" / "${l.displayName}"`);
  // Check if invoice itself has any payment-type related fields
  const ptKeys = Object.keys(inv).filter(k => k.toLowerCase().includes("payment") || k.toLowerCase().includes("paymenttype"));
  if (ptKeys.length) console.log(`    payment-related keys:`, ptKeys);
}

// 2. Check payment types
console.log("\n=== Step 2: GET /invoice/paymentType ===");
const ptRes = await fetch(`${BASE}/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`, { headers: hdrs });
const ptData = await ptRes.json();
console.log("Status:", ptRes.status, "count:", ptData.fullResultSize);
for (const pt of (ptData.values || [])) {
  console.log(`  id=${pt.id} name=${pt.name} debitAcct=${pt.debitAccount?.number} creditAcct=${pt.creditAccount?.number} isBankAcct=${pt.debitAccount?.isBankAccount} isInvAcct=${pt.debitAccount?.isInvoiceAccount}`);
}

// 3. Try a 2-call shortcut: PUT payment without reading paymentType first, using a guessed/default id
// (This should fail if no paymentTypeId is provided)
if (unpaid.length > 0) {
  const testInv = unpaid[0];
  const testOutstanding = testInv.amountCurrencyOutstanding ?? testInv.amountOutstanding;

  console.log("\n=== Probe A: PUT payment WITHOUT paymentTypeId ===");
  const probeA = await fetch(`${BASE}/invoice/${testInv.id}/:payment?paymentDate=2026-03-21&paidAmount=${testOutstanding}`, { method: "PUT", headers: hdrs });
  const probeAData = await probeA.json();
  console.log("Status:", probeA.status);
  if (probeA.status !== 200) {
    console.log("Error:", JSON.stringify(probeAData).slice(0, 500));
  }

  // 4. Try using paymentTypeId=0 as a default
  console.log("\n=== Probe B: PUT payment with paymentTypeId=0 ===");
  const probeB = await fetch(`${BASE}/invoice/${testInv.id}/:payment?paymentDate=2026-03-21&paymentTypeId=0&paidAmount=${testOutstanding}`, { method: "PUT", headers: hdrs });
  const probeBData = await probeB.json();
  console.log("Status:", probeB.status);
  if (probeB.status !== 200) {
    console.log("Error:", JSON.stringify(probeBData).slice(0, 500));
  }
}
