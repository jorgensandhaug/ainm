const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "P49D8Ev7Wp1xFsTW6_CSLG1cT-4dgLIGowNpmnIlmXQ";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Authorization": AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  // Step 1+2: parallel customer lookup + VAT resolution
  const [custRes, vatRes] = await Promise.all([
    api("GET", "customer?organizationNumber=841254546&fields=*"),
    api("GET", "ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*"),
  ]);

  if (custRes.status !== 200 || !custRes.data?.values?.length) {
    console.error("Customer not found", custRes.data);
    return;
  }
  const customerId = custRes.data.values[0].id;
  console.log("customerId:", customerId);

  // Find 25% VAT type
  const vatTypes = vatRes.data?.values || [];
  const vat25 = vatTypes.find((v: any) => v.percentage === 25);
  if (!vat25) {
    console.error("No 25% VAT type found. Available:", vatTypes.map((v: any) => `${v.number}:${v.percentage}%`));
    return;
  }
  const vatTypeId = vat25.id;
  console.log("vatTypeId:", vatTypeId, "percentage:", vat25.percentage);

  const invoiceDate = "2026-03-21";
  const invoicePayload = {
    invoiceDate,
    invoiceDueDate: "2026-04-20",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      orderDate: invoiceDate,
      deliveryDate: invoiceDate,
      orderLines: [{
        description: "System Development",
        count: 1,
        unitPriceExcludingVatCurrency: 28500,
        vatType: { id: vatTypeId },
      }],
    }],
  };

  // Step 3: Create invoice with sendToCustomer=true (default)
  let invRes = await api("POST", "invoice?sendToCustomer=true", invoicePayload);

  // Bank account repair branch
  if (invRes.status === 422 && JSON.stringify(invRes.data).includes("bank")) {
    console.log("Bank account repair needed...");
    const acctRes = await api("GET", "ledger/account?isBankAccount=true&fields=*");
    const accounts = acctRes.data?.values || [];
    const acct1920 = accounts.find((a: any) => a.number === 1920);
    if (acct1920) {
      await api("PUT", `ledger/account/${acct1920.id}`, {
        id: acct1920.id,
        number: acct1920.number,
        name: acct1920.name,
        bankAccountNumber: "12345678903",
      });
      // Retry invoice with same payload, reusing customerId and vatTypeId
      invRes = await api("POST", "invoice?sendToCustomer=true", invoicePayload);
    }
  }

  if (invRes.status === 201) {
    const inv = invRes.data?.value;
    console.log("Invoice created:", inv?.id, "number:", inv?.invoiceNumber);
    console.log("amountExcludingVatCurrency:", inv?.amountExcludingVatCurrency);
    console.log("amountCurrency:", inv?.amountCurrency);
  }
}

main().catch(console.error);
