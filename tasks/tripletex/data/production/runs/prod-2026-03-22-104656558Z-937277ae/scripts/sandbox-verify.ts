// Sandbox verification: confirm the proactive bank-account check path
// and verify that the 6-call path (3 core + 2 bank repair + 1 verify) is optimal
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers: H });
  const j = await r.json();
  console.log(`  ${r.status}`, JSON.stringify(j, null, 2).substring(0, 500));
  if (!r.ok) throw new Error(`GET ${path} failed: ${r.status}`);
  return j;
}

async function post(path: string, body: any) {
  const url = `${BASE}${path}`;
  console.log(`POST ${url}`);
  const r = await fetch(url, { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  console.log(`  ${r.status}`, JSON.stringify(j, null, 2).substring(0, 500));
  return { status: r.status, data: j };
}

async function put(path: string, body: any) {
  const url = `${BASE}${path}`;
  console.log(`PUT ${url}`);
  const r = await fetch(url, { method: "PUT", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  console.log(`  ${r.status}`, JSON.stringify(j, null, 2).substring(0, 500));
  return { status: r.status, data: j };
}

async function main() {
  // Step 1: Find a customer in sandbox
  const custRes = await get("/customer?count=1&fields=*");
  const customer = custRes.values[0];
  if (!customer) throw new Error("No customer in sandbox");
  console.log(`\nCustomer: id=${customer.id}, name=${customer.name}`);

  // Step 2: Find products in sandbox
  const prodRes = await get("/product?count=10&fields=*");
  const products = prodRes.values;
  console.log(`\nProducts found: ${products.length}`);
  for (const p of products) {
    console.log(`  Product ${p.number}: id=${p.id}, name=${p.name}, vatType.id=${p.vatType?.id}`);
  }
  if (products.length < 3) throw new Error("Need at least 3 products");

  const p1 = products[0];
  const p2 = products[1];
  const p3 = products[2];

  // Step 3: Proactive bank-account check
  const bankRes = await get("/ledger/account?isBankAccount=true&fields=*");
  const invoiceAcct = bankRes.values.find((a: any) => a.number === 1920 || a.isInvoiceAccount);
  console.log(`\nInvoice account: id=${invoiceAcct?.id}, number=${invoiceAcct?.number}, bankAccountNumber=${invoiceAcct?.bankAccountNumber}`);

  if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
    console.log("Bank account needs repair — fixing...");
    await put(`/ledger/account/${invoiceAcct.id}`, { ...invoiceAcct, bankAccountNumber: "12345678903" });
  } else {
    console.log("Bank account already has bankAccountNumber — no repair needed");
  }

  // Step 4: Create invoice
  const today = "2026-03-22";
  const invoicePayload = {
    invoiceDate: today,
    invoiceDueDate: today,
    customer: { id: customer.id },
    orders: [{
      orderDate: today,
      deliveryDate: today,
      customer: { id: customer.id },
      orderLines: [
        { product: { id: p1.id }, description: p1.name, count: 1, unitPriceExcludingVatCurrency: 24650, vatType: { id: p1.vatType.id } },
        { product: { id: p2.id }, description: p2.name, count: 1, unitPriceExcludingVatCurrency: 3350, vatType: { id: p2.vatType.id } },
        { product: { id: p3.id }, description: p3.name, count: 1, unitPriceExcludingVatCurrency: 13350, vatType: { id: p3.vatType.id } },
      ],
    }],
  };

  const invRes = await post("/invoice?sendToCustomer=false", invoicePayload);
  if (invRes.status === 201) {
    console.log(`\nInvoice created: id=${invRes.data.value.id}`);
    console.log(`  amountExcludingVatCurrency=${invRes.data.value.amountExcludingVatCurrency}`);
    console.log(`  amountCurrency=${invRes.data.value.amountCurrency}`);
  } else {
    console.log("\nInvoice creation FAILED");
  }

  // Step 5: Verify
  if (invRes.status === 201) {
    const invId = invRes.data.value.id;
    await get(`/invoice/${invId}?fields=*,orders(*,orderLines(*,product(*),vatType(*)))`);
  }

  console.log("\nSANDBOX VERIFICATION DONE");
}

main().catch((e) => { console.error(e); process.exit(1); });
