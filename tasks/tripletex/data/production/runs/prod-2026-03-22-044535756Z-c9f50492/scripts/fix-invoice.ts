const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const AUTH = "Basic " + btoa("0:Tlyac0MmlwasEA5JjDDg-q84iU0ravcb4eEH_JFGiw4");
const h = { "Content-Type": "application/json", Authorization: AUTH };

const TODAY = new Date().toISOString().slice(0, 10);
const BUDGET = 200900;
const PROJECT_NAME = "Plataforma Datos Montaña";
const custId = 108522941;
const pId = 402062881;
const vatId = 3;

const dd = new Date(Date.UTC(+TODAY.slice(0,4), +TODAY.slice(5,7)-1, +TODAY.slice(8,10)+14)).toISOString().slice(0,10);

async function main() {
  // First check if an order already exists
  const r1 = await fetch(`${BASE}/order?customerId=${custId}&fields=id,invoiceId&count=10`, { headers: h });
  const orders = await r1.json();
  console.log("Existing orders:", JSON.stringify(orders));

  // Check if invoice already exists
  const r2 = await fetch(`${BASE}/invoice?customerId=${custId}&fields=id,invoiceNumber&count=10`, { headers: h });
  const invoices = await r2.json();
  console.log("Existing invoices:", JSON.stringify(invoices));

  if (invoices.values && invoices.values.length > 0) {
    console.log("Invoice already exists, done!");
    return;
  }

  // If order exists but no invoice, create invoice from existing order
  if (orders.values && orders.values.length > 0) {
    const orderId = orders.values[0].id;
    console.log("Order exists, creating invoice from order:", orderId);
    const r3 = await fetch(`${BASE}/invoice?sendToCustomer=false`, {
      method: "POST", headers: h,
      body: JSON.stringify({
        invoiceDate: TODAY, invoiceDueDate: dd, customer: { id: custId },
        orders: [{ id: orderId }],
      }),
    });
    const inv = await r3.json();
    console.log("Invoice result:", r3.status, JSON.stringify(inv).slice(0, 500));
    return;
  }

  // Otherwise create fresh
  const r3 = await fetch(`${BASE}/invoice?sendToCustomer=false`, {
    method: "POST", headers: h,
    body: JSON.stringify({
      invoiceDate: TODAY, invoiceDueDate: dd, customer: { id: custId },
      orders: [{
        customer: { id: custId },
        project: { id: pId },
        orderDate: TODAY, deliveryDate: TODAY,
        orderLines: [{
          description: PROJECT_NAME,
          count: 1,
          unitPriceExcludingVatCurrency: BUDGET,
          vatType: { id: vatId },
        }],
      }],
    }),
  });
  const inv = await r3.json();
  console.log("Invoice result:", r3.status, JSON.stringify(inv).slice(0, 500));
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
