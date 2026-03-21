const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
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
    console.log("ERROR:", JSON.stringify(json).slice(0, 800));
  }
  if (json.values !== undefined) return { _status: r.status, data: json.values };
  if (json.value !== undefined) return { _status: r.status, data: json.value };
  return { _status: r.status, data: json };
}

// Check what outgoing VAT types exist
const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
console.log("\nOutgoing VAT types:");
for (const v of vatRes.data) {
  console.log(`  id=${v.id} name=${v.name} percentage=${v.percentage} number=${v.number}`);
}

// Check vat25 approach
const vat25 = vatRes.data.find((v: any) => v.percentage === 25);
console.log("\nvat25 by percentage:", vat25?.id, vat25?.name);

// Also try by number - common Norwegian 25% outgoing VAT is often number 3
const vat3 = vatRes.data.find((v: any) => v.number === 3);
console.log("vat number 3:", vat3?.id, vat3?.name, vat3?.percentage);

// Use the IDs from the previous successful sandbox run
const customerId = 108371825;
const projectId = 402016278;

// Try the invoice with the correct VAT type
const vatId = vat25?.id || vat3?.id;
if (!vatId) {
  console.log("No suitable VAT type found!");
  process.exit(1);
}

console.log("\nUsing vatType id:", vatId);

const invRes = await api("POST", "/invoice?sendToCustomer=false", {
  invoiceDate: TODAY,
  invoiceDueDate: "2026-04-20",
  customer: { id: customerId },
  orders: [{
    customer: { id: customerId },
    project: { id: projectId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: "Cloud-Migration - Projektleistungen",
      count: 1,
      unitPriceExcludingVatCurrency: 253000,
      vatType: { id: vatId },
    }],
  }],
});

console.log("\nInvoice:", invRes._status);
if (invRes._status === 201) {
  console.log("Invoice ID:", invRes.data.id);
  console.log("Invoice Number:", invRes.data.invoiceNumber);
  console.log("Amount excl VAT:", invRes.data.amountExcludingVatCurrency);
  console.log("Amount incl VAT:", invRes.data.amount);
  console.log("projectInvoiceDetails:", JSON.stringify(invRes.data.projectInvoiceDetails)?.slice(0, 500));
} else {
  console.log("Invoice body:", JSON.stringify(invRes.data).slice(0, 1000));
}
