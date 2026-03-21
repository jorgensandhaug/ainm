const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "uHyhDB1imxgOZQLU1GjlV2Oq3EBK_C-_WFYbx_-Fb8A";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Authorization": AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers: H });
  const body = await r.text();
  console.log(`  -> ${r.status}`);
  if (!r.ok) { console.log(body); throw new Error(`GET ${path} failed: ${r.status}`); }
  return JSON.parse(body);
}

async function post(path: string, data: any) {
  const url = `${BASE}/${path}`;
  console.log(`POST ${url}`);
  const r = await fetch(url, { method: "POST", headers: H, body: JSON.stringify(data) });
  const body = await r.text();
  console.log(`  -> ${r.status}`);
  if (!r.ok) { console.log(body); }
  return { status: r.status, data: r.ok ? JSON.parse(body) : JSON.parse(body) };
}

async function put(path: string, data: any) {
  const url = `${BASE}/${path}`;
  console.log(`PUT ${url}`);
  const r = await fetch(url, { method: "PUT", headers: H, body: JSON.stringify(data) });
  const body = await r.text();
  console.log(`  -> ${r.status}`);
  if (!r.ok) { console.log(body); }
  return { status: r.status, data: r.ok ? JSON.parse(body) : JSON.parse(body) };
}

async function main() {
  // 1. Resolve customer
  const custRes = await get("customer?organizationNumber=970844708&fields=*");
  const customers = custRes.values;
  if (!customers || customers.length === 0) throw new Error("Customer not found");
  const customer = customers[0];
  console.log(`Customer: id=${customer.id}, name=${customer.name}`);

  // 2. Resolve products with comma-separated number query (OR semantics)
  const prodRes = await get("product?number=3957,8149,8092&fields=*");
  const products = prodRes.values;
  if (!products || products.length < 3) {
    console.log(`Only got ${products?.length} products, falling back to catalog read`);
    const catalogRes = await get("product?count=1000&fields=*");
    const catalog = catalogRes.values;
    const byNumber: Record<string, any> = {};
    for (const p of catalog) byNumber[String(p.number)] = p;
    const p3957 = byNumber["3957"];
    const p8149 = byNumber["8149"];
    const p8092 = byNumber["8092"];
    if (!p3957 || !p8149 || !p8092) throw new Error("Products not found in catalog");
    return await createInvoice(customer, p3957, p8149, p8092);
  }

  // Map by number
  const byNum: Record<string, any> = {};
  for (const p of products) byNum[String(p.number)] = p;
  const p3957 = byNum["3957"];
  const p8149 = byNum["8149"];
  const p8092 = byNum["8092"];
  if (!p3957 || !p8149 || !p8092) throw new Error("Product mapping failed");

  return await createInvoice(customer, p3957, p8149, p8092);
}

async function createInvoice(customer: any, pSoftware: any, pMaintenance: any, pWebDesign: any) {
  console.log(`Products: Software=${pSoftware.id} (vatType.id=${pSoftware.vatType?.id}), Maintenance=${pMaintenance.id} (vatType.id=${pMaintenance.vatType?.id}), WebDesign=${pWebDesign.id} (vatType.id=${pWebDesign.vatType?.id})`);

  const today = "2026-03-21";

  const invoice = {
    invoiceDate: today,
    invoiceDueDate: today,
    customer: { id: customer.id },
    orders: [
      {
        orderDate: today,
        deliveryDate: today,
        customer: { id: customer.id },
        orderLines: [
          {
            product: { id: pSoftware.id },
            description: pSoftware.name || "Software License",
            count: 1,
            unitPriceExcludingVatCurrency: 3650,
            vatType: { id: pSoftware.vatType?.id },
          },
          {
            product: { id: pMaintenance.id },
            description: pMaintenance.name || "Maintenance",
            count: 1,
            unitPriceExcludingVatCurrency: 11000,
            vatType: { id: pMaintenance.vatType?.id },
          },
          {
            product: { id: pWebDesign.id },
            description: pWebDesign.name || "Web Design",
            count: 1,
            unitPriceExcludingVatCurrency: 17700,
            vatType: { id: pWebDesign.vatType?.id },
          },
        ],
      },
    ],
  };

  let result = await post("invoice?sendToCustomer=false", invoice);

  // Bank account repair if needed
  if (result.status === 400 || result.status === 422) {
    const errMsg = JSON.stringify(result.data);
    if (errMsg.includes("bankkontonummer") || errMsg.includes("bank account")) {
      console.log("Bank account missing, repairing...");
      const acctRes = await get("ledger/account?isBankAccount=true&fields=*");
      const bankAcct = acctRes.values?.[0];
      if (!bankAcct) throw new Error("No bank account found");
      console.log(`Bank account: id=${bankAcct.id}, number=${bankAcct.number}`);
      await put(`ledger/account/${bankAcct.id}`, { ...bankAcct, bankAccountNumber: "12345678903" });
      result = await post("invoice?sendToCustomer=false", invoice);
    }
  }

  if (result.status >= 300) throw new Error(`Invoice creation failed: ${result.status}`);

  const inv = result.data.value;
  console.log(`Invoice created: id=${inv.id}, number=${inv.invoiceNumber}`);
  console.log(`amountExcludingVatCurrency=${inv.amountExcludingVatCurrency}`);
  console.log(`amountCurrency=${inv.amountCurrency}`);
}

main().catch(e => { console.error(e); process.exit(1); });
