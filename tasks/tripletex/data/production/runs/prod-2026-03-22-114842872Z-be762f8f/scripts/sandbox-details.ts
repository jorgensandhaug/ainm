const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");
const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  if (!r.ok) console.log(`GET ${path} ${r.status}: ${JSON.stringify(b).slice(0, 300)}`);
  return b;
}

async function main() {
  // Get the invoice details for the most recent sandbox lifecycle invoice
  // Invoice ID from sandbox run: 2147702944
  const invId = 2147702944;

  // 1. Get invoice with projectInvoiceDetails expansion
  const inv = await get(`/invoice/${invId}?fields=*,projectInvoiceDetails(*)`);
  console.log("INVOICE WITH DETAILS:", JSON.stringify(inv.value?.projectInvoiceDetails, null, 2));

  // 2. Get invoice details directly
  const detailId = inv.value?.projectInvoiceDetails?.[0]?.id;
  if (detailId) {
    const detail = await get(`/invoice/details/${detailId}?fields=*`);
    console.log("\nINVOICE DETAIL FULL:", JSON.stringify(detail.value, null, 2));
  }

  // 3. Check if there are project/period endpoints with correct params
  const pId = 402082721;  // from sandbox
  const today = "2026-03-22";

  // Try with dateFrom/dateTo directly
  try {
    const reserve = await get(`/project/${pId}/period/invoicingReserve?dateFrom=${today}&dateTo=2027-01-01`);
    console.log("\nPROJECT RESERVE:", JSON.stringify(reserve, null, 2));
  } catch (e: any) { console.log("Reserve error:", e.message); }

  try {
    const hourlist = await get(`/project/${pId}/period/hourlistReport?dateFrom=${today}&dateTo=2027-01-01`);
    console.log("\nHOURLIST:", JSON.stringify(hourlist, null, 2));
  } catch (e: any) { console.log("Hourlist error:", e.message); }

  // 4. Look at the order to check if orderLines have project linkage
  const ordId = 402082731;  // from sandbox
  const ord = await get(`/order/${ordId}?fields=*,orderLines(*,product(*),vatType(*))`);
  console.log("\nORDER FULL:", JSON.stringify({
    id: ord.value?.id,
    status: ord.value?.status,
    project: ord.value?.project,
    orderLines: ord.value?.orderLines,
  }, null, 2));

  // 5. Check balance sheet for project view
  try {
    const bs = await get(`/balanceSheet?dateFrom=${today}&dateTo=2027-01-01&projectId=${pId}&fields=*`);
    console.log("\nBALANCE SHEET:", JSON.stringify(bs.values?.slice(0, 5), null, 2));
  } catch (e: any) { console.log("Balance error:", e.message); }

  // 6. Check the project's complete state including all nested fields
  const projFull = await get(`/project/${pId}?fields=*`);
  console.log("\nPROJECT ALL FIELDS:", JSON.stringify(projFull.value, null, 2));
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
