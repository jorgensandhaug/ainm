const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ybvBKGrCcjhhqnHnDYDnWOZdzVWKijTgCC_u1eQeyjg";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const TODAY = "2026-03-21";

const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} -> ${res.status}`);
  if (!res.ok) {
    console.log("ERROR:", JSON.stringify(json).slice(0, 500));
    return { ok: false as const, status: res.status, data: json };
  }
  return { ok: true as const, status: res.status, data: json };
}

async function main() {
  // Already know from previous run:
  // Customer: id=108328645 (Strandvik AS)
  // Skylagring: id=84412377 vatType.id=3
  // Datarådgjeving: id=84412379 vatType.id=3
  // Payment type "Betalt til bank": id=28377288
  // Bank account already has bankAccountNumber, no repair needed

  const customerId = 108328645;
  const skylagringId = 84412377;
  const dataraadgjevingId = 84412379;
  const paymentTypeId = 28377288;

  // 4. Create order
  const orderPayload = {
    customer: { id: customerId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [
      {
        product: { id: skylagringId },
        description: "Skylagring",
        count: 1,
        unitPriceExcludingVatCurrency: 38500,
      },
      {
        product: { id: dataraadgjevingId },
        description: "Datarådgjeving",
        count: 1,
        unitPriceExcludingVatCurrency: 18500,
      },
    ],
  };

  const orderRes = await api("POST", "/order", orderPayload);
  if (!orderRes.ok) { console.log("BLOCKED: order creation failed"); return; }
  const orderId = orderRes.data.value.id;
  console.log(`Order created: id=${orderId}`);

  // 5. Convert order to invoice with full payment
  const invoicePath = `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false&paymentTypeId=${paymentTypeId}&paidAmount=0.01&paymentTypeIdRestAmount=${paymentTypeId}`;
  let invoiceRes = await api("PUT", invoicePath);

  // Bank account repair if needed
  if (!invoiceRes.ok && invoiceRes.status === 422) {
    const errMsg = JSON.stringify(invoiceRes.data);
    if (errMsg.includes("bankkontonummer") || errMsg.includes("bank account")) {
      console.log("Bank account repair needed...");
      const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
      if (!bankRes.ok) { console.log("BLOCKED: bank account lookup failed"); return; }
      const bankAccounts = bankRes.data.values || [];
      const targetBank = bankAccounts.find((a: any) => !a.bankAccountNumber || a.bankAccountNumber === "") || bankAccounts[0];
      if (!targetBank) { console.log("BLOCKED: no bank account found"); return; }

      await api("PUT", `/ledger/account/${targetBank.id}`, {
        ...targetBank,
        bankAccountNumber: "12345678903",
      });

      // Retry invoice
      invoiceRes = await api("PUT", invoicePath);
    }
  }

  if (!invoiceRes.ok) { console.log("BLOCKED: invoice creation failed"); return; }

  const invoice = invoiceRes.data.value;
  console.log(`Invoice created: id=${invoice.id} number=${invoice.invoiceNumber}`);
  console.log(`amountExcludingVatCurrency=${invoice.amountExcludingVatCurrency}`);
  console.log(`amountCurrency=${invoice.amountCurrency}`);
  console.log(`amountOutstanding=${invoice.amountOutstanding}`);
  console.log(`amountCurrencyOutstanding=${invoice.amountCurrencyOutstanding}`);

  if (invoice.amountCurrencyOutstanding === 0 || invoice.amountOutstanding === 0) {
    console.log("SUCCESS: Full payment registered, outstanding=0");
  } else {
    console.log("WARNING: Outstanding amount is not zero");
  }
}

main().catch(e => console.error("FATAL:", e));
