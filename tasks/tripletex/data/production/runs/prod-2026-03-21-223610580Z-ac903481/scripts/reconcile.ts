const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "NG8yXNNGjj1uAGPNEu-A8jLgMwi26EAj_OoifXbdofg";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}/${path}`, { headers: h });
  if (!r.ok) { const t = await r.text(); throw new Error(`GET ${path} → ${r.status}: ${t}`); }
  return (await r.json() as any);
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}/${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); throw new Error(`POST ${path} → ${r.status}: ${t}`); }
  return (await r.json() as any);
}
async function put(path: string) {
  const r = await fetch(`${BASE}/${path}`, { method: "PUT", headers: h });
  if (!r.ok) { const t = await r.text(); throw new Error(`PUT ${path} → ${r.status}: ${t}`); }
  return (await r.json() as any);
}

// CSV data parsed inline
const csvLines = [
  { date: "2026-01-16", desc: "Innbetaling fra Moe AS / Faktura 1001", inn: 4200.00, ut: 0, type: "customer", name: "Moe AS" },
  { date: "2026-01-19", desc: "Innbetaling fra Johansen AS / Faktura 1002", inn: 14500.00, ut: 0, type: "customer", name: "Johansen AS" },
  { date: "2026-01-22", desc: "Innbetaling fra Moe AS / Faktura 1003", inn: 5250.00, ut: 0, type: "customer", name: "Moe AS" },
  { date: "2026-01-25", desc: "Innbetaling fra Nilsen AS / Faktura 1004", inn: 13250.00, ut: 0, type: "customer", name: "Nilsen AS" },
  { date: "2026-01-27", desc: "Innbetaling fra Nilsen AS / Faktura 1005", inn: 16562.50, ut: 0, type: "customer", name: "Nilsen AS" },
  { date: "2026-01-29", desc: "Betaling Leverandor Ødegård AS", inn: 0, ut: 19650.00, type: "supplier", name: "Ødegård AS" },
  { date: "2026-01-30", desc: "Betaling Leverandor Moe AS", inn: 0, ut: 9950.00, type: "supplier", name: "Moe AS" },
  { date: "2026-01-31", desc: "Betaling Leverandor Hansen AS", inn: 0, ut: 18250.00, type: "supplier", name: "Hansen AS" },
  { date: "2026-02-01", desc: "Bankgebyr", inn: 0, ut: 1795.86, type: "bankgebyr" },
  { date: "2026-02-03", desc: "Bankgebyr", inn: 0, ut: 610.21, type: "bankgebyr" },
];

// Computed closing balance: sum(Inn) - sum(|Ut|)
const closingBalance = csvLines.reduce((s, l) => s + l.inn - l.ut, 0);
console.log("Computed closing balance:", closingBalance);

// Step 1: 6 parallel reads
const [invoicesRes, payTypesRes, suppliersRes, suppInvRes, accountsRes, periodsRes] = await Promise.all([
  get("invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
  get("invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
  get("supplier?count=1000&fields=*"),
  get("supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
  get("ledger/account?number=1920,2400,2600,7770,8050&fields=*"),
  get("ledger/accountingPeriod?startFrom=2026-02-01&startTo=2026-02-02&count=1&fields=*"),
]);

const invoices = invoicesRes.values;
const paymentTypes = payTypesRes.values;
const suppliers = suppliersRes.values;
const supplierInvoices = suppInvRes.values;
const accounts = accountsRes.values;
const period = periodsRes.values[0];

console.log(`Invoices: ${invoices.length}, PayTypes: ${paymentTypes.length}, Suppliers: ${suppliers.length}, SuppInv: ${supplierInvoices.length}, Accounts: ${accounts.length}, Period: ${period.id}`);

// Step 2: Find payment type with debitAccount.number === 1920
const payType = paymentTypes.find((pt: any) => pt.debitAccount?.number === 1920);
if (!payType) throw new Error("No payment type with debitAccount 1920");
console.log(`Payment type: ${payType.id} (${payType.description})`);

// Account IDs
const acct = (n: number) => {
  const a = accounts.find((a: any) => a.number === n);
  if (!a) throw new Error(`Account ${n} not found`);
  return a.id;
};
const acct1920 = acct(1920);
const acct2400 = acct(2400);
const acct7770 = acct(7770);

// Step 3: Match and pay customer invoices
// Build local outstanding tracker
const outstanding = new Map<number, number>();
for (const inv of invoices) {
  outstanding.set(inv.id, inv.amountCurrencyOutstanding ?? inv.amountOutstanding);
}

const customerLines = csvLines.filter(l => l.type === "customer");
for (const line of customerLines) {
  const custName = line.name.toLowerCase();
  // Find matching invoices by customer name
  const matching = invoices.filter((inv: any) =>
    inv.customer?.name?.toLowerCase().includes(custName) ||
    custName.includes(inv.customer?.name?.toLowerCase() ?? "")
  ).filter((inv: any) => (outstanding.get(inv.id) ?? 0) > 0.001);

  if (matching.length === 0) {
    console.log(`No matching invoice for ${line.name} ${line.inn}`);
    continue;
  }

  const bankAmount = line.inn;

  // Priority: exact outstanding match → smallest outstanding >= bankAmount → lowest invoiceNumber
  let chosen = matching.find((inv: any) => Math.abs((outstanding.get(inv.id) ?? 0) - bankAmount) < 0.01);
  if (!chosen) {
    const candidates = matching.filter((inv: any) => (outstanding.get(inv.id) ?? 0) >= bankAmount - 0.01);
    if (candidates.length > 0) {
      candidates.sort((a: any, b: any) => (outstanding.get(a.id) ?? 0) - (outstanding.get(b.id) ?? 0));
      chosen = candidates[0];
    } else {
      matching.sort((a: any, b: any) => a.invoiceNumber - b.invoiceNumber);
      chosen = matching[0];
    }
  }

  const paidAmount = Math.min(bankAmount, outstanding.get(chosen.id) ?? 0);
  console.log(`Paying invoice ${chosen.invoiceNumber} (${chosen.customer?.name}) ${paidAmount} on ${line.date}`);

  await put(`invoice/${chosen.id}/:payment?paymentDate=${line.date}&paymentTypeId=${payType.id}&paidAmount=${paidAmount}`);
  outstanding.set(chosen.id, (outstanding.get(chosen.id) ?? 0) - paidAmount);
}

// Step 4 + 5: Combined voucher for supplier payments + non-invoice lines
const supplierLines = csvLines.filter(l => l.type === "supplier");
const bankgebyrLines = csvLines.filter(l => l.type === "bankgebyr");

// Find earliest payment date for voucher
const allVoucherDates = [...supplierLines, ...bankgebyrLines].map(l => l.date).sort();
const voucherDate = allVoucherDates[0];

const postings: any[] = [];
let row = 1;

// Supplier payments (no supplier invoices expected — combined voucher)
for (const line of supplierLines) {
  const suppName = line.name.toLowerCase();
  const supp = suppliers.find((s: any) =>
    s.name?.toLowerCase().includes(suppName) || suppName.includes(s.name?.toLowerCase() ?? "")
  );
  if (!supp) {
    console.log(`Supplier not found: ${line.name}`);
    continue;
  }
  const amount = line.ut;
  postings.push(
    { row: row++, date: line.date, account: { id: acct2400 }, amountGross: amount, amountGrossCurrency: amount, supplier: { id: supp.id } },
    { row: row++, date: line.date, account: { id: acct1920 }, amountGross: -amount, amountGrossCurrency: -amount },
  );
}

// Non-invoice lines: Bankgebyr → 7770
for (const line of bankgebyrLines) {
  const amount = line.ut; // positive value representing outgoing
  // Bankgebyr Ut: contra 7770 is debit (positive), bank 1920 is credit (negative)
  postings.push(
    { row: row++, date: line.date, description: "Bankgebyr", account: { id: acct7770 }, amount: amount, amountCurrency: amount, amountGross: amount, amountGrossCurrency: amount },
    { row: row++, date: line.date, description: "Bankgebyr", account: { id: acct1920 }, amount: -amount, amountCurrency: -amount, amountGross: -amount, amountGrossCurrency: -amount },
  );
}

console.log(`Creating voucher with ${postings.length} postings, date ${voucherDate}`);
const voucher = await post("ledger/voucher", {
  date: voucherDate,
  description: "Bank reconciliation - supplier payments",
  postings,
});
console.log(`Voucher created: ${voucher.value?.voucherNumber}`);

// Step 6: Bank reconciliation
console.log(`Creating bank reconciliation, period ${period.id}, balance ${closingBalance}`);
const recon = await post("bank/reconciliation", {
  account: { id: acct1920 },
  accountingPeriod: { id: period.id },
  type: "MANUAL",
  bankAccountClosingBalanceCurrency: closingBalance,
  isClosed: true,
});
console.log(`Bank reconciliation created: ${recon.value?.id}, closed: ${recon.value?.isClosed}`);

console.log("DONE");
