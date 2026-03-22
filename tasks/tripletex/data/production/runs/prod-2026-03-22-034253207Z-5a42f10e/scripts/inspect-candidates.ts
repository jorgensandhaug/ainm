const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "E8jema3RH5ZbFyAIRYPnyvaGOUmwGlI673fT_TamVsE";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

const locateUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
const locateRes = await fetch(locateUrl, { headers });
const locateData = await locateRes.json();
const invoices = locateData.values || [];

const candidates = invoices.filter((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  const custMatch = inv.customer?.organizationNumber === "949502619";
  if (!custMatch) return false;
  const amtMatch = inv.amountExcludingVatCurrency === 11250 || inv.amountExcludingVat === 11250;
  if (!amtMatch) return false;
  const topDesc = (inv.orderLines || []).some((ol: any) => ol.description === "Programvarelisens");
  const nestedDesc = (inv.orders || []).some((o: any) =>
    (o.orderLines || []).some((ol: any) => ol.description === "Programvarelisens")
  );
  return topDesc || nestedDesc;
});

for (const c of candidates) {
  console.log("---");
  console.log("id:", c.id);
  console.log("invoiceNumber:", c.invoiceNumber);
  console.log("invoiceDate:", c.invoiceDate);
  console.log("isCreditNote:", c.isCreditNote);
  console.log("isCredited:", c.isCredited);
  console.log("amountExcludingVatCurrency:", c.amountExcludingVatCurrency);
  console.log("customer:", c.customer?.name, c.customer?.organizationNumber);
  console.log("orderLines:", JSON.stringify((c.orderLines || []).map((ol: any) => ({ id: ol.id, desc: ol.description, amt: ol.amountExcludingVatCurrency }))));
  console.log("orders:", JSON.stringify((c.orders || []).map((o: any) => ({ id: o.id, orderLines: (o.orderLines || []).map((ol: any) => ({ desc: ol.description, amt: ol.amountExcludingVatCurrency })) }))));
}
