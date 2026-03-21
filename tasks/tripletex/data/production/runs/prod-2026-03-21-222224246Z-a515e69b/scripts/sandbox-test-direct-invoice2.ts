// Sandbox test: POST /invoice with customer inside orders[]
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers: h });
  const body = await r.json();
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return body;
}
async function post(path: string, data: any) {
  const url = `${BASE}${path}`;
  console.log(`POST ${url}`);
  const r = await fetch(url, { method: "POST", headers: h, body: JSON.stringify(data) });
  const body = await r.json();
  console.log("Status:", r.status, "Body:", JSON.stringify(body).slice(0, 2000));
  if (!r.ok) throw new Error(`POST ${r.status}`);
  return body;
}

async function main() {
  // Already known from previous test
  const empId = 18478235;
  const projId = 401959961;
  const custId = 108247218;
  const actId = 5588719;
  const vatId = 6; // 0% in sandbox

  // Try POST /invoice with customer in both root and orders
  const today = "2026-11-16";
  const dueDate = "2026-12-16";
  try {
    const invRes = await post("/invoice?sendToCustomer=false", {
      invoiceDate: today,
      invoiceDueDate: dueDate,
      customer: { id: custId },
      orders: [{
        customer: { id: custId },
        project: { id: projId },
        orderDate: today,
        deliveryDate: today,
        orderLines: [{
          description: "Prosjektadministrasjon",
          count: 8,
          unitPriceExcludingVatCurrency: 850,
          vatType: { id: vatId }
        }]
      }]
    });
    const inv = invRes.value;
    console.log("\n=== SUCCESS ===");
    console.log("Invoice ID:", inv?.id);
    console.log("Invoice number:", inv?.invoiceNumber);
    console.log("amountExVat:", inv?.amountExcludingVatCurrency);
    console.log("outstanding:", inv?.amountCurrencyOutstanding);
    console.log("customer.id:", inv?.customer?.id);
    console.log("projectInvoiceDetails:", JSON.stringify(inv?.projectInvoiceDetails));
  } catch (e: any) {
    console.error("FAILED:", e.message);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
