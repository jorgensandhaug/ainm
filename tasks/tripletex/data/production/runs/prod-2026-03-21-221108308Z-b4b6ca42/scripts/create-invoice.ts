const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "7_VkFq4IhPDdo67mzCWIzCb73LRMaD55Xf4EVL1Z0-Y";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`  → ${res.status}`, JSON.stringify(json).slice(0, 1500));
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  return json;
}

async function main() {
  // Step 1+2: parallel — resolve existing customer + outgoing VAT types
  const [custRes, vatRes] = await Promise.all([
    api("GET", `/customer?organizationNumber=909722500&fields=*`),
    api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
  ]);

  const customer = custRes.values?.[0];
  if (!customer) throw new Error("Customer not found");
  const customerId = customer.id;
  console.log(`Customer: id=${customerId}, name=${customer.name}`);

  // Resolve VAT types: 25%, 15% (food), 0% (exempt)
  const vatTypes = vatRes.values || [];
  const vat25 = vatTypes.find((v: any) => v.percentage === 25);
  const vat15 = vatTypes.find((v: any) => v.percentage === 15);
  // For 0% exempt, prefer code 5 (avgiftsfri/exempt) over code 6 (outside VAT area)
  const vat0 = vatTypes.find((v: any) => v.percentage === 0 && v.number === 5)
    || vatTypes.find((v: any) => v.percentage === 0);

  if (!vat25) throw new Error("No 25% outgoing VAT type found");
  if (!vat15) throw new Error("No 15% outgoing VAT type found");
  if (!vat0) throw new Error("No 0% outgoing VAT type found");

  console.log(`VAT 25%: id=${vat25.id}, code=${vat25.number}`);
  console.log(`VAT 15%: id=${vat15.id}, code=${vat15.number}`);
  console.log(`VAT 0%: id=${vat0.id}, code=${vat0.number}`);

  // Step 3: POST /invoice
  const invoicePayload = {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-20",
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [
          {
            description: "Analysis Report",
            count: 1,
            unitPriceExcludingVatCurrency: 27700,
            vatType: { id: vat25.id },
          },
          {
            description: "Maintenance",
            count: 1,
            unitPriceExcludingVatCurrency: 12700,
            vatType: { id: vat15.id },
          },
          {
            description: "System Development",
            count: 1,
            unitPriceExcludingVatCurrency: 7050,
            vatType: { id: vat0.id },
          },
        ],
      },
    ],
  };

  try {
    const inv = await api("POST", `/invoice?sendToCustomer=true`, invoicePayload);
    console.log("\nInvoice created successfully!");
    console.log(`  Invoice ID: ${inv.value?.id}`);
    console.log(`  Invoice Number: ${inv.value?.invoiceNumber}`);
    console.log(`  Amount excl VAT: ${inv.value?.amountExcludingVatCurrency}`);
    console.log(`  Amount incl VAT: ${inv.value?.amountCurrency}`);
  } catch (e: any) {
    // Bank account repair branch
    if (e.message.includes("bankkonto") || e.message.includes("bank account") || e.message.includes("Bankkonto")) {
      console.log("\nBank account missing — entering repair branch...");
      const acctRes = await api("GET", `/ledger/account?isBankAccount=true&fields=*`);
      const accounts = acctRes.values || [];
      // Find account 1920 (invoice account)
      const acct1920 = accounts.find((a: any) => a.number === 1920) || accounts[0];
      if (!acct1920) throw new Error("No bank account found");
      console.log(`Repairing account ${acct1920.number} (id=${acct1920.id})`);

      await api("PUT", `/ledger/account/${acct1920.id}`, {
        id: acct1920.id,
        number: acct1920.number,
        name: acct1920.name,
        bankAccountNumber: "12345678903",
      });

      // Retry invoice — reuse customerId and vatType IDs
      const inv = await api("POST", `/invoice?sendToCustomer=true`, invoicePayload);
      console.log("\nInvoice created successfully (after bank repair)!");
      console.log(`  Invoice ID: ${inv.value?.id}`);
      console.log(`  Invoice Number: ${inv.value?.invoiceNumber}`);
      console.log(`  Amount excl VAT: ${inv.value?.amountExcludingVatCurrency}`);
      console.log(`  Amount incl VAT: ${inv.value?.amountCurrency}`);
    } else {
      throw e;
    }
  }
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
