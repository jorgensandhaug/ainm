const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "hNJEgMjOlJZbzaBZZwrXCg2iXWWYJafeLhL9dmPiVpc";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`${r.status} non-JSON: ${text.slice(0, 200)}`); }
  if (!r.ok) throw Object.assign(new Error(`${r.status} ${JSON.stringify(json)}`), { status: r.status, json });
  return json;
}

// Step 1+2 parallel: create customer + resolve 0% VAT
const [custRes, vatRes] = await Promise.all([
  api("POST", "/customer", {
    name: "Río Verde SL",
    organizationNumber: "894012358",
    invoiceSendMethod: "MANUAL",
  }),
  api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*"),
]);

const customerId = custRes.value.id;
console.log("Customer ID:", customerId);

const zeroVat = vatRes.values.find((v: any) => v.percentage === 0);
if (!zeroVat) throw new Error("No 0% VAT type found");
console.log("VAT type:", zeroVat.id, `code=${zeroVat.number}`, `${zeroVat.percentage}%`);

// Invoice payload
const invoicePayload = {
  invoiceDate: "2026-03-21",
  invoiceDueDate: "2026-04-20",
  customer: { id: customerId },
  orders: [{
    customer: { id: customerId },
    orderDate: "2026-03-21",
    deliveryDate: "2026-03-21",
    orderLines: [{
      description: "Sesión de formación",
      count: 1,
      unitPriceExcludingVatCurrency: 29100,
      vatType: { id: zeroVat.id },
    }],
  }],
};

// Step 3: create + send invoice
try {
  const invRes = await api("POST", "/invoice?sendToCustomer=true", invoicePayload);
  console.log("Invoice #" + invRes.value.invoiceNumber, "id=" + invRes.value.id);
  console.log("amountExcludingVat:", invRes.value.amountExcludingVatCurrency, "amount:", invRes.value.amountCurrency);
} catch (e: any) {
  if (!e.message.toLowerCase().includes("bank")) throw e;
  console.log("Bank account repair...");

  // Repair branch: GET bank accounts, PUT 1920, retry invoice
  const acctRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  const acct = acctRes.values.find((a: any) => a.number === 1920);
  if (!acct) throw new Error("No 1920 account found");

  await api("PUT", `/ledger/account/${acct.id}`, { ...acct, bankAccountNumber: "12345678903" });
  console.log("Bank account repaired on account", acct.id);

  const invRes = await api("POST", "/invoice?sendToCustomer=true", invoicePayload);
  console.log("Invoice #" + invRes.value.invoiceNumber, "id=" + invRes.value.id);
  console.log("amountExcludingVat:", invRes.value.amountExcludingVatCurrency, "amount:", invRes.value.amountCurrency);
}
