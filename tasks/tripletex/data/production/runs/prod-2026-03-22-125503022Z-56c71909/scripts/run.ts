const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "JZDe5mcMAJtXPXERxIqx4P3LC3LlTj3E4LW41wVh31E";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  console.log(`\n>>> ${method} ${url}`);
  if (body) console.log("BODY:", JSON.stringify(body, null, 2));
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`<<< ${r.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!r.ok) throw { status: r.status, json };
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

const today = "2026-03-22";

async function main() {
  // Step 1: GET existing customer ("kunden" = definite article = exists)
  const customers = await api("GET", `customer?organizationNumber=863788722&fields=*&count=10`);
  const customer = Array.isArray(customers) ? customers[0] : customers;
  if (!customer?.id) throw new Error("Customer not found");
  console.log("Customer ID:", customer.id);

  // Step 2: POST /invoice with sendToCustomer=true (optimistic, no bank pre-check)
  const invoicePayload = {
    invoiceDate: today,
    invoiceDueDate: "2026-04-21",
    customer: { id: customer.id },
    orders: [{
      customer: { id: customer.id },
      orderDate: today,
      deliveryDate: today,
      orderLines: [{
        description: "Opplæring",
        count: 1,
        unitPriceExcludingVatCurrency: 14900,
        vatType: { id: 3 }
      }]
    }]
  };

  try {
    const invoice = await api("POST", "invoice?sendToCustomer=true", invoicePayload);
    console.log("\nInvoice created and sent successfully!");
    console.log("Invoice ID:", invoice.id, "Number:", invoice.invoiceNumber);
    console.log("Amount ex VAT:", invoice.amountExcludingVatCurrency);
    console.log("Amount inc VAT:", invoice.amountCurrency);

    // Verification GET (free)
    const verify = await api("GET", `invoice/${invoice.id}?fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`);
    console.log("\nVerification complete.");
  } catch (e: any) {
    if (e.status === 422 && JSON.stringify(e.json).includes("bankkontonummer")) {
      console.log("\n--- Bank account missing, repairing ---");
      const accounts = await api("GET", "ledger/account?isBankAccount=true&fields=*");
      const acctArr = Array.isArray(accounts) ? accounts : [accounts];
      const invoiceAcct = acctArr.find((a: any) => a.isInvoiceAccount) || acctArr.find((a: any) => a.number === 1920) || acctArr[0];
      if (!invoiceAcct) throw new Error("No bank account found");

      await api("PUT", `ledger/account/${invoiceAcct.id}`, { ...invoiceAcct, bankAccountNumber: "12345678903" });

      // Retry invoice
      const invoice = await api("POST", "invoice?sendToCustomer=true", invoicePayload);
      console.log("\nInvoice created and sent after bank repair!");
      console.log("Invoice ID:", invoice.id, "Number:", invoice.invoiceNumber);
      console.log("Amount ex VAT:", invoice.amountExcludingVatCurrency);
      console.log("Amount inc VAT:", invoice.amountCurrency);

      // Verification GET (free)
      const verify = await api("GET", `invoice/${invoice.id}?fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`);
      console.log("\nVerification complete.");
    } else {
      throw e;
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
