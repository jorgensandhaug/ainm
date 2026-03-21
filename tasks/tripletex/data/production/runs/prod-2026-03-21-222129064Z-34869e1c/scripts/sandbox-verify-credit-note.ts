const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function run() {
  // Step 1: Create a fixture customer
  const custRes = await fetch(`${BASE}/customer`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Lysgård Sandbox AS",
      organizationNumber: "962467210",
      invoiceEmail: "test@sandbox.test",
    }),
  });
  if (!custRes.ok) {
    console.error("POST /customer failed:", custRes.status, await custRes.text());
    process.exit(1);
  }
  const cust = await custRes.json();
  const customerId = cust.value.id;
  console.log("Created customer:", customerId);

  // Get valid outgoing vatType for sandbox
  const vatRes = await fetch(`${BASE}/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*`, {
    headers: { Authorization: AUTH },
  });
  const vatData = await vatRes.json();
  const vat0 = vatData.values?.find((v: any) => v.percentage === 0);
  console.log("Using vatType:", vat0?.id, "percentage:", vat0?.percentage);

  // Step 2: Create a fixture order with the target description
  const orderRes = await fetch(`${BASE}/order`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      customer: { id: customerId },
      deliveryDate: "2026-03-21",
      orderDate: "2026-03-21",
      orderLines: [
        {
          description: "Nettverkstjeneste",
          count: 1,
          unitPriceExcludingVatCurrency: 41600,
          vatType: { id: vat0.id },
        },
      ],
    }),
  });
  if (!orderRes.ok) {
    console.error("POST /order failed:", orderRes.status, await orderRes.text());
    process.exit(1);
  }
  const order = await orderRes.json();
  const orderId = order.value.id;
  console.log("Created order:", orderId);

  // Step 3: Create invoice from order using PUT /order/{id}/:invoice
  const invoiceRes = await fetch(`${BASE}/order/${orderId}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`, {
    method: "PUT",
    headers: { Authorization: AUTH },
  });
  if (!invoiceRes.ok) {
    console.error("PUT /order/:invoice failed:", invoiceRes.status, await invoiceRes.text());
    process.exit(1);
  }
  const invoice = await invoiceRes.json();
  const invoiceId = invoice.value.id;
  console.log("Created invoice:", invoiceId, "amount:", invoice.value.amountExcludingVatCurrency);

  // Now test the exact two-call production path
  console.log("\n--- Testing two-call credit note path ---\n");

  // Call 1: Decisive GET /invoice
  const getUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
  const getRes = await fetch(getUrl, { headers: { Authorization: AUTH } });
  if (!getRes.ok) {
    console.error("GET /invoice failed:", getRes.status, await getRes.text());
    process.exit(1);
  }
  const data = await getRes.json();
  const invoices = data.values || [];

  const match = invoices.find((inv: any) => {
    if (inv.isCreditNote || inv.isCredited) return false;
    if (inv.customer?.organizationNumber !== "962467210") return false;
    if (inv.amountExcludingVatCurrency !== 41600) return false;
    const topMatch = inv.orderLines?.some((ol: any) => ol.description === "Nettverkstjeneste");
    const nestedMatch = inv.orders?.some((o: any) =>
      o.orderLines?.some((ol: any) => ol.description === "Nettverkstjeneste")
    );
    return topMatch || nestedMatch;
  });

  if (!match) {
    console.error("No matching invoice found in sandbox!");
    process.exit(1);
  }
  console.log("Call 1 - Found invoice:", match.id, "amount:", match.amountExcludingVatCurrency);

  // Call 2: Create credit note
  const putUrl = `${BASE}/invoice/${match.id}/:createCreditNote?date=2026-03-21&sendToCustomer=false`;
  const putRes = await fetch(putUrl, {
    method: "PUT",
    headers: { Authorization: AUTH },
  });
  if (!putRes.ok) {
    console.error("PUT createCreditNote failed:", putRes.status, await putRes.text());
    process.exit(1);
  }
  const result = await putRes.json();
  console.log("Call 2 - Credit note created:");
  console.log("  ID:", result.value?.id);
  console.log("  invoiceNumber:", result.value?.invoiceNumber);
  console.log("  isCreditNote:", result.value?.isCreditNote);
  console.log("  creditedInvoice:", result.value?.creditedInvoice);
  console.log("  amountExcludingVatCurrency:", result.value?.amountExcludingVatCurrency);
  console.log("\nSUCCESS: Two-call path verified in sandbox for organizationNumber=962467210, description=Nettverkstjeneste, amount=41600");
}

run();
