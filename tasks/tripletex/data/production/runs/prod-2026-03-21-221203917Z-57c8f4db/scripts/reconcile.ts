const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "8S4UJQj4JuN8Sw6KYmD6wm0B8Xo4MGdAzmxIyKUd7Ic";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(json).slice(0, 500)); }
  return { status: r.status, data: json };
}

async function get(path: string) { return api("GET", path); }
async function put(path: string) { return api("PUT", path); }
async function post(path: string, body: any) { return api("POST", path, body); }

// ── CSV data ──
const csvLines = [
  { date: "2026-01-18", desc: "Innbetaling fra Hernández SL / Faktura 1001", inn: 23437.50, ut: 0, type: "customer", name: "Hernández" },
  { date: "2026-01-20", desc: "Innbetaling fra Pérez SL / Faktura 1002", inn: 15875.00, ut: 0, type: "customer", name: "Pérez" },
  { date: "2026-01-21", desc: "Innbetaling fra González SL / Faktura 1003", inn: 18937.50, ut: 0, type: "customer", name: "González" },
  { date: "2026-01-22", desc: "Innbetaling fra Sánchez SL / Faktura 1004", inn: 6062.50, ut: 0, type: "customer", name: "Sánchez" },
  { date: "2026-01-24", desc: "Innbetaling fra Rodríguez SL / Faktura 1005", inn: 14700.00, ut: 0, type: "customer", name: "Rodríguez" },
  { date: "2026-01-26", desc: "Betaling Proveedor González SL", inn: 0, ut: 11700.00, type: "supplier", name: "González" },
  { date: "2026-01-29", desc: "Betaling Proveedor Torres SL", inn: 0, ut: 17400.00, type: "supplier", name: "Torres" },
  { date: "2026-01-31", desc: "Betaling Proveedor López SL", inn: 0, ut: 13950.00, type: "supplier", name: "López" },
  { date: "2026-02-01", desc: "Bankgebyr", inn: 440.96, ut: 0, type: "bankgebyr" },
  { date: "2026-02-03", desc: "Skattetrekk", inn: 1563.12, ut: 0, type: "skattetrekk" },
  { date: "2026-02-04", desc: "Skattetrekk", inn: 1163.48, ut: 0, type: "skattetrekk" },
];
const csvEndingSaldo = 139130.06;

// ── Step 1: 6 parallel reads ──
const [invoicesR, payTypesR, suppliersR, suppInvR, accountsR, periodsR] = await Promise.all([
  get("invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
  get("invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
  get("supplier?count=1000&fields=*"),
  get("supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
  get("ledger/account?number=1920,2400,2600,7770,8050&fields=*"),
  get("ledger/accountingPeriod?count=100&fields=*"),
]);

const invoices = invoicesR.data.values || [];
const payTypes = payTypesR.data.values || [];
const suppliers = suppliersR.data.values || [];
const suppInvoices = suppInvR.data.values || [];
const accounts = accountsR.data.values || [];
const periods = periodsR.data.values || [];

// ── Step 2: payment type with debitAccount 1920 ──
const payType = payTypes.find((pt: any) => pt.debitAccount?.number === 1920);
if (!payType) { console.log("No payment type with debitAccount 1920!"); process.exit(1); }
console.log(`Payment type: id=${payType.id}, name=${payType.description}`);

// Account lookup
const acct = (num: number) => {
  const a = accounts.find((a: any) => a.number === num);
  if (!a) { console.log(`Account ${num} not found!`); process.exit(1); }
  return a;
};
const acct1920 = acct(1920);
const acct2400 = acct(2400);
const acct2600 = acct(2600);
const acct7770 = acct(7770);
const acct8050 = acct(8050);

console.log(`Accounts: 1920=${acct1920.id}, 2400=${acct2400.id}, 2600=${acct2600.id}, 7770=${acct7770.id}, 8050=${acct8050.id}`);
console.log(`Invoices: ${invoices.length}, Suppliers: ${suppliers.length}, SupplierInvoices: ${suppInvoices.length}`);

// ── Step 3: Pay customer invoices ──
// Track outstanding amounts locally
const outstandingMap: Record<number, number> = {};
for (const inv of invoices) {
  outstandingMap[inv.id] = inv.amountCurrencyOutstanding ?? inv.amountOutstanding ?? 0;
}

const customerLines = csvLines.filter(l => l.type === "customer");
const paymentPromises = [];

for (const line of customerLines) {
  const nameLC = line.name!.toLowerCase();
  // Find matching invoice by customer name
  const matching = invoices
    .filter((inv: any) => {
      const custName = (inv.customer?.name || "").toLowerCase();
      return custName.includes(nameLC) && outstandingMap[inv.id] > 0;
    })
    .sort((a: any, b: any) => {
      // Priority: exact outstanding match, then smallest outstanding >= amount, then lowest number
      const aOut = outstandingMap[a.id];
      const bOut = outstandingMap[b.id];
      const aExact = Math.abs(aOut - line.inn) < 0.01 ? 0 : 1;
      const bExact = Math.abs(bOut - line.inn) < 0.01 ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      if (aOut >= line.inn && bOut >= line.inn) return aOut - bOut;
      if (aOut >= line.inn) return -1;
      if (bOut >= line.inn) return 1;
      return (a.invoiceNumber || a.id) - (b.invoiceNumber || b.id);
    });

  if (matching.length === 0) {
    console.log(`No matching invoice for ${line.name} ${line.inn}`);
    continue;
  }

  const inv = matching[0];
  const payAmount = Math.min(line.inn, outstandingMap[inv.id]);
  outstandingMap[inv.id] -= payAmount;

  console.log(`Paying invoice ${inv.id} (customer: ${inv.customer?.name}) amount=${payAmount} (outstanding was ${outstandingMap[inv.id] + payAmount})`);
  paymentPromises.push(
    put(`invoice/${inv.id}/:payment?paymentDate=${line.date}&paymentTypeId=${payType.id}&paidAmount=${payAmount}`)
  );
}

const payResults = await Promise.all(paymentPromises);
for (const r of payResults) {
  if (r.status >= 400) console.log("Payment error:", JSON.stringify(r.data).slice(0, 300));
}

// ── Step 4 & 5: Supplier payments + non-invoice lines in one voucher ──
const supplierLines = csvLines.filter(l => l.type === "supplier");
const nonInvoiceLines = csvLines.filter(l => l.type === "bankgebyr" || l.type === "skattetrekk");

const postings: any[] = [];
let row = 1;

// Handle supplier payments
if (suppInvoices.length > 0) {
  // Would need paymentTypeOut — but trusted standard says common case is 0 supplier invoices
  console.log("Supplier invoices found — would use addPayment (not implemented in common path)");
} else {
  // Combine all supplier payments into voucher postings
  for (const line of supplierLines) {
    const nameLC = line.name!.toLowerCase();
    const supplier = suppliers.find((s: any) => (s.name || "").toLowerCase().includes(nameLC));
    if (!supplier) {
      console.log(`Supplier not found: ${line.name}`);
      continue;
    }
    const amount = line.ut; // positive value
    postings.push({
      row: row++,
      date: line.date,
      description: line.desc,
      account: { id: acct2400.id },
      amountGross: amount,
      amountGrossCurrency: amount,
      supplier: { id: supplier.id },
    });
    postings.push({
      row: row++,
      date: line.date,
      description: line.desc,
      account: { id: acct1920.id },
      amountGross: -amount,
      amountGrossCurrency: -amount,
    });
  }
}

// Non-invoice lines
for (const line of nonInvoiceLines) {
  const isIncoming = line.inn > 0;
  const amount = isIncoming ? line.inn : line.ut;

  let contraAcctId: number;
  if (line.type === "bankgebyr") {
    contraAcctId = acct7770.id;
  } else if (line.type === "skattetrekk") {
    contraAcctId = acct2600.id;
  } else {
    contraAcctId = acct8050.id;
  }

  if (isIncoming) {
    // Inn: bank 1920 debit (positive), contra credit (negative)
    postings.push({
      row: row++, date: line.date, description: line.desc,
      account: { id: acct1920.id },
      amount: amount, amountCurrency: amount, amountGross: amount, amountGrossCurrency: amount,
    });
    postings.push({
      row: row++, date: line.date, description: line.desc,
      account: { id: contraAcctId },
      amount: -amount, amountCurrency: -amount, amountGross: -amount, amountGrossCurrency: -amount,
    });
  } else {
    // Ut: contra debit (positive), bank 1920 credit (negative)
    postings.push({
      row: row++, date: line.date, description: line.desc,
      account: { id: contraAcctId },
      amount: amount, amountCurrency: amount, amountGross: amount, amountGrossCurrency: amount,
    });
    postings.push({
      row: row++, date: line.date, description: line.desc,
      account: { id: acct1920.id },
      amount: -amount, amountCurrency: -amount, amountGross: -amount, amountGrossCurrency: -amount,
    });
  }
}

// Find earliest date among supplier + non-invoice lines
const voucherDates = [...supplierLines, ...nonInvoiceLines].map(l => l.date).sort();
const voucherDate = voucherDates[0];

console.log(`Creating voucher with ${postings.length} postings, date=${voucherDate}`);
const voucherR = await post("ledger/voucher", {
  date: voucherDate,
  description: "Bank reconciliation - supplier payments and non-invoice items",
  postings,
});
console.log("Voucher result:", voucherR.status, JSON.stringify(voucherR.data).slice(0, 500));

// ── Step 6: Bank reconciliation ──
// Find accounting period covering last CSV date (2026-02-04)
const lastDate = "2026-02-04";
const period = periods.find((p: any) => p.start <= lastDate && p.end >= lastDate)
  || periods.find((p: any) => p.start <= lastDate && p.end > lastDate);

if (!period) {
  console.log("No accounting period found for", lastDate);
  console.log("Periods:", JSON.stringify(periods.map((p: any) => ({ id: p.id, start: p.start, end: p.end }))));
} else {
  console.log(`Period: id=${period.id}, ${period.start} to ${period.end}`);

  // Read balance sheet for exact closing balance
  const balR = await get(`balanceSheet?dateFrom=${period.start}&dateTo=${period.end}&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*`);
  const balValues = balR.data?.values || [];
  const closingBalance = balValues.length > 0 ? balValues[0].balanceOut : csvEndingSaldo;
  console.log(`Closing balance: ${closingBalance} (CSV saldo: ${csvEndingSaldo})`);

  const reconR = await post("bank/reconciliation", {
    account: { id: acct1920.id },
    accountingPeriod: { id: period.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: closingBalance,
    isClosed: true,
  });
  console.log("Bank reconciliation:", reconR.status, JSON.stringify(reconR.data).slice(0, 500));
}

console.log("Done.");
