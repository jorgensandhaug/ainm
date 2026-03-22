const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "E8jema3RH5ZbFyAIRYPnyvaGOUmwGlI673fT_TamVsE";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-22";
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

// Credit the latest matching invoice (invoiceNumber 2)
const targetId = 2147663977;
const creditUrl = `${BASE}/invoice/${targetId}/:createCreditNote?date=${DATE}&sendToCustomer=false`;
console.log("PUT", creditUrl);
const creditRes = await fetch(creditUrl, { method: "PUT", headers });
if (!creditRes.ok) {
  console.error("Credit note failed:", creditRes.status, await creditRes.text());
  process.exit(1);
}
const creditData = await creditRes.json();
const cn = creditData.value;
console.log("Credit note created:");
console.log("  id:", cn.id);
console.log("  invoiceNumber:", cn.invoiceNumber);
console.log("  isCreditNote:", cn.isCreditNote);
console.log("  creditedInvoice:", cn.creditedInvoice);
console.log("  amountExcludingVatCurrency:", cn.amountExcludingVatCurrency);
console.log("Done.");
