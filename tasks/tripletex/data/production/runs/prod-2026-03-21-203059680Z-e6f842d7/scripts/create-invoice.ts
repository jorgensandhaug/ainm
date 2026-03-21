const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Ba2VKHrmzrcJCy7QK2lMwbFhFNzt2kG-evGOxnipUPY";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  if (!r.ok) {
    console.error(`${method} ${path} -> ${r.status}`, JSON.stringify(json));
    return { ok: false, status: r.status, json };
  }
  console.log(`${method} ${path} -> ${r.status}`);
  return { ok: true, status: r.status, json };
}

async function main() {
  // 1. Resolve customer
  const custRes = await api("GET", "/customer?organizationNumber=869972401&fields=*");
  if (!custRes.ok) { console.error("BLOCKED"); return; }
  const customers = custRes.json.values;
  if (!customers || customers.length === 0) { console.error("Customer not found"); return; }
  const customer = customers[0];
  console.log("Customer:", customer.id, customer.name);

  // 2. Resolve products (comma-separated number query, OR semantics)
  const prodRes = await api("GET", "/product?number=7733,6106,1351&fields=*");
  if (!prodRes.ok) { console.error("Product read failed"); return; }
  const products = prodRes.json.values;
  if (!products || products.length < 3) {
    console.error("Expected 3 products, got", products?.length);
    // Fallback to catalog read
    const catRes = await api("GET", "/product?count=1000&fields=*");
    if (!catRes.ok) { console.error("Catalog read failed"); return; }
    const catalog = catRes.json.values;
    const byNum = new Map(catalog.map((p: any) => [String(p.number), p]));
    const p7733 = byNum.get("7733");
    const p6106 = byNum.get("6106");
    const p1351 = byNum.get("1351");
    if (!p7733 || !p6106 || !p1351) { console.error("Products missing from catalog"); return; }
    await createInvoice(customer, p7733, p6106, p1351);
    return;
  }

  const byNum = new Map(products.map((p: any) => [String(p.number), p]));
  const p7733 = byNum.get("7733");
  const p6106 = byNum.get("6106");
  const p1351 = byNum.get("1351");
  if (!p7733 || !p6106 || !p1351) { console.error("Product number mismatch"); return; }

  await createInvoice(customer, p7733, p6106, p1351);
}

async function createInvoice(customer: any, p7733: any, p6106: any, p1351: any) {
  console.log("Products:", p7733.id, p7733.name, "vat:", p7733.vatType?.id,
    "|", p6106.id, p6106.name, "vat:", p6106.vatType?.id,
    "|", p1351.id, p1351.name, "vat:", p1351.vatType?.id);

  const today = "2026-03-21";
  const due = "2026-04-04";

  const payload = {
    invoiceDate: today,
    invoiceDueDate: due,
    customer: { id: customer.id },
    orders: [
      {
        customer: { id: customer.id },
        orderDate: today,
        deliveryDate: today,
        orderLines: [
          {
            product: { id: p7733.id },
            description: "Sessão de formação",
            count: 1,
            unitPriceExcludingVatCurrency: 22950,
            vatType: { id: p7733.vatType.id }
          },
          {
            product: { id: p6106.id },
            description: "Licença de software",
            count: 1,
            unitPriceExcludingVatCurrency: 10250,
            vatType: { id: p6106.vatType.id }
          },
          {
            product: { id: p1351.id },
            description: "Manutenção",
            count: 1,
            unitPriceExcludingVatCurrency: 3150,
            vatType: { id: p1351.vatType.id }
          }
        ]
      }
    ]
  };

  const invRes = await api("POST", "/invoice?sendToCustomer=false", payload);
  if (!invRes.ok) {
    // Bank account repair branch
    const errMsg = JSON.stringify(invRes.json);
    if (errMsg.includes("bankkontonummer") || errMsg.includes("bank account")) {
      console.log("Bank account repair needed");
      const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
      if (!bankRes.ok) return;
      const accounts = bankRes.json.values;
      const invoiceAcct = accounts.find((a: any) => a.isInvoiceAccount || a.number === 1920);
      if (!invoiceAcct) { console.error("No invoice bank account found"); return; }
      console.log("Repairing bank account:", invoiceAcct.id, invoiceAcct.number);
      const putRes = await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
        ...invoiceAcct,
        bankAccountNumber: "12345678903"
      });
      if (!putRes.ok) return;
      // Retry invoice
      const retryRes = await api("POST", "/invoice?sendToCustomer=false", payload);
      if (!retryRes.ok) { console.error("Invoice retry failed"); return; }
      console.log("Invoice created (after repair):", JSON.stringify(retryRes.json.value, null, 2));
      return;
    }
    console.error("Invoice creation failed");
    return;
  }

  console.log("Invoice created:", JSON.stringify(invRes.json.value, null, 2));
}

main();
