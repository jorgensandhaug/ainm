const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "bUDg4R7erqbAiOrp5JNP58IZaP6GnNyNi2ZoSMDIs9g";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

// Step 1: Parallel customer lookup + VAT lookup
const [custRes, vatRes] = await Promise.all([
  api("GET", `/customer?organizationNumber=892362416&fields=*`),
  api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
]);

if (custRes.status !== 200 || !custRes.data.values?.length) {
  console.error("Customer not found:", JSON.stringify(custRes.data));
  process.exit(1);
}
const customerId = custRes.data.values[0].id;
console.log("Customer ID:", customerId);

// Find 25% VAT
const vatTypes = vatRes.data.values || [];
const vat25 = vatTypes.find((v: any) => Number(v.percentage) === 25);
if (!vat25) {
  console.error("No 25% outgoing VAT found. Available:", vatTypes.map((v: any) => `${v.number}/${v.percentage}%`));
  process.exit(1);
}
console.log("VAT type ID:", vat25.id, "percentage:", vat25.percentage);

// Step 2: Create invoice with sendToCustomer=true
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
          description: "Vedlikehald",
          count: 1,
          unitPriceExcludingVatCurrency: 34150,
          vatType: { id: vat25.id },
        },
      ],
    },
  ],
};

let invRes = await api("POST", "/invoice?sendToCustomer=true", invoicePayload);

// Step 3: Bank-account repair branch if needed
if (invRes.status === 422 && JSON.stringify(invRes.data).includes("bank")) {
  console.log("Bank account repair needed...");
  const acctRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  const accounts = acctRes.data.values || [];
  const acct1920 = accounts.find((a: any) => Number(a.number) === 1920) || accounts[0];
  if (!acct1920) {
    console.error("No bank account found");
    process.exit(1);
  }
  console.log("Repairing account:", acct1920.id, "number:", acct1920.number);

  await api("PUT", `/ledger/account/${acct1920.id}`, {
    id: acct1920.id,
    number: acct1920.number,
    name: acct1920.name,
    bankAccountNumber: "12345678903",
  });

  // Retry invoice with same payload, reusing customerId and vatType.id
  invRes = await api("POST", "/invoice?sendToCustomer=true", invoicePayload);
}

if (invRes.status === 201) {
  const inv = invRes.data.value;
  console.log("Invoice created successfully!");
  console.log("Invoice ID:", inv.id);
  console.log("Invoice number:", inv.invoiceNumber);
  console.log("Amount excl VAT:", inv.amountExcludingVatCurrency);
  console.log("Amount incl VAT:", inv.amountCurrency);
} else {
  console.error("Invoice creation failed:", JSON.stringify(invRes.data));
}
