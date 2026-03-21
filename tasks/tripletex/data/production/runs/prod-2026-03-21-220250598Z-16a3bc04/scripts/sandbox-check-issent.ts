// Check if isSent is a different field name or needs different expansion
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  return { status: r.status, data: json };
}

async function main() {
  // Check an existing invoice that was sent
  const inv = await api("GET", "/invoice/2147643336?fields=*");
  if (inv.status === 200) {
    const v = inv.data.value;
    // Print all keys to find the send-related fields
    console.log("All invoice keys:", Object.keys(v).sort().join(", "));
    // Check specific send-related fields
    console.log("isSent:", v.isSent);
    console.log("sentDate:", v.sentDate);
    console.log("invoiceSendMethod:", v.invoiceSendMethod);
    console.log("sendMethodDescription:", v.sendMethodDescription);
    console.log("isCreditNote:", v.isCreditNote);
  }

  // Also check: does the POST /invoice response show different keys vs GET?
  const custRes = await api("GET", "/customer?organizationNumber=894181273&fields=*");
  const customerId = custRes.data.values[0].id;

  const vatRes = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
  const vatId = vatRes.data.values[0].id;

  const postRes = await api("POST", "/invoice?sendToCustomer=true", {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-04",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        description: "Send Status Check",
        count: 1,
        unitPriceExcludingVatCurrency: 500,
        vatType: { id: vatId }
      }]
    }]
  });

  if (postRes.status === 201) {
    const pv = postRes.data.value;
    console.log("\nPOST response keys:", Object.keys(pv).sort().join(", "));
    console.log("POST isSent:", pv.isSent);
    console.log("POST sentDate:", pv.sentDate);
    console.log("POST invoiceSendMethod:", pv.invoiceSendMethod);
  }
}

main();
