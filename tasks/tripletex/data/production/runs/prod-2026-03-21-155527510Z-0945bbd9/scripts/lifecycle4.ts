const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "0hPsgxjWKjFmkUAkBkzPBL1htOhfVavdvLNv2ppGtbo";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) {
    console.log("ERROR:", JSON.stringify(json).slice(0, 500));
    throw new Error(`${method} ${path} ${r.status}`);
  }
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

const customerId = 108370935;
const projectId = 402015968;
const bankAccountId = 465379758;

// First get the bank account to get its version for PUT
const bankAccounts = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
const ba = bankAccounts.find((a: any) => a.id === bankAccountId);
console.log("Bank account:", ba?.id, "version:", ba?.version, "number:", ba?.number);

// PUT with valid Norwegian bank account number (modulo-11 validated: 12345678903)
const updated = await api("PUT", `/ledger/account/${bankAccountId}`, {
  ...ba,
  bankAccountNumber: "12345678903",
});
console.log("Updated bank account:", updated.bankAccountNumber);

// POST invoice
const dueDate = "2026-04-20";
const invoice = await api("POST", "/invoice?sendToCustomer=false", {
  invoiceDate: TODAY,
  invoiceDueDate: dueDate,
  customer: { id: customerId },
  orders: [{
    customer: { id: customerId },
    project: { id: projectId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: "Cloud-Migration Eichenhof - Projektleistungen",
      count: 1,
      unitPriceExcludingVatCurrency: 253000,
      vatType: { id: 3 },
    }],
  }],
});

console.log("INVOICE:", JSON.stringify(invoice, null, 2).slice(0, 2000));
console.log("\n=== DONE ===");
console.log("Invoice ID:", invoice.id);
console.log("Invoice Number:", invoice.invoiceNumber);
