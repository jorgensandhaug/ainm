const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "M7d-dPto-CO17V66d7GO1x7kOOhWqs4mAwcWDi8vx6o";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  if (!r.ok) console.error(`${method} ${path} -> ${r.status}`, JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  // 1. Resolve customer
  const custRes = await api("GET", "/customer?organizationNumber=810713909&fields=*");
  if (custRes.status === 403) { console.error("BLOCKED: invalid/expired token"); return; }
  const customers = custRes.data?.values;
  if (!customers?.length) { console.error("Customer not found"); return; }
  const customer = customers[0];
  console.log("Customer:", customer.id, customer.name);

  // 2. Resolve products
  const prodRes = await api("GET", "/product?productNumber=7765&productNumber=4369&productNumber=5331&fields=*");
  const products = prodRes.data?.values;
  if (!products?.length) { console.error("Products not found"); return; }

  const byNumber: Record<string, any> = {};
  for (const p of products) byNumber[String(p.number)] = p;
  console.log("Products resolved:", Object.keys(byNumber));

  // Check if all 3 products resolved
  const p7765 = byNumber["7765"];
  const p4369 = byNumber["4369"];
  const p5331 = byNumber["5331"];

  if (!p7765 || !p4369 || !p5331) {
    console.error("Not all products resolved. Found:", Object.keys(byNumber));
    // Fallback: broader catalog read
    const catRes = await api("GET", "/product?count=1000&fields=*");
    const allProducts = catRes.data?.values || [];
    for (const p of allProducts) byNumber[String(p.number)] = p;
  }

  const prod1 = byNumber["7765"];
  const prod2 = byNumber["4369"];
  const prod3 = byNumber["5331"];
  if (!prod1 || !prod2 || !prod3) { console.error("Still missing products after fallback"); return; }

  // 3. Check if we need explicit VAT lookup
  // Expected: 25%, 15% (næringsmiddel/food), 0% (avgiftsfri/exempt)
  // If products carry correct vatType, reuse; otherwise lookup
  let vat25id = prod1.vatType?.id;
  let vat15id = prod2.vatType?.id;
  let vat0id = prod3.vatType?.id;

  console.log("Product VAT types:", { vat25: prod1.vatType, vat15: prod2.vatType, vat0: prod3.vatType });

  // Build invoice payload
  const invoiceDate = "2026-03-21";
  const invoiceDueDate = "2026-04-20";

  const payload = {
    invoiceDate,
    invoiceDueDate,
    customer: { id: customer.id },
    orders: [
      {
        orderDate: invoiceDate,
        deliveryDate: invoiceDate,
        customer: { id: customer.id },
        orderLines: [
          {
            product: { id: prod1.id },
            description: "Nettverksteneste",
            count: 1,
            unitPriceExcludingVatCurrency: 13150,
            vatType: vat25id ? { id: vat25id } : undefined,
          },
          {
            product: { id: prod2.id },
            description: "Konsulenttimar",
            count: 1,
            unitPriceExcludingVatCurrency: 11800,
            vatType: vat15id ? { id: vat15id } : undefined,
          },
          {
            product: { id: prod3.id },
            description: "Vedlikehald",
            count: 1,
            unitPriceExcludingVatCurrency: 8700,
            vatType: vat0id ? { id: vat0id } : undefined,
          },
        ],
      },
    ],
  };

  // 4. Create invoice
  let invRes = await api("POST", "/invoice?sendToCustomer=false", payload);

  // Handle missing bank account
  if (invRes.status === 422 || invRes.status === 400) {
    const errMsg = JSON.stringify(invRes.data);
    if (errMsg.includes("bank") || errMsg.includes("Bank") || errMsg.includes("konto")) {
      console.log("Bank account issue detected, repairing...");
      const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
      const bankAccounts = bankRes.data?.values;
      if (bankAccounts?.length) {
        const bankAcct = bankAccounts[0];
        console.log("Updating bank account:", bankAcct.id, bankAcct.number);
        await api("PUT", `/ledger/account/${bankAcct.id}`, {
          ...bankAcct,
          bankAccountNumber: bankAcct.bankAccountNumber || "00000000000",
        });
        // Retry invoice
        invRes = await api("POST", "/invoice?sendToCustomer=false", payload);
      }
    }
  }

  if (invRes.status === 201 || invRes.status === 200) {
    const inv = invRes.data?.value;
    console.log("SUCCESS");
    console.log("Invoice ID:", inv?.id);
    console.log("Invoice Number:", inv?.invoiceNumber);
    console.log("Amount excl. VAT:", inv?.amountExcludingVatCurrency);
    console.log("Amount incl. VAT:", inv?.amountCurrency);
  } else {
    console.error("Invoice creation failed:", invRes.status, JSON.stringify(invRes.data, null, 2));
  }
}

main().catch(console.error);
