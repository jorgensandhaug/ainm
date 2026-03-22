const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "tpwC309ezdtMzlyt7EHQR0wJgYBGGqOk-O7yMeNFzNs";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`  -> ${res.status}`, JSON.stringify(json).slice(0, 1500));
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  // 1. Resolve customer
  const custRes = await api("GET", "/customer?organizationNumber=942447647&fields=*");
  const customer = custRes.values?.[0];
  if (!customer) throw new Error("Customer not found");
  console.log(`Customer: id=${customer.id}, name=${customer.name}`);

  // 2. Resolve products (comma-separated OR semantics)
  const prodRes = await api("GET", "/product?number=1340,9754,7005&fields=*");
  const products = prodRes.values || [];
  console.log(`Products found: ${products.length}`);
  if (products.length < 3) {
    // Fallback: broad catalog read
    console.log("Falling back to broad catalog read...");
    const allRes = await api("GET", "/product?count=1000&fields=*");
    const all = allRes.values || [];
    const needed = [1340, 9754, 7005];
    for (const n of needed) {
      if (!products.find((p: any) => p.number === n)) {
        const found = all.find((p: any) => p.number === n);
        if (found) products.push(found);
      }
    }
    if (products.length < 3) throw new Error(`Only found ${products.length}/3 products`);
  }

  const byNumber: Record<number, any> = {};
  for (const p of products) byNumber[p.number] = p;

  const p1340 = byNumber[1340]; // Service réseau, 25%
  const p9754 = byNumber[9754]; // Stockage cloud, 15%
  const p7005 = byNumber[7005]; // Session de formation, 0%

  console.log(`Product 1340: id=${p1340.id}, vatType.id=${p1340.vatType?.id}`);
  console.log(`Product 9754: id=${p9754.id}, vatType.id=${p9754.vatType?.id}`);
  console.log(`Product 7005: id=${p7005.id}, vatType.id=${p7005.vatType?.id}`);

  const today = "2026-03-22";
  const due = "2026-04-21";

  const invoicePayload = {
    invoiceDate: today,
    invoiceDueDate: due,
    customer: { id: customer.id },
    orders: [
      {
        orderDate: today,
        deliveryDate: today,
        customer: { id: customer.id },
        orderLines: [
          {
            product: { id: p1340.id },
            description: p1340.name,
            count: 1,
            unitPriceExcludingVatCurrency: 10500,
            vatType: { id: p1340.vatType?.id },
          },
          {
            product: { id: p9754.id },
            description: p9754.name,
            count: 1,
            unitPriceExcludingVatCurrency: 11000,
            vatType: { id: p9754.vatType?.id },
          },
          {
            product: { id: p7005.id },
            description: p7005.name,
            count: 1,
            unitPriceExcludingVatCurrency: 5850,
            vatType: { id: p7005.vatType?.id },
          },
        ],
      },
    ],
  };

  // 3. Create invoice
  let invoice: any;
  try {
    const invRes = await api("POST", "/invoice?sendToCustomer=false", invoicePayload);
    invoice = invRes.value;
  } catch (e: any) {
    // Bank account repair if needed
    if (e.message.includes("bankkontonummer") || e.message.includes("bank account")) {
      console.log("Bank account missing — repairing...");
      const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
      const bankAcct = bankRes.values?.[0];
      if (!bankAcct) throw new Error("No bank account found");
      await api("PUT", `/ledger/account/${bankAcct.id}`, {
        ...bankAcct,
        bankAccountNumber: "12345678903",
      });
      const retryRes = await api("POST", "/invoice?sendToCustomer=false", invoicePayload);
      invoice = retryRes.value;
    } else {
      throw e;
    }
  }

  console.log(`\nInvoice created: id=${invoice.id}, invoiceNumber=${invoice.invoiceNumber}`);
  console.log(`amountExcludingVatCurrency=${invoice.amountExcludingVatCurrency}`);
  console.log(`amountCurrency=${invoice.amountCurrency}`);
  // Expected: excl = 10500 + 11000 + 5850 = 27350
  // Expected: incl = 10500*1.25 + 11000*1.15 + 5850*1.0 = 13125 + 12650 + 5850 = 31625
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
