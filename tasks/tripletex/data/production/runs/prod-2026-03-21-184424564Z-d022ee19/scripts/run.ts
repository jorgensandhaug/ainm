const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "B-WaiNb2qhBb2AXwLL_jXw4kFXeoIe7QD5Vq7S7nIeI";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const FEE = 70;

function parse(json: any) {
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} -> ${res.status}`);
  if (!res.ok) {
    console.error(text);
    throw new Error(`${res.status} ${text}`);
  }
  return parse(JSON.parse(text));
}

async function main() {
  // Data from already-completed calls (3 calls used):
  const INV_ID = 2147625691;
  const INV_NUMBER = 1;
  const CUSTOMER_ID = 108395937;
  const OUTSTANDING = 19687.5;
  const PAYMENT_TYPE_ID = 36850274;
  const ACC_1500_ID = 467777749;
  const ACC_3400_ID = 467777945;

  // 4. Post reminder fee voucher (call 4)
  const voucher = await api("POST", "/ledger/voucher", {
    date: TODAY,
    description: "Purregebyr",
    voucherType: null,
    postings: [
      {
        row: 1,
        date: TODAY,
        account: { id: ACC_1500_ID },
        customer: { id: CUSTOMER_ID },
        currency: { id: 1 },
        amount: FEE,
        amountCurrency: FEE,
        amountGross: FEE,
        amountGrossCurrency: FEE,
      },
      {
        row: 2,
        date: TODAY,
        account: { id: ACC_3400_ID },
        currency: { id: 1 },
        amount: -FEE,
        amountCurrency: -FEE,
        amountGross: -FEE,
        amountGrossCurrency: -FEE,
      },
    ],
  });
  console.log(`Voucher created: id=${voucher.id} number=${voucher.number}`);

  // 5. Create and send fee invoice (call 5)
  const feeInvoice = await api("POST", "/invoice", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: CUSTOMER_ID },
    orders: [
      {
        orderDate: TODAY,
        deliveryDate: TODAY,
        customer: { id: CUSTOMER_ID },
        orderLines: [
          {
            description: "Purregebyr",
            count: 1,
            unitPriceExcludingVatCurrency: FEE,
          },
        ],
      },
    ],
  });
  console.log(`Fee invoice created: id=${feeInvoice.id} number=${feeInvoice.invoiceNumber} amount=${feeInvoice.amountCurrency}`);

  // 6. Register partial payment of 5000 on the overdue invoice (call 6)
  const payment = await api("PUT", `/invoice/${INV_ID}/:payment?paymentDate=${TODAY}&paymentTypeId=${PAYMENT_TYPE_ID}&paidAmount=5000`);
  console.log(`Payment registered. Remaining outstanding: ${payment.amountCurrencyOutstanding}`);

  console.log("\n=== DONE ===");
  console.log(`Overdue invoice: #${INV_NUMBER} (id=${INV_ID})`);
  console.log(`Customer: ${CUSTOMER_ID}`);
  console.log(`Voucher: id=${voucher.id}`);
  console.log(`Fee invoice: #${feeInvoice.invoiceNumber} (id=${feeInvoice.id}), amount=${feeInvoice.amountCurrency}`);
  console.log(`Partial payment: 5000, outstanding after: ${payment.amountCurrencyOutstanding}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
