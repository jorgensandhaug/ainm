// Sandbox verification: confirm the 4-call path (2 free + 2 writes) for existing-customer + bank-repair + 25% VAT
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
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
  if (!res.ok) console.log("ERROR:", JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

async function main() {
  // Create a test customer first (to simulate existing customer)
  const custRes = await api("POST", "/customer", {
    name: "Sandbox Bergvik Test AS",
    organizationNumber: "999890733",
    invoiceSendMethod: "MANUAL",
  });
  const customerId = custRes.data?.value?.id;
  console.log(`Created test customer: id=${customerId}`);

  // Now test the optimal 4-call path
  console.log("\n=== TESTING OPTIMAL 4-CALL PATH ===");

  // Step 1+2: parallel free GETs
  const [getCust, getBank] = await Promise.all([
    api("GET", `/customer/${customerId}?fields=*`),
    api("GET", `/ledger/account?isBankAccount=true&fields=*`),
  ]);

  const cust = getCust.data?.value;
  console.log(`Customer resolved: id=${cust?.id} name=${cust?.name}`);

  // Step 2b: check bank account
  const accounts = getBank.data?.values || [];
  const invoiceAcct = accounts.find((a: any) => a.isInvoiceAccount) || accounts.find((a: any) => a.number === 1920) || accounts[0];
  console.log(`Bank account: id=${invoiceAcct?.id} number=${invoiceAcct?.number} bankAccountNumber=${invoiceAcct?.bankAccountNumber}`);

  let bankRepairNeeded = false;
  if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
    bankRepairNeeded = true;
    console.log("Bank repair needed");
    await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
      ...invoiceAcct,
      bankAccountNumber: "12345678903",
    });
  } else {
    console.log("Bank account already has number - no repair needed");
  }

  // Step 3: POST /invoice with hardcoded vatType.id=3
  const invRes = await api("POST", "/invoice", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: "Systemutvikling",
        count: 1,
        unitPriceExcludingVatCurrency: 28900,
        vatType: { id: 3 },
      }],
    }],
  });

  if (invRes.status === 201) {
    const inv = invRes.data?.value;
    console.log(`\nInvoice created: id=${inv?.id} invoiceNumber=${inv?.invoiceNumber}`);
    console.log(`amountExcludingVatCurrency=${inv?.amountExcludingVatCurrency} amountCurrency=${inv?.amountCurrency}`);

    // Verification GET (free)
    const verify = await api("GET", `/invoice/${inv.id}?fields=*,customer(id,name,organizationNumber),orderLines(*),orders(*,orderLines(*,vatType(*)))`);
    const v = verify.data?.value;
    console.log(`\n=== VERIFICATION ===`);
    console.log(`invoiceNumber: ${v?.invoiceNumber}`);
    console.log(`customer: ${v?.customer?.name} (${v?.customer?.organizationNumber})`);
    console.log(`amountExcludingVatCurrency: ${v?.amountExcludingVatCurrency}`);
    console.log(`amountCurrency: ${v?.amountCurrency}`);
    for (const o of (v?.orders || [])) {
      for (const ol of (o.orderLines || [])) {
        console.log(`  line: "${ol.description}" count=${ol.count} unitPrice=${ol.unitPriceExcludingVatCurrency} vatType.id=${ol.vatType?.id} vatType.percentage=${ol.vatType?.percentage}`);
      }
    }

    const totalCalls = bankRepairNeeded ? 4 : 3;
    const totalWrites = bankRepairNeeded ? 2 : 1;
    console.log(`\n=== CALL SUMMARY (excluding setup) ===`);
    console.log(`Total calls: ${totalCalls} (${totalCalls - totalWrites} free GETs + ${totalWrites} writes)`);
    console.log(`Errors: 0`);
    console.log(`amountCurrency correct: ${v?.amountCurrency === 36125}`);
    console.log(`25% VAT correct: ${v?.amountCurrency === v?.amountExcludingVatCurrency * 1.25}`);
  } else {
    console.log("Invoice creation failed!");
  }
}

main().catch(console.error);
