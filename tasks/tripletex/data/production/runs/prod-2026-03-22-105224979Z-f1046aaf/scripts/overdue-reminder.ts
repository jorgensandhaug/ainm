const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "-XAIZFRZaBkpb5TnvSbt0oKUzZ56Z80wkHO1bOkmj3Y";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = new Date().toISOString().slice(0, 10);
const FEE = 55;
const PAYMENT = 5000;

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
  // 1. Find overdue invoice
  const invoicesRaw = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=" + TODAY + "&count=1000&sorting=-invoiceDate&fields=*,customer(*)");
  const invoices = unwrap(invoicesRaw);
  const overdue = invoices.filter((inv: any) => {
    const due = inv.invoiceDueDate;
    const outstanding = inv.amountCurrencyOutstanding ?? inv.amountOutstanding ?? 0;
    return due < TODAY && outstanding > 0;
  });
  console.log(`Found ${overdue.length} overdue invoice(s)`);
  if (overdue.length === 0) throw new Error("No overdue invoices found");
  const ov = overdue.length === 1 ? overdue[0] : overdue[0]; // take first if multiple
  console.log(`Overdue invoice: #${ov.invoiceNumber} id=${ov.id} customer=${ov.customer?.id} (${ov.customer?.name}) outstanding=${ov.amountCurrencyOutstanding} due=${ov.invoiceDueDate}`);
  const customerId = ov.customer.id;

  // 2. Get payment types
  const ptRaw = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const pts = unwrap(ptRaw);
  // Prefer incoming bank-style payment type
  const pt = pts.find((p: any) => {
    const da = p.debitAccount;
    if (!da) return false;
    const num = da.number;
    return (num >= 1900 && num < 2000) || da.isBankAccount || da.isInvoiceAccount;
  }) || pts[0];
  console.log(`Payment type: id=${pt.id} description=${pt.description}`);

  // 3. Get account IDs for 1500 and 3400
  const accsRaw = await api("GET", "/ledger/account?number=1500,3400&fields=*");
  const accs = unwrap(accsRaw);
  const acc1500 = accs.find((a: any) => a.number === 1500);
  const acc3400 = accs.find((a: any) => a.number === 3400);
  if (!acc1500 || !acc3400) throw new Error("Missing accounts 1500 or 3400");
  console.log(`Account 1500: id=${acc1500.id} name=${acc1500.name}`);
  console.log(`Account 3400: id=${acc3400.id} name=${acc3400.name} isInactive=${acc3400.isInactive}`);

  // 4. Post voucher for reminder fee
  const voucherBody = {
    date: TODAY,
    description: "Purregebyr",
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { id: acc1500.id },
        customer: { id: customerId },
        amount: FEE,
        amountCurrency: FEE,
        amountGross: FEE,
        amountGrossCurrency: FEE,
      },
      {
        row: 2,
        account: { id: acc3400.id },
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
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
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
  const payRes = await api("PUT", `/invoice/${ov.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${PAYMENT}`);
  const payResult = unwrap(payRes);
  console.log(`Payment registered. Remaining outstanding: ${payResult.amountCurrencyOutstanding ?? payResult.amountOutstanding}`);

  // Verification GETs
  console.log("\n=== VERIFICATION ===");
  const vVerify = await api("GET", `/ledger/voucher/${voucher.id}?fields=id,number,date,description,postings(row,account(number,name),amountGross,customer(id,name))`);
  console.log("Voucher verification:", JSON.stringify(unwrap(vVerify), null, 2));

  const fVerify = await api("GET", `/invoice/${feeInvoice.id}?fields=id,invoiceNumber,amountCurrency,amountExcludingVatCurrency,customer(id,name)`);
  console.log("Fee invoice verification:", JSON.stringify(unwrap(fVerify), null, 2));

  const oVerify = await api("GET", `/invoice/${ov.id}?fields=id,invoiceNumber,amountCurrencyOutstanding,amountOutstanding`);
  console.log("Overdue invoice verification:", JSON.stringify(unwrap(oVerify), null, 2));
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
