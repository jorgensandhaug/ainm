const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "wwX7RUetOBREtuDpqbX2C2I4RpghqT3763lBu-s14To";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = new Date().toISOString().slice(0, 10);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.log("ERROR:", JSON.stringify(json, null, 2));
  }
  return { status: res.status, data: json };
}

async function main() {
  // Step 1+2 in parallel: resolve existing customer + proactive bank check (both GETs are free)
  const [custRes, bankRes] = await Promise.all([
    api("GET", `/customer?organizationNumber=890733751&fields=*`),
    api("GET", `/ledger/account?isBankAccount=true&fields=*`),
  ]);

  const customer = custRes.data?.values?.[0];
  if (!customer) {
    console.log("BLOCKED: customer not found");
    return;
  }
  const customerId = customer.id;
  console.log(`Customer: id=${customerId} name=${customer.name}`);

  // Step 3b: check bank account, repair if needed
  const accounts = bankRes.data?.values || [];
  const invoiceAcct = accounts.find((a: any) => a.isInvoiceAccount) || accounts.find((a: any) => a.number === 1920) || accounts[0];
  if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
    console.log(`Bank account ${invoiceAcct.number} missing bankAccountNumber, repairing...`);
    await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
      ...invoiceAcct,
      bankAccountNumber: "12345678903",
    });
  }

  // Step 4: POST /invoice with sendToCustomer=true (default)
  const invoicePayload = {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [
          {
            description: "Systemutvikling",
            count: 1,
            unitPriceExcludingVatCurrency: 28900,
            vatType: { id: 3 },
          },
        ],
      },
    ],
  };

  const invRes = await api("POST", "/invoice", invoicePayload);

  if (invRes.status === 201) {
    const inv = invRes.data?.value;
    console.log(`Invoice created: id=${inv?.id} invoiceNumber=${inv?.invoiceNumber}`);
    console.log(`amountExcludingVatCurrency=${inv?.amountExcludingVatCurrency} amountCurrency=${inv?.amountCurrency}`);

    // Verification GET (free)
    const verify = await api("GET", `/invoice/${inv.id}?fields=*,customer(id,name,organizationNumber),orderLines(*),orders(*,orderLines(*))`);
    const v = verify.data?.value;
    console.log("\n=== VERIFICATION ===");
    console.log(`invoiceNumber: ${v?.invoiceNumber}`);
    console.log(`customer: ${v?.customer?.name} (${v?.customer?.organizationNumber})`);
    console.log(`amountExcludingVatCurrency: ${v?.amountExcludingVatCurrency}`);
    console.log(`amountCurrency: ${v?.amountCurrency}`);
    console.log(`isSent: ${v?.isSent}`);
    const orders = v?.orders || [];
    for (const o of orders) {
      for (const ol of o.orderLines || []) {
        console.log(`  line: "${ol.description}" count=${ol.count} unitPrice=${ol.unitPriceExcludingVatCurrency} vatType=${ol.vatType?.id}/${ol.vatType?.percentage}%`);
      }
    }
  } else if (invRes.status === 422 && JSON.stringify(invRes.data).includes("bankkonto")) {
    // Fallback bank repair if proactive check missed it
    console.log("Bank account issue on invoice create, attempting repair...");
    if (invoiceAcct) {
      await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
        ...invoiceAcct,
        bankAccountNumber: "12345678903",
      });
      const retryRes = await api("POST", "/invoice", invoicePayload);
      const inv = retryRes.data?.value;
      if (retryRes.status === 201) {
        console.log(`Invoice created on retry: id=${inv?.id} invoiceNumber=${inv?.invoiceNumber}`);
        const verify = await api("GET", `/invoice/${inv.id}?fields=*,customer(id,name,organizationNumber),orderLines(*),orders(*,orderLines(*))`);
        const v = verify.data?.value;
        console.log("\n=== VERIFICATION ===");
        console.log(`invoiceNumber: ${v?.invoiceNumber}`);
        console.log(`amountExcludingVatCurrency: ${v?.amountExcludingVatCurrency}`);
        console.log(`amountCurrency: ${v?.amountCurrency}`);
        console.log(`isSent: ${v?.isSent}`);
      }
    }
  }
}

main().catch(console.error);
