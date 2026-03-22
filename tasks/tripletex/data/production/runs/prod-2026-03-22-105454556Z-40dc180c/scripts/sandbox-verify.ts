const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
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
  if (!r.ok) console.log("  ERROR:", JSON.stringify(data).slice(0, 500));
  return { status: r.status, data };
}

async function main() {
  const rnd = Math.floor(Math.random() * 100000);
  const custName = `Solmar Reflection ${rnd} SL`;
  const orgNum = `999${String(rnd).padStart(6, "0")}`;

  console.log("=== Sandbox: verify hardcoded vatType.id=6 + proactive bank check ===");
  console.log(`Customer: ${custName}, org: ${orgNum}`);

  // Parallel: POST /customer + GET /ledger/account
  const [custRes, bankRes] = await Promise.all([
    api("POST", "/customer", {
      name: custName,
      organizationNumber: orgNum,
      invoiceSendMethod: "MANUAL",
    }),
    api("GET", "/ledger/account?isBankAccount=true&fields=*"),
  ]);

  if (custRes.status !== 201) {
    console.log("Customer create failed");
    return;
  }
  const customerId = custRes.data.value.id;
  console.log("Customer ID:", customerId);

  // Check bank account
  const accounts = bankRes.data.values || [];
  const invoiceAcct = accounts.find((a: any) => a.isInvoiceAccount || a.number === 1920);
  console.log("Invoice account:", invoiceAcct ? `id=${invoiceAcct.id}, bankAccountNumber=${invoiceAcct.bankAccountNumber}` : "NOT FOUND");

  if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
    console.log("Fixing bank account...");
    await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
      ...invoiceAcct,
      bankAccountNumber: "12345678903",
    });
  }

  // POST /invoice with hardcoded vatType.id=6
  const today = "2026-03-22";
  const invoiceRes = await api("POST", "/invoice", {
    invoiceDate: today,
    invoiceDueDate: "2026-04-05",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      orderDate: today,
      deliveryDate: today,
      orderLines: [{
        description: "Mantenimiento",
        count: 1,
        unitPriceExcludingVatCurrency: 19500,
        vatType: { id: 6 },
      }],
    }],
  });

  if (invoiceRes.status === 201) {
    const inv = invoiceRes.data.value;
    console.log("\n=== INVOICE CREATED ===");
    console.log("  id:", inv.id);
    console.log("  amountExcludingVatCurrency:", inv.amountExcludingVatCurrency);
    console.log("  amountCurrency:", inv.amountCurrency);

    // Verification GET (free)
    const verifyRes = await api("GET", `/invoice/${inv.id}?fields=*,customer(id,name,organizationNumber),orderLines(*,vatType(*)),orders(*,orderLines(*,vatType(*)))`);
    if (verifyRes.status === 200) {
      const v = verifyRes.data.value;
      console.log("\n=== VERIFICATION ===");
      console.log("  invoiceNumber:", v.invoiceNumber);
      console.log("  customer:", v.customer?.name, v.customer?.organizationNumber);
      console.log("  amountExcludingVatCurrency:", v.amountExcludingVatCurrency);
      console.log("  amountCurrency:", v.amountCurrency);
      console.log("  isSent:", v.isSent);
      const lines = v.invoiceLines || v.orderLines || [];
      for (const l of lines) {
        console.log("  line:", l.description, "count:", l.count, "price:", l.unitPriceExcludingVatCurrency, "vatType:", l.vatType?.id, "percentage:", l.vatType?.percentage);
      }
    }
  } else {
    console.log("Invoice create FAILED");
  }

  // Also test: can we do 3 calls (skip bank check) when bank is already set?
  console.log("\n=== Test 2: 3-call path (bank already set) ===");
  const rnd2 = Math.floor(Math.random() * 100000);
  const custName2 = `Solmar2 Reflection ${rnd2} SL`;
  const orgNum2 = `999${String(rnd2).padStart(6, "0")}`;

  const cust2Res = await api("POST", "/customer", {
    name: custName2,
    organizationNumber: orgNum2,
    invoiceSendMethod: "MANUAL",
  });
  if (cust2Res.status === 201) {
    const cid2 = cust2Res.data.value.id;
    // Bank is already set from previous fix, so POST /invoice should succeed directly
    const inv2Res = await api("POST", "/invoice", {
      invoiceDate: today,
      invoiceDueDate: "2026-04-05",
      customer: { id: cid2 },
      orders: [{
        customer: { id: cid2 },
        orderDate: today,
        deliveryDate: today,
        orderLines: [{
          description: "Consultoría",
          count: 1,
          unitPriceExcludingVatCurrency: 10000,
          vatType: { id: 6 },
        }],
      }],
    });
    if (inv2Res.status === 201) {
      const inv2 = inv2Res.data.value;
      console.log("  Invoice created:", inv2.id);
      console.log("  amountExcludingVatCurrency:", inv2.amountExcludingVatCurrency);
      console.log("  amountCurrency:", inv2.amountCurrency);
      console.log("  => 2-call path works when bank already set!");
    }
  }
}

main();
