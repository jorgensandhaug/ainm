const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "-XAIZFRZaBkpb5TnvSbt0oKUzZ56Z80wkHO1bOkmj3Y";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";
const FEE = 55;
const PAYMENT = 5000;

// Known from prior GETs:
const OVERDUE_ID = 2147696691;
const CUSTOMER_ID = 108585789;
const PT_ID = 39751124;
const ACC_1500_ID = 499098290;
const ACC_3400_ID = 499098486;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) {
    console.log("ERROR:", JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} => ${res.status}`);
  }
  return json;
}

function unwrap(json: any) {
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // 4. Post voucher for reminder fee (no currency field)
  const voucherBody = {
    date: TODAY,
    description: "Purregebyr",
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { id: ACC_1500_ID },
        customer: { id: CUSTOMER_ID },
        amount: FEE,
        amountCurrency: FEE,
        amountGross: FEE,
        amountGrossCurrency: FEE,
      },
      {
        row: 2,
        account: { id: ACC_3400_ID },
        amount: -FEE,
        amountCurrency: -FEE,
        amountGross: -FEE,
        amountGrossCurrency: -FEE,
      },
    ],
  };
  const voucherRes = await api("POST", "/ledger/voucher", voucherBody);
  const voucher = unwrap(voucherRes);
  console.log(`Voucher created: id=${voucher.id} number=${voucher.number}`);

  // 5. Create fee invoice
  const invoiceBody = {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: CUSTOMER_ID },
    orders: [
      {
        customer: { id: CUSTOMER_ID },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [
          {
            description: "Purregebyr",
            count: 1,
            unitPriceExcludingVatCurrency: FEE,
          },
        ],
      },
    ],
  };
  const invRes = await api("POST", "/invoice", invoiceBody);
  const feeInvoice = unwrap(invRes);
  console.log(`Fee invoice created: id=${feeInvoice.id} number=${feeInvoice.invoiceNumber} amount=${feeInvoice.amountCurrency}`);

  // 6. Register partial payment on overdue invoice
  const payRes = await api("PUT", `/invoice/${OVERDUE_ID}/:payment?paymentDate=${TODAY}&paymentTypeId=${PT_ID}&paidAmount=${PAYMENT}`);
  const payResult = unwrap(payRes);
  console.log(`Payment registered. Remaining outstanding: ${payResult.amountCurrencyOutstanding ?? payResult.amountOutstanding}`);

  // Verification GETs
  console.log("\n=== VERIFICATION ===");
  const vVerify = await api("GET", `/ledger/voucher/${voucher.id}?fields=id,number,date,description,postings(row,account(number,name),amountGross,customer(id,name))`);
  console.log("Voucher verification:", JSON.stringify(unwrap(vVerify), null, 2));

  const fVerify = await api("GET", `/invoice/${feeInvoice.id}?fields=id,invoiceNumber,amountCurrency,amountExcludingVatCurrency,customer(id,name)`);
  console.log("Fee invoice verification:", JSON.stringify(unwrap(fVerify), null, 2));

  const oVerify = await api("GET", `/invoice/${OVERDUE_ID}?fields=id,invoiceNumber,amountCurrencyOutstanding,amountOutstanding`);
  console.log("Overdue invoice verification:", JSON.stringify(unwrap(oVerify), null, 2));
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
