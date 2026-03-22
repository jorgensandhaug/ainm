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
  // Get invoices with required date params
  const invs = await get(`/invoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-01-01&count=5&fields=*&orderBy=-id`);
  if (invs?.values) {
    for (const inv of invs.values.slice(0, 3)) {
      console.log("\n=== INVOICE", inv.id, "===");
      console.log("Full invoice:", JSON.stringify(inv, null, 2).slice(0, 3000));

      // Check projectInvoiceDetails
      if (inv.projectInvoiceDetails?.length) {
        for (const detail of inv.projectInvoiceDetails) {
          const d = await get(`/invoice/details/${detail.id}?fields=*`);
          console.log("\n  DETAIL", detail.id, ":", JSON.stringify(d?.value, null, 2).slice(0, 2000));
        }
      }

      // Check order lines via the order
      if (inv.orders?.length) {
        for (const order of inv.orders) {
          const o = await get(`/order/${order.id}?fields=*`);
          console.log("\n  ORDER", order.id, ":", JSON.stringify(o?.value, null, 2).slice(0, 1500));

          // Get order lines
          const olRes = await get(`/order/orderline?orderId=${order.id}&fields=*`);
          console.log("  ORDER LINES:", JSON.stringify(olRes?.values, null, 2).slice(0, 1500));
        }
      }
    }
  }

  // Also check: project details for recent projects
  console.log("\n=== RECENT PROJECTS ===");
  const projects = await get("/project?count=3&fields=*&orderBy=-id");
  if (projects?.values) {
    for (const p of projects.values.slice(0, 2)) {
      console.log("\nProject:", JSON.stringify({
        id: p.id, name: p.name, isFixedPrice: p.isFixedPrice,
        fixedprice: p.fixedprice, projectManager: p.projectManager,
        customer: p.customer, projectCategory: p.projectCategory,
        department: p.department,
      }, null, 2));
    }
  }
}

main().catch(e => console.error("FATAL:", e.message));
