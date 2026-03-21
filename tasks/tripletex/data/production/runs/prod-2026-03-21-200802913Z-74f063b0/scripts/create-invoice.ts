const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "O1m3IwC1jGnmyHEQMoGEg7BJidoFYhz8Vo_oYldK4tc";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(BASE + path, { headers: H });
  const body = await r.json();
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${JSON.stringify(body)}`);
  return body;
}

async function post(path: string, data: any) {
  const r = await fetch(BASE + path, { method: "POST", headers: H, body: JSON.stringify(data) });
  const body = await r.json();
  if (!r.ok) return { ok: false, status: r.status, body };
  return { ok: true, status: r.status, body };
}

async function put(path: string, data: any) {
  const r = await fetch(BASE + path, { method: "PUT", headers: H, body: JSON.stringify(data) });
  const body = await r.json();
  if (!r.ok) throw new Error(`PUT ${path} ${r.status}: ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  // 1. Resolve customer
  const custResp = await get("/customer?organizationNumber=909007135&fields=*");
  if (!custResp.values?.length) throw new Error("Customer not found");
  const customer = custResp.values[0];
  console.log("Customer:", customer.id, customer.name);

  // 2. Resolve products by number (comma-separated, OR semantics)
  const prodResp = await get("/product?number=8344,9563,8060&fields=*");
  const products = prodResp.values || [];
  console.log("Products found:", products.length);

  if (products.length < 3) {
    // Fallback to catalog read
    console.log("Partial product match, falling back to catalog read...");
    const catalogResp = await get("/product?count=1000&fields=*");
    const catalog = catalogResp.values || [];
    const needed = new Set(["8344", "9563", "8060"]);
    const resolved: Record<string, any> = {};
    for (const p of products) resolved[String(p.number)] = p;
    for (const p of catalog) {
      if (needed.has(String(p.number)) && !resolved[String(p.number)]) {
        resolved[String(p.number)] = p;
      }
    }
    if (Object.keys(resolved).length < 3) throw new Error("Could not resolve all products");
    return await createInvoice(customer, resolved["8344"], resolved["9563"], resolved["8060"]);
  }

  // Map by number
  const byNum: Record<string, any> = {};
  for (const p of products) byNum[String(p.number)] = p;
  return await createInvoice(customer, byNum["8344"], byNum["9563"], byNum["8060"]);
}

async function createInvoice(customer: any, prod8344: any, prod9563: any, prod8060: any) {
  console.log("Product 8344:", prod8344.id, prod8344.name, "vatType.id:", prod8344.vatType?.id);
  console.log("Product 9563:", prod9563.id, prod9563.name, "vatType.id:", prod9563.vatType?.id);
  console.log("Product 8060:", prod8060.id, prod8060.name, "vatType.id:", prod8060.vatType?.id);

  const invoiceDate = "2026-03-21";
  const invoiceDueDate = "2026-04-04";

  const payload = {
    invoiceDate,
    invoiceDueDate,
    customer: { id: customer.id },
    orders: [
      {
        customer: { id: customer.id },
        orderDate: invoiceDate,
        deliveryDate: invoiceDate,
        orderLines: [
          {
            product: { id: prod8344.id },
            description: "Desarrollo de sistemas",
            count: 1,
            unitPriceExcludingVatCurrency: 19250,
            vatType: { id: prod8344.vatType?.id }
          },
          {
            product: { id: prod9563.id },
            description: "Horas de consultoría",
            count: 1,
            unitPriceExcludingVatCurrency: 10000,
            vatType: { id: prod9563.vatType?.id }
          },
          {
            product: { id: prod8060.id },
            description: "Informe de análisis",
            count: 1,
            unitPriceExcludingVatCurrency: 15800,
            vatType: { id: prod8060.vatType?.id }
          }
        ]
      }
    ]
  };

  let result = await post("/invoice?sendToCustomer=false", payload);

  // Bank account repair if needed
  if (!result.ok && result.status === 422) {
    const errMsg = JSON.stringify(result.body);
    if (errMsg.includes("bankkontonummer") || errMsg.includes("bank account")) {
      console.log("Bank account repair needed...");
      const acctResp = await get("/ledger/account?isBankAccount=true&fields=*");
      const invoiceAcct = acctResp.values?.find((a: any) => a.isInvoiceAccount) || acctResp.values?.[0];
      if (!invoiceAcct) throw new Error("No bank account found");
      console.log("Updating account:", invoiceAcct.id, invoiceAcct.number);
      await put(`/ledger/account/${invoiceAcct.id}`, { ...invoiceAcct, bankAccountNumber: "12345678903" });
      // Retry
      result = await post("/invoice?sendToCustomer=false", payload);
    }
  }

  if (!result.ok) throw new Error(`POST /invoice failed: ${result.status} ${JSON.stringify(result.body)}`);

  const inv = result.body.value;
  console.log("\nInvoice created:");
  console.log("  id:", inv.id);
  console.log("  invoiceNumber:", inv.invoiceNumber);
  console.log("  amountExcludingVatCurrency:", inv.amountExcludingVatCurrency);
  console.log("  amountCurrency:", inv.amountCurrency);
  console.log("  amountExcludingVat:", inv.amountExcludingVat);
  console.log("  amount:", inv.amount);
}

main().catch(e => { console.error(e); process.exit(1); });
