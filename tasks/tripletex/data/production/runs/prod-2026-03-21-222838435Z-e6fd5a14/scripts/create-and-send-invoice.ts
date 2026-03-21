const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "eQifbAff-c-D45cXrD3bfrM-JZlAJNSH9VWQ9djm-yA";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: HEADERS };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);

  // Step 1: Parallel — resolve existing customer + get outgoing VAT types
  const [custRes, vatRes] = await Promise.all([
    api("GET", `/customer?organizationNumber=847830840&fields=*`),
    api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${today}&fields=*`),
  ]);

  if (custRes.status !== 200 || !custRes.data.values?.length) {
    console.error("Customer not found", custRes.data);
    return;
  }
  const customerId = custRes.data.values[0].id;
  console.log("Customer ID:", customerId);

  // Find 25% VAT type
  const vatTypes = vatRes.data.values || [];
  const vat25 = vatTypes.find((v: any) => v.percentage === 25);
  if (!vat25) {
    console.error("No 25% outgoing VAT type found. Available:", vatTypes.map((v: any) => `${v.number}(${v.percentage}%)`));
    return;
  }
  const vatTypeId = vat25.id;
  console.log("VAT type ID:", vatTypeId, "at", vat25.percentage + "%");

  // Step 2: Create and send invoice
  const invoicePayload = {
    invoiceDate: today,
    invoiceDueDate: today,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: today,
        deliveryDate: today,
        orderLines: [
          {
            description: "Nettverksteneste",
            count: 1,
            unitPriceExcludingVatCurrency: 7350,
            vatType: { id: vatTypeId },
          },
        ],
      },
    ],
  };

  let invRes = await api("POST", "/invoice?sendToCustomer=true", invoicePayload);

  // Bank account repair branch
  if (invRes.status === 422 && JSON.stringify(invRes.data).includes("bank")) {
    console.log("Bank account repair needed...");
    const acctRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
    const accounts = acctRes.data.values || [];
    const acct1920 = accounts.find((a: any) => a.number === 1920);
    const targetAcct = acct1920 || accounts[0];
    if (!targetAcct) {
      console.error("No bank account found");
      return;
    }
    console.log("Repairing account:", targetAcct.id, "number:", targetAcct.number);

    await api("PUT", `/ledger/account/${targetAcct.id}`, {
      id: targetAcct.id,
      number: targetAcct.number,
      name: targetAcct.name,
      bankAccountNumber: "12345678903",
    });

    // Retry invoice with same payload, reusing customerId and vatTypeId
    invRes = await api("POST", "/invoice?sendToCustomer=true", invoicePayload);
  }

  if (invRes.status === 201) {
    const inv = invRes.data.value;
    console.log("Invoice created successfully!");
    console.log("Invoice ID:", inv.id);
    console.log("Invoice number:", inv.invoiceNumber);
    console.log("Amount ex VAT:", inv.amountExcludingVatCurrency);
    console.log("Amount incl VAT:", inv.amountCurrency);
  } else {
    console.error("Invoice creation failed:", JSON.stringify(invRes.data, null, 2));
  }
}

main();
