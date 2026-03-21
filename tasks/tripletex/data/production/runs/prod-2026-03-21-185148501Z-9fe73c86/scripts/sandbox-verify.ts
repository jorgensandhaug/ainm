const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: any = { method, headers: HEADERS };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} /${path} → ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  // Verify the exact field name: unitPriceExcludingVatCurrency vs unitCostPrice
  // First, create a test customer
  const custRes = await api("POST", "customer", {
    name: "Étoile Reflection 9fe73c86 SARL",
    organizationNumber: "976414284",
    invoiceSendMethod: "MANUAL",
  });
  if (custRes.status >= 400) {
    console.log("Customer create failed");
    // Try lookup
    const lookupRes = await api("GET", "customer?organizationNumber=976414284&fields=*");
    if (lookupRes.data.values?.length > 0) {
      console.log("Customer already exists:", lookupRes.data.values[0].id);
    }
    return;
  }
  const customerId = custRes.data.value.id;
  console.log(`Customer ID: ${customerId}`);

  // Get VAT types
  const vatRes = await api("GET", "ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
  const vatTypes = vatRes.data.values;
  console.log("Available VAT types:", vatTypes.map((v: any) => `id=${v.id} code=${v.number} ${v.percentage}%`).join(", "));

  // Use first available (sandbox likely only has 0%)
  const vatType = vatTypes[0];
  console.log(`Using VAT type: id=${vatType.id} (${vatType.percentage}%)`);

  // Test 1: Try with unitCostPrice (expected to fail)
  console.log("\n--- Test 1: unitCostPrice (expecting failure) ---");
  const test1 = await api("POST", "invoice", {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-20",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        description: "Test unitCostPrice",
        count: 1,
        unitCostPrice: 1000,
        vatType: { id: vatType.id },
      }],
    }],
  });
  console.log("Result:", test1.status);

  // Test 2: Try with unitPriceExcludingVatCurrency (expected to succeed or bank 422)
  console.log("\n--- Test 2: unitPriceExcludingVatCurrency ---");
  const test2 = await api("POST", "invoice", {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-20",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        description: "Heures de conseil",
        count: 1,
        unitPriceExcludingVatCurrency: 20000,
        vatType: { id: vatType.id },
      }],
    }],
  });
  console.log("Result:", test2.status);
  if (test2.status < 300) {
    const inv = test2.data.value;
    console.log(`Invoice #${inv.invoiceNumber}, id=${inv.id}`);
    console.log(`Amount ex VAT: ${inv.amountExcludingVatCurrency}`);
    console.log(`Amount inc VAT: ${inv.amountCurrency}`);
  }
}

main().catch(console.error);
