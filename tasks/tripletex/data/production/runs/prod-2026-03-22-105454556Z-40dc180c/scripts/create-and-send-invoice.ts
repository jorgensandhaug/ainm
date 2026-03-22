const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "6Cj0ZXQaObDxhgV-CXGG66em08Y5MiSmKp3USr2J_wc";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log("  ERROR:", JSON.stringify(data)); }
  return { status: r.status, data };
}

async function main() {
  // Step 1 (parallel): POST /customer + GET /ledger/account?isBankAccount=true
  const [custRes, bankRes] = await Promise.all([
    api("POST", "/customer", {
      name: "Solmar SL",
      organizationNumber: "893298169",
      invoiceSendMethod: "MANUAL",
    }),
    api("GET", "/ledger/account?isBankAccount=true&fields=*"),
  ]);

  if (custRes.status !== 201) {
    console.log("Customer create failed, aborting");
    return;
  }
  const customerId = custRes.data.value.id;
  console.log("Customer ID:", customerId);

  // Step 2: Check bank account, fix if needed
  const accounts = bankRes.data.values || [];
  const invoiceAcct = accounts.find((a: any) => a.isInvoiceAccount || a.number === 1920);
  if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
    console.log("Bank account missing on account", invoiceAcct.id, "- fixing");
    await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
      ...invoiceAcct,
      bankAccountNumber: "12345678903",
    });
  }

  // Step 3: POST /invoice with sendToCustomer=true (default)
  const today = "2026-03-22";
  const due = "2026-04-05";

  const invoiceRes = await api("POST", "/invoice", {
    invoiceDate: today,
    invoiceDueDate: due,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: today,
        deliveryDate: today,
        orderLines: [
          {
            description: "Mantenimiento",
            count: 1,
            unitPriceExcludingVatCurrency: 19500,
            vatType: { id: 6 },
          },
        ],
      },
    ],
  });

  if (invoiceRes.status === 201) {
    const inv = invoiceRes.data.value;
    console.log("Invoice created:", inv.id);
    console.log("  amountExcludingVatCurrency:", inv.amountExcludingVatCurrency);
    console.log("  amountCurrency:", inv.amountCurrency);
  } else {
    console.log("Invoice create failed");
  }
}

main();
