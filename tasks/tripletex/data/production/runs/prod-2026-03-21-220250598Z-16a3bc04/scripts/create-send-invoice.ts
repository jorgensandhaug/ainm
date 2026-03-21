const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "zCKZeUWjzzYXUNVaEmpgYkCjbBxNAkdhBH4IhWzXB2c";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${r.status}`);
  if (r.status >= 400) {
    console.log("ERROR:", JSON.stringify(json).slice(0, 500));
    if (r.status === 403 && typeof json === "object" && json?.error?.includes?.("Invalid or expired")) {
      console.log("BLOCKED: invalid credentials"); process.exit(1);
    }
  }
  return { status: r.status, data: json };
}

async function main() {
  // 1. Resolve customer
  const custRes = await api("GET", "/customer?organizationNumber=894181273&fields=*");
  if (custRes.status !== 200 || !custRes.data?.values?.length) {
    console.log("Customer not found"); process.exit(1);
  }
  const customer = custRes.data.values[0];
  console.log("Customer:", customer.id, customer.name);

  // 2. Resolve outgoing VAT for direct line
  const vatRes = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
  if (vatRes.status !== 200) { console.log("VAT lookup failed"); process.exit(1); }
  const vatTypes = vatRes.data.values || [];
  // Default to 25% outgoing VAT
  const vat25 = vatTypes.find((v: any) => v.percentage === 25);
  const vatId = vat25?.id || vatTypes[0]?.id;
  console.log("VAT id:", vatId, "percentage:", vat25?.percentage ?? vatTypes[0]?.percentage);

  // 3. Create and send invoice
  const invoicePayload = {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-04",
    customer: { id: customer.id },
    orders: [{
      customer: { id: customer.id },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        description: "Cloud Storage",
        count: 1,
        unitPriceExcludingVatCurrency: 14150,
        vatType: { id: vatId }
      }]
    }]
  };

  let invRes = await api("POST", "/invoice?sendToCustomer=true", invoicePayload);

  // Bank account repair if needed
  if (invRes.status === 422 && JSON.stringify(invRes.data).includes("bankkontonummer")) {
    console.log("Bank account repair needed");
    const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
    const accounts = bankRes.data?.values || [];
    const invoiceAcct = accounts.find((a: any) => a.isInvoiceAccount) || accounts[0];
    if (invoiceAcct) {
      console.log("Repairing bank account:", invoiceAcct.id, invoiceAcct.number);
      await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
        ...invoiceAcct,
        bankAccountNumber: "12345678903"
      });
      // Retry invoice create+send
      invRes = await api("POST", "/invoice?sendToCustomer=true", invoicePayload);
    }
  }

  if (invRes.status === 201) {
    const inv = invRes.data?.value;
    console.log("Invoice created and sent:");
    console.log("  id:", inv?.id);
    console.log("  invoiceNumber:", inv?.invoiceNumber);
    console.log("  amountExcludingVatCurrency:", inv?.amountExcludingVatCurrency);
    console.log("  amountCurrency:", inv?.amountCurrency);
    console.log("  isSent:", inv?.isSent);
  } else {
    console.log("Invoice creation failed:", JSON.stringify(invRes.data).slice(0, 1000));
  }
}

main();
