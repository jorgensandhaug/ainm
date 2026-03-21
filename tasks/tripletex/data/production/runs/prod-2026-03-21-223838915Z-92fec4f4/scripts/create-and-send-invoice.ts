const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "go-KibXDtbre5ORgK0Cw6yM351AC7788htxH5f63v8A";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

// Step 1: Parallel customer lookup + VAT type lookup
const [custRes, vatRes] = await Promise.all([
  api("GET", "/customer?organizationNumber=847830840&fields=*"),
  api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*"),
]);

const customerId = custRes.data.values?.[0]?.id;
if (!customerId) { console.error("Customer not found"); process.exit(1); }
console.log("customerId:", customerId);

// Find 25% VAT type
const vatTypes = vatRes.data.values || [];
const vat25 = vatTypes.find((v: any) => v.percentage === 25);
if (!vat25) { console.error("No 25% VAT type found — blocked"); process.exit(1); }
console.log("vatType.id:", vat25.id, "percentage:", vat25.percentage);

// Step 2: POST /invoice with sendToCustomer=true
const invoicePayload = {
  invoiceDate: "2026-03-21",
  invoiceDueDate: "2026-04-20",
  customer: { id: customerId },
  orders: [{
    customer: { id: customerId },
    orderDate: "2026-03-21",
    deliveryDate: "2026-03-21",
    orderLines: [{
      description: "Nettverksteneste",
      count: 1,
      unitPriceExcludingVatCurrency: 7350,
      vatType: { id: vat25.id },
    }],
  }],
};

let invRes = await api("POST", "/invoice?sendToCustomer=true", invoicePayload);

// Step 3: Bank-account repair branch if needed
if (invRes.status === 422 && JSON.stringify(invRes.data).includes("bank")) {
  console.log("Bank account repair needed...");
  const acctRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  const accounts = acctRes.data.values || [];
  const acct1920 = accounts.find((a: any) => a.number === 1920);
  const targetAcct = acct1920 || accounts[0];
  if (!targetAcct) { console.error("No bank account found"); process.exit(1); }
  console.log("Repairing account:", targetAcct.id, "number:", targetAcct.number);

  await api("PUT", `/ledger/account/${targetAcct.id}`, {
    id: targetAcct.id,
    number: targetAcct.number,
    name: targetAcct.name,
    bankAccountNumber: "12345678903",
  });

  // Retry invoice with same payload, retaining customerId and vatType.id
  invRes = await api("POST", "/invoice?sendToCustomer=true", invoicePayload);
}

if (invRes.status === 201) {
  const inv = invRes.data?.value;
  console.log("Invoice created successfully!");
  console.log("invoiceId:", inv?.id);
  console.log("invoiceNumber:", inv?.invoiceNumber);
  console.log("amountExcludingVatCurrency:", inv?.amountExcludingVatCurrency);
  console.log("amountCurrency:", inv?.amountCurrency);
} else {
  console.error("Invoice creation failed with status:", invRes.status);
}
