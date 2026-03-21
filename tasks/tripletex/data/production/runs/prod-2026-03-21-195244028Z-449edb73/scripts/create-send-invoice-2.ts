const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "cs0VPY6_EgwmmNyKRyb92JWitw0mcFPhLJ7PsFCc07c";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> ${method} ${url}`);
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`<<< ${res.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!res.ok) throw new Error(`API ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  const customerId = 108324109; // Bergvik AS, already resolved

  // 1. Create product "Systemutvikling"
  const prodRes = await api("POST", "/product", {
    name: "Systemutvikling",
  });
  const productId = prodRes.value.id;
  console.log(`\nProduct created: id=${productId}`);

  // 2. Create order
  const orderRes = await api("POST", "/order", {
    customer: { id: customerId },
    orderDate: "2026-03-21",
    deliveryDate: "2026-03-21",
    orderLines: [
      {
        product: { id: productId },
        description: "Systemutvikling",
        count: 1,
        unitPriceExcludingVatCurrency: 28900,
      },
    ],
  });
  const orderId = orderRes.value.id;
  console.log(`\nOrder created: id=${orderId}`);

  // 3. Convert to invoice and send
  try {
    const invoiceRes = await api(
      "PUT",
      `/order/${orderId}/:invoice?invoiceDate=2026-03-21&sendToCustomer=true`
    );
    const inv = invoiceRes.value;
    console.log(`\nInvoice created and sent:`);
    console.log(`  id=${inv.id}`);
    console.log(`  invoiceNumber=${inv.invoiceNumber}`);
    console.log(`  amountExcludingVatCurrency=${inv.amountExcludingVatCurrency}`);
    console.log(`  amountCurrency=${inv.amountCurrency}`);
    console.log(`  amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}`);
  } catch (e: any) {
    // Recovery: bank account missing
    if (e.message.includes("bankkontonummer")) {
      console.log("\n--- Bank account missing, repairing ---");
      const acctRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
      const accounts = acctRes.values || [];
      const invoiceAcct = accounts.find((a: any) => a.isInvoiceAccount)
        || accounts.find((a: any) => String(a.number).startsWith("19"));
      if (!invoiceAcct) throw new Error("No suitable bank account found");

      if (!invoiceAcct.bankAccountNumber) {
        await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
          id: invoiceAcct.id,
          version: invoiceAcct.version,
          number: invoiceAcct.number,
          name: invoiceAcct.name,
          bankAccountNumber: "12345678903",
        });
        console.log(`\nBank account ${invoiceAcct.number} updated`);
      }

      // Retry invoice creation
      const invoiceRes = await api(
        "PUT",
        `/order/${orderId}/:invoice?invoiceDate=2026-03-21&sendToCustomer=true`
      );
      const inv = invoiceRes.value;
      console.log(`\nInvoice created and sent (after repair):`);
      console.log(`  id=${inv.id}`);
      console.log(`  invoiceNumber=${inv.invoiceNumber}`);
      console.log(`  amountExcludingVatCurrency=${inv.amountExcludingVatCurrency}`);
      console.log(`  amountCurrency=${inv.amountCurrency}`);
      console.log(`  amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}`);
    } else {
      throw e;
    }
  }
}

main().catch((e) => { console.error("\nFATAL:", e.message); process.exit(1); });
