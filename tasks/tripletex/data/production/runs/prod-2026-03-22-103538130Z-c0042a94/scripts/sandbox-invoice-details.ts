const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");
const h = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = new Date().toISOString().slice(0, 10);

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  if (!r.ok) { console.log(`GET ${path} → ${r.status}:`, JSON.stringify(b).slice(0, 300)); return null; }
  return b;
}

async function main() {
  // Find existing invoices and their details
  const invs = await get("/invoice?count=5&fields=*,orders(*),projectInvoiceDetails(*)&orderBy=-id");
  if (invs?.values) {
    for (const inv of invs.values.slice(0, 3)) {
      console.log("\n=== INVOICE", inv.id, "===");
      console.log("invoiceNumber:", inv.invoiceNumber);
      console.log("customer:", JSON.stringify(inv.customer));
      console.log("amountExcludingVatCurrency:", inv.amountExcludingVatCurrency);
      console.log("isApproved:", inv.isApproved);
      console.log("orders:", JSON.stringify(inv.orders));
      console.log("projectInvoiceDetails:", JSON.stringify(inv.projectInvoiceDetails, null, 2));

      // Dig into projectInvoiceDetails
      if (inv.projectInvoiceDetails?.length) {
        for (const detail of inv.projectInvoiceDetails) {
          const d = await get(`/invoice/details/${detail.id}?fields=*`);
          console.log("  detail:", JSON.stringify(d?.value, null, 2).slice(0, 1000));
        }
      }

      // Check order lines
      if (inv.orders?.length) {
        for (const order of inv.orders) {
          const o = await get(`/order/${order.id}?fields=*,orderLines(*)`);
          console.log("  order:", JSON.stringify({
            id: o?.value?.id,
            status: o?.value?.status,
            project: o?.value?.project,
            orderLines: o?.value?.orderLines,
          }, null, 2).slice(0, 1000));
        }
      }
    }
  }

  // Also check: what does a project invoice look like when created differently?
  // Let me check /invoice endpoint fields
  console.log("\n=== INVOICE SCHEMA FIELDS ===");
  const inv0 = invs?.values?.[0];
  if (inv0) {
    console.log("All fields:", Object.keys(inv0).join(", "));
  }

  // Check the project order lines
  console.log("\n=== PROJECT ORDER LINES ===");
  // Find projects with order lines
  const projects = await get("/project?count=5&fields=id,name&orderBy=-id");
  if (projects?.values) {
    for (const p of projects.values.slice(0, 3)) {
      const ols = await get(`/project/orderline?projectId=${p.id}&count=10&fields=*`);
      if (ols?.values?.length) {
        console.log(`Project ${p.id} (${p.name}): ${ols.values.length} orderlines`);
        for (const ol of ols.values) {
          console.log(`  OL ${ol.id}: desc=${ol.description}, cost=${ol.unitCostCurrency}, price=${ol.unitPriceExcludingVatCurrency}, vendor=${JSON.stringify(ol.vendor)}, isChargeable=${ol.isChargeable}`);
        }
      }
    }
  }
}

main().catch(e => console.error("FATAL:", e.message));
