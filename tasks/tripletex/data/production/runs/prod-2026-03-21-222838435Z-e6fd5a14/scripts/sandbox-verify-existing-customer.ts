const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
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
  const today = "2026-03-21";

  // Step 1: Create a test customer to simulate existing customer
  const custRes = await api("POST", "/customer", {
    name: "Sjøbris Sandbox Test AS",
    organizationNumber: "999847830",
    invoiceSendMethod: "MANUAL",
  });

  if (custRes.status !== 201) {
    // Try to find existing
    const findRes = await api("GET", `/customer?organizationNumber=999847830&fields=*`);
    if (findRes.data.values?.length) {
      console.log("Found existing customer:", findRes.data.values[0].id);
      var customerId = findRes.data.values[0].id;
    } else {
      console.error("Cannot create or find customer");
      return;
    }
  } else {
    var customerId = custRes.data.value.id;
  }
  console.log("Customer ID:", customerId);

  // Step 2: Get VAT types (sandbox only has 0%)
  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${today}&fields=*`);
  const vatTypes = vatRes.data.values || [];
  console.log("Available VAT types:", vatTypes.map((v: any) => `code ${v.number} (${v.percentage}%) id=${v.id}`).join(", "));

  // Use whatever VAT type is available (sandbox only has 0%)
  const vatType = vatTypes[0];
  if (!vatType) {
    console.error("No VAT types found");
    return;
  }

  // Step 3: Create invoice with Nynorsk description
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
            vatType: { id: vatType.id },
          },
        ],
      },
    ],
  };

  const invRes = await api("POST", "/invoice?sendToCustomer=true", invoicePayload);

  if (invRes.status === 201) {
    const inv = invRes.data.value;
    console.log("\n=== Invoice Created ===");
    console.log("Invoice ID:", inv.id);
    console.log("Invoice number:", inv.invoiceNumber);
    console.log("Amount ex VAT:", inv.amountExcludingVatCurrency);
    console.log("Amount incl VAT:", inv.amountCurrency);

    // Verify description preserved correctly via readback
    const readback = await api("GET", `/invoice/${inv.id}?fields=*,orders(*,orderLines(*,product(*),vatType(*)))`);
    if (readback.status === 200) {
      const rb = readback.data.value;
      const order = rb.orders?.[0];
      const line = order?.orderLines?.[0];
      console.log("\n=== Readback Verification ===");
      console.log("Description:", line?.description);
      console.log("Product:", line?.product);
      console.log("Unit price:", line?.unitPriceExcludingVatCurrency);
      console.log("VAT code:", line?.vatType?.number, `(${line?.vatType?.percentage}%)`);
      console.log("Description preserved correctly:", line?.description === "Nettverksteneste");
    }
  } else {
    console.error("Invoice creation failed");
  }
}

main();
