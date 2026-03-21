const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "VIjxvJ1Ho36yb5szu0u3s7tAzbsVSWf-T8sd11TAvzA";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Locate invoice
const locateUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
const locateRes = await fetch(locateUrl, { headers: H });
const locateData = await locateRes.json();
console.log("Locate status:", locateRes.status, "count:", locateData.count);

if (locateRes.status !== 200) {
  console.error("Locate failed:", JSON.stringify(locateData));
  process.exit(1);
}

// Filter: org 978503071, amount 25450, description "Licencia de software", not credit note, not credited
const invoices = (locateData.values || []).filter((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  if (inv.customer?.organizationNumber !== "978503071") return false;
  if (inv.amountExcludingVatCurrency !== 25450 && inv.amountExcludingVat !== 25450) return false;
  const desc = "Licencia de software";
  const topMatch = (inv.orderLines || []).some((l: any) => l.description === desc);
  const nestedMatch = (inv.orders || []).some((o: any) =>
    (o.orderLines || []).some((l: any) => l.description === desc)
  );
  return topMatch || nestedMatch;
});

console.log("Matching invoices:", invoices.length);
if (invoices.length !== 1) {
  console.error("Expected exactly 1 match, got", invoices.length);
  // Log candidates for debugging
  invoices.forEach((inv: any) => console.log("  candidate id:", inv.id, "number:", inv.invoiceNumber, "amount:", inv.amountExcludingVatCurrency));
  process.exit(1);
}

const targetId = invoices[0].id;
console.log("Target invoice id:", targetId, "number:", invoices[0].invoiceNumber);

// Step 2: Create credit note
const creditUrl = `${BASE}/invoice/${targetId}/:createCreditNote?date=2026-03-22&sendToCustomer=false`;
const creditRes = await fetch(creditUrl, { method: "PUT", headers: H });
const creditData = await creditRes.json();
console.log("Credit note status:", creditRes.status);

if (creditRes.status >= 400) {
  console.error("Credit note failed:", JSON.stringify(creditData));
  process.exit(1);
}

const cn = creditData.value;
console.log("Credit note id:", cn.id);
console.log("Credit note number:", cn.invoiceNumber);
console.log("isCreditNote:", cn.isCreditNote);
console.log("creditedInvoice:", cn.creditedInvoice);
console.log("amountExcludingVatCurrency:", cn.amountExcludingVatCurrency);
console.log("Done — 2 API calls, 0 errors.");
