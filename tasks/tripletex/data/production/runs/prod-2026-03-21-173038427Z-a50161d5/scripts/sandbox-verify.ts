const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

let callCount = 0;
async function api(method: string, path: string, body?: any) {
  callCount++;
  const url = `${BASE}${path}`;
  console.log(`\n[Call #${callCount}] >>> ${method} ${url}`);
  if (body) console.log("Body:", JSON.stringify(body, null, 2));
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  console.log(`<<< ${res.status}`);
  if (!res.ok) {
    console.log(JSON.stringify(data, null, 2));
    throw new Error(`${method} ${path} failed: ${res.status}`);
  }
  return data;
}

async function main() {
  // Using known sandbox products: 7579 (Opplæring) and 2292 (Webdesign)
  // And known sandbox customer: organizationNumber=864062245

  // Call 1: Resolve customer
  const custRes = await api("GET", "/customer?organizationNumber=864062245&fields=*");
  const customer = custRes.values[0];
  if (!customer) throw new Error("Customer not found");
  console.log(`Customer: ${customer.name} (id=${customer.id})`);

  // Call 2: Resolve ALL products with count=1000 (single call, always resolves all)
  const prodRes = await api("GET", "/product?count=1000&fields=*");
  const allProducts = prodRes.values as any[];

  // Filter locally by number field
  const refs = ["7579", "2292"];
  const resolved = new Map<string, any>();
  for (const p of allProducts) {
    const n = String(p.number ?? "");
    for (const ref of refs) {
      if (n === ref) resolved.set(ref, p);
    }
  }
  if (resolved.size < refs.length) throw new Error("Could not resolve all products");
  const prod7579 = resolved.get("7579")!;
  const prod2292 = resolved.get("2292")!;
  console.log(`Product 7579: ${prod7579.name} (id=${prod7579.id})`);
  console.log(`Product 2292: ${prod2292.name} (id=${prod2292.id})`);

  // Call 3: Resolve payment type
  const ptRes = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const paymentTypes = ptRes.values as any[];
  const incoming = paymentTypes.find((pt: any) => {
    const da = pt.debitAccount;
    if (!da) return false;
    const num = String(da.number ?? "");
    return num.startsWith("19") && (da.isBankAccount || da.isInvoiceAccount);
  });
  if (!incoming) throw new Error("No suitable payment type");
  console.log(`Payment type: ${incoming.description} (id=${incoming.id})`);

  // Call 4: Create order
  const orderBody = {
    customer: { id: customer.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [
      { product: { id: prod7579.id }, description: "Opplæring", count: 1, unitPriceExcludingVatCurrency: 5000 },
      { product: { id: prod2292.id }, description: "Webdesign", count: 1, unitPriceExcludingVatCurrency: 3000 },
    ],
  };
  const orderRes = await api("POST", "/order", orderBody);
  const orderId = orderRes.value.id;
  console.log(`Order created: id=${orderId}`);

  // Call 5: Invoice + payment
  const invoiceRes = await api(
    "PUT",
    `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false&paymentTypeId=${incoming.id}&paidAmount=0.01&paymentTypeIdRestAmount=${incoming.id}`
  );
  const invoice = invoiceRes.value;
  const outstanding = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  console.log(`Invoice: id=${invoice.id}, number=${invoice.invoiceNumber}, outstanding=${outstanding}`);
  console.log(`\nTotal API calls: ${callCount}`);
  console.log(outstanding === 0 ? "SUCCESS: Payment fully settled in 5 calls" : "WARNING: Outstanding not zero");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
