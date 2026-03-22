const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "kgdGaVu4KfqeXKZKqIlCqsuRKDTSA02c8F97QnsTWmw";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";
const FEE = 65;
const PAYMENT = 5000;

async function api(method: string, path: string, body?: any) {
  const url = BASE + path;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const txt = await r.text();
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) { console.log(txt); throw new Error(`${r.status} on ${method} ${path}`); }
  if (!txt) return null;
  const json = JSON.parse(txt);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // 1. Locate overdue invoice
  const invoices: any[] = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-22&count=1000&sorting=-invoiceDate&fields=*,customer(*)");
  const overdue = invoices.filter((i: any) => i.invoiceDueDate < TODAY && (i.amountCurrencyOutstanding > 0 || i.amountOutstanding > 0));
  if (overdue.length !== 1) { console.log(`Found ${overdue.length} overdue invoices, expected 1`); return; }
  const inv = overdue[0];
  const custId = inv.customer.id;
  console.log(`Overdue invoice #${inv.invoiceNumber} (id=${inv.id}), customer=${custId} (${inv.customer.name}), outstanding=${inv.amountCurrencyOutstanding}, due=${inv.invoiceDueDate}`);

  // 2. Resolve payment type
  const ptypes: any[] = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const pt = ptypes.find((p: any) => p.debitAccount && (p.debitAccount.number >= 1900 && p.debitAccount.number < 2000 || p.debitAccount.isBankAccount));
  if (!pt) { console.log("No suitable payment type found"); return; }
  console.log(`Payment type: id=${pt.id}, name=${pt.name}, debitAccount=${pt.debitAccount?.number}`);

  // 3. Resolve ledger accounts
  const accounts: any[] = await api("GET", "/ledger/account?number=1500,3400&fields=*");
  const acc1500 = accounts.find((a: any) => a.number === 1500);
  const acc3400 = accounts.find((a: any) => a.number === 3400);
  if (!acc1500 || !acc3400) { console.log("Missing accounts"); return; }
  console.log(`Account 1500: id=${acc1500.id}, Account 3400: id=${acc3400.id}`);

  // 4. Post manual voucher
  const voucher = await api("POST", "/ledger/voucher", {
    date: TODAY,
    description: `Purregebyr faktura ${inv.invoiceNumber}`,
    voucherType: null,
    postings: [
      {
        row: 1, date: TODAY, description: `Purregebyr faktura ${inv.invoiceNumber}`,
        account: { id: acc1500.id }, customer: { id: custId }, currency: { id: 1 },
        amount: FEE, amountCurrency: FEE, amountGross: FEE, amountGrossCurrency: FEE
      },
      {
        row: 2, date: TODAY, description: `Purregebyr faktura ${inv.invoiceNumber}`,
        account: { id: acc3400.id }, currency: { id: 1 },
        amount: -FEE, amountCurrency: -FEE, amountGross: -FEE, amountGrossCurrency: -FEE
      }
    ]
  });
  console.log(`Voucher created: id=${voucher.id}, number=${voucher.number}`);

  // 5. Create and send fee invoice
  const feeInv = await api("POST", "/invoice", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: custId },
    orders: [{
      customer: { id: custId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: "Purregebyr",
        count: 1,
        unitPriceExcludingVatCurrency: FEE
      }]
    }]
  });
  console.log(`Fee invoice created: id=${feeInv.id}, number=${feeInv.invoiceNumber}, amount=${feeInv.amountCurrency}`);

  // 6. Register partial payment on overdue invoice
  const payResult = await api("PUT", `/invoice/${inv.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${PAYMENT}`);
  console.log(`Payment registered. Remaining outstanding: ${payResult?.amountCurrencyOutstanding ?? "unknown"}`);

  console.log("\n=== DONE (6 calls) ===");
}

main().catch(e => { console.error(e); process.exit(1); });
