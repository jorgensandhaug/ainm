const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Bpkip8q73esFH1_ApAaZYg6xflVBqdlegCZwpRV80u8";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = BASE + path;
  const res = await fetch(url, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) console.log(JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

async function main() {
  // Step 1+2 parallel: resolve existing customer + get outgoing VAT types
  const [custRes, vatRes] = await Promise.all([
    api("GET", "/customer?organizationNumber=876520427&fields=*"),
    api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*"),
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
    console.error("No 25% outgoing VAT type found. Available:", vatTypes.map((v: any) => `${v.number}/${v.percentage}%`));
    return;
  }
  const vatTypeId = vat25.id;
  console.log("vatTypeId:", vatTypeId, "code:", vat25.number, "rate:", vat25.percentage + "%");

  // Step 3: POST /invoice
  const invoiceDate = "2026-03-21";
  const invoicePayload = {
    invoiceDate,
    invoiceDueDate: invoiceDate,
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      orderDate: invoiceDate,
      deliveryDate: invoiceDate,
      orderLines: [{
        description: "Analyserapport",
        count: 1,
        unitPriceExcludingVatCurrency: 7850,
        vatType: { id: vatTypeId },
      }],
    }],
  };

  let invRes = await api("POST", "/invoice?sendToCustomer=true", invoicePayload);

  // Bank account repair branch
  if (invRes.status === 422 && JSON.stringify(invRes.data).includes("bank")) {
    console.log("Bank account repair needed");
    const acctRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
    const accounts = acctRes.data?.values || [];
    const acct1920 = accounts.find((a: any) => a.number === 1920) || accounts[0];
    if (!acct1920) {
      console.error("No bank account found");
      return;
    }
    console.log("Repairing account:", acct1920.id, "number:", acct1920.number);
    await api("PUT", `/ledger/account/${acct1920.id}`, {
      id: acct1920.id,
      number: acct1920.number,
      name: acct1920.name,
      bankAccountNumber: "12345678903",
    });
    // Retry invoice with same payload, customer.id and vatType.id retained
    invRes = await api("POST", "/invoice?sendToCustomer=true", invoicePayload);
  }

  if (invRes.status === 201) {
    const inv = invRes.data?.value;
    console.log("SUCCESS");
    console.log("invoiceId:", inv?.id);
    console.log("invoiceNumber:", inv?.invoiceNumber);
    console.log("amountExcludingVat:", inv?.amountExcludingVatCurrency);
    console.log("amountIncludingVat:", inv?.amountCurrency);
  } else {
    console.error("Invoice creation failed", invRes.status);
  }
}

main();
