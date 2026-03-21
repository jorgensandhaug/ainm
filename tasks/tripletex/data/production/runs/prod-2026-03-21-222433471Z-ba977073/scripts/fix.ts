const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Yi7bFvRBeibSxllTjefDiqCbrmzR8-X1tkCbHmRDL0E";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const FEE = 40;

// From prior successful calls:
const customerId = 108441398;
const overdueInvoiceId = 2147645103;
const paymentTypeId = 37539606;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) {
    console.error(`${method} ${path} → ${r.status}`, JSON.stringify(json).slice(0, 500));
    throw new Error(`${r.status}`);
  }
  console.log(`${method} ${path} → ${r.status}`);
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

async function main() {
  // 5. Create and send fee invoice (fix: use orders[].orderLines[])
  const feeInvoice = await api("POST", "/invoice", {
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
            description: "Mahngebühr",
            count: 1,
            unitPriceExcludingVatCurrency: FEE,
          },
        ],
      },
    ],
  });
  console.log(`Fee invoice created: id=${feeInvoice.id} #${feeInvoice.invoiceNumber} amount=${feeInvoice.amountCurrency}`);

  // 6. Register partial payment on overdue invoice
  const paymentResult = await api("PUT",
    `/invoice/${overdueInvoiceId}/:payment?paymentDate=${TODAY}&paymentTypeId=${paymentTypeId}&paidAmount=5000`);
  console.log(`Payment registered. Remaining outstanding: ${paymentResult.amountCurrencyOutstanding ?? paymentResult.amountOutstanding}`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
