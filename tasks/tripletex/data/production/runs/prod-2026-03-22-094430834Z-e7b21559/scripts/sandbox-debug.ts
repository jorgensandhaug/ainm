const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function run() {
  const res = await fetch(`${BASE}/invoice/2147690392?fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`, {
    headers: { Authorization: AUTH }
  });
  const data = await res.json();
  const inv = data.value;
  console.log("amountExcludingVat:", inv.amountExcludingVat);
  console.log("amountExcludingVatCurrency:", inv.amountExcludingVatCurrency);
  console.log("isCreditNote:", inv.isCreditNote);
  console.log("isCredited:", inv.isCredited);
  console.log("customer.organizationNumber:", inv.customer?.organizationNumber);
  console.log("orderLines:", JSON.stringify(inv.orderLines?.map((ol: any) => ({ desc: ol.description, amt: ol.amountExcludingVatCurrency })), null, 2));
  console.log("orders[0].orderLines:", JSON.stringify(inv.orders?.[0]?.orderLines?.map((ol: any) => ({ desc: ol.description, amt: ol.amountExcludingVatCurrency })), null, 2));
}
run();
