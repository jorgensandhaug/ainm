const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "a54eEKOb4py7hRtnRgSlXVdf7GeBr0J-AV3mc3Vspg4";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`${method} ${path} -> ${res.status}`, JSON.stringify(json, null, 2));
  } else {
    console.log(`${method} ${path} -> ${res.status}`);
  }
  return { status: res.status, json };
}

async function main() {
  // 1. Resolve customer
  const custRes = await api("GET", "/customer?organizationNumber=924693576&fields=*");
  if (custRes.status === 403) {
    console.error("Blocked: invalid/expired token");
    return;
  }
  const customers = custRes.json.values;
  if (!customers || customers.length === 0) {
    console.error("Customer not found");
    return;
  }
  const customerId = customers[0].id;
  console.log("Customer ID:", customerId);

  // 2. Resolve products by number (comma-separated OR semantics)
  const prodRes = await api("GET", "/product?number=3296,6620,8441&fields=*");
  const products = prodRes.json.values;
  if (!products || products.length < 3) {
    console.error("Expected 3 products, got", products?.length ?? 0);
    // Fallback to broad catalog read
    const catalogRes = await api("GET", "/product?count=1000&fields=*");
    const catalog = catalogRes.json.values || [];
    const byNumber: Record<string, any> = {};
    for (const p of catalog) {
      byNumber[String(p.number)] = p;
    }
    const p3296 = byNumber["3296"];
    const p6620 = byNumber["6620"];
    const p8441 = byNumber["8441"];
    if (!p3296 || !p6620 || !p8441) {
      console.error("Could not resolve all products from catalog");
      return;
    }
    return await createInvoice(customerId, p3296, p6620, p8441);
  }

  // Map products by number
  const byNumber: Record<string, any> = {};
  for (const p of products) {
    byNumber[String(p.number)] = p;
  }
  const p3296 = byNumber["3296"];
  const p6620 = byNumber["6620"];
  const p8441 = byNumber["8441"];
  if (!p3296 || !p6620 || !p8441) {
    console.error("Product number mismatch in results");
    return;
  }

  await createInvoice(customerId, p3296, p6620, p8441);
}

async function createInvoice(customerId: number, pOpplaering: any, pSkylagring: any, pAnalyserapport: any) {
  console.log("Products resolved:");
  console.log(`  Opplæring (3296): id=${pOpplaering.id}, vatType.id=${pOpplaering.vatType?.id}`);
  console.log(`  Skylagring (6620): id=${pSkylagring.id}, vatType.id=${pSkylagring.vatType?.id}`);
  console.log(`  Analyserapport (8441): id=${pAnalyserapport.id}, vatType.id=${pAnalyserapport.vatType?.id}`);

  const today = "2026-03-21";
  const dueDate = "2026-04-20";

  const payload = {
    invoiceDate: today,
    invoiceDueDate: dueDate,
    customer: { id: customerId },
    orders: [
      {
        orderDate: today,
        deliveryDate: today,
        customer: { id: customerId },
        orderLines: [
          {
            description: pOpplaering.name || "Opplæring",
            count: 1,
            unitPriceExcludingVatCurrency: 5400,
            vatType: { id: pOpplaering.vatType?.id },
            product: { id: pOpplaering.id },
          },
          {
            description: pSkylagring.name || "Skylagring",
            count: 1,
            unitPriceExcludingVatCurrency: 6850,
            vatType: { id: pSkylagring.vatType?.id },
            product: { id: pSkylagring.id },
          },
          {
            description: pAnalyserapport.name || "Analyserapport",
            count: 1,
            unitPriceExcludingVatCurrency: 13750,
            vatType: { id: pAnalyserapport.vatType?.id },
            product: { id: pAnalyserapport.id },
          },
        ],
      },
    ],
  };

  // 3. POST invoice
  let invRes = await api("POST", "/invoice?sendToCustomer=false", payload);

  // Handle bank-account validation error
  if (invRes.status === 422 || invRes.status === 400) {
    const errMsg = JSON.stringify(invRes.json);
    if (errMsg.includes("bankkontonummer") || errMsg.includes("bank account")) {
      console.log("Bank account repair needed...");
      const acctRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
      const accounts = acctRes.json.values;
      if (accounts && accounts.length > 0) {
        const acct = accounts[0];
        await api("PUT", `/ledger/account/${acct.id}`, {
          ...acct,
          bankAccountNumber: "12345678903",
        });
        // Retry invoice creation with same payload
        invRes = await api("POST", "/invoice?sendToCustomer=false", payload);
      }
    }
  }

  if (invRes.status === 201 || invRes.status === 200) {
    const inv = invRes.json.value;
    console.log("\nInvoice created successfully:");
    console.log(`  ID: ${inv.id}`);
    console.log(`  Invoice Number: ${inv.invoiceNumber}`);
    console.log(`  Amount excl VAT: ${inv.amountExcludingVatCurrency}`);
    console.log(`  Amount incl VAT: ${inv.amountCurrency}`);
  } else {
    console.error("Invoice creation failed");
  }
}

main();
