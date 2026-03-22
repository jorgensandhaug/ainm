// Investigate whether we can extract paymentTypeId from the invoice response itself,
// skipping the separate GET /invoice/paymentType call

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  });
  const txt = await r.text();
  console.log(`${method} ${path} -> ${r.status}`);
  const json = JSON.parse(txt);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Check if invoice response includes paymentType info
  const invoices: any[] = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-22&count=10&sorting=-invoiceDate&fields=*,customer(*),paymentType(*)");

  if (invoices.length > 0) {
    const inv = invoices[0];
    console.log("\n--- Invoice paymentType field ---");
    console.log("paymentType:", JSON.stringify(inv.paymentType, null, 2));
    console.log("Has paymentType.id?", inv.paymentType?.id);
    console.log("Has paymentType.debitAccount?", inv.paymentType?.debitAccount);

    // Check if the invoice postings contain account 1500 and 3400 ids
    console.log("\n--- Invoice postings check ---");
    console.log("postings:", JSON.stringify(inv.postings, null, 2));
  }

  // Also check: can GET /invoice return paymentTypeId directly?
  const invoices2: any[] = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-22&count=3&sorting=-invoiceDate&fields=id,invoiceNumber,paymentTypeId,paymentType(id,name,debitAccount(number))");
  console.log("\n--- paymentTypeId field check ---");
  invoices2.forEach((inv: any) => {
    console.log(`Invoice #${inv.invoiceNumber}: paymentTypeId=${inv.paymentTypeId}, paymentType=${JSON.stringify(inv.paymentType)}`);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
