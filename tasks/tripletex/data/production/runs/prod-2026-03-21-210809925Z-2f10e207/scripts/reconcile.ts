const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "jVB4WlsKb1mtp4ib1M6qBAD1X4OovTeZt66YUqdj1dU";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) {
    console.error(`${method} /${path} → ${r.status}: ${text}`);
    throw new Error(`${method} /${path} → ${r.status}`);
  }
  return JSON.parse(text);
}

// ── Step 1: 5 parallel reads ──
const [invR, ptR, supR, siR, accR] = await Promise.all([
  api("GET", "invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
  api("GET", "invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
  api("GET", "supplier?count=1000&fields=*"),
  api("GET", "supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
  api("GET", "ledger/account?number=1920,2400,2600,7770,8050&fields=*"),
]);

const invoices: any[] = invR.values;
const payTypes: any[] = ptR.values;
const suppliers: any[] = supR.values;
const supplierInvoices: any[] = siR.values;
const accounts: any[] = accR.values;

console.log(`Invoices=${invoices.length} Suppliers=${suppliers.length} SupplierInv=${supplierInvoices.length} Accounts=${accounts.length}`);

// ── Step 2: Payment type with debitAccount 1920 ──
const payType = payTypes.find(p => p.debitAccount?.number === 1920);
if (!payType) throw new Error("No payment type with debitAccount 1920");
console.log(`PayType: ${payType.id}`);

const acctId = (n: number) => {
  const a = accounts.find(a => a.number === n);
  if (!a) throw new Error(`Account ${n} not found`);
  return a.id;
};

// Log invoices for debugging
for (const i of invoices) {
  console.log(`  Inv ${i.id}: ${i.customer?.name} outstanding=${i.amountCurrencyOutstanding ?? i.amountOutstanding}`);
}
for (const s of suppliers) {
  console.log(`  Sup ${s.id}: ${s.name}`);
}

// ── Step 3: Pay customer invoices ──
const outstanding = new Map<number, number>();
for (const i of invoices) outstanding.set(i.id, i.amountCurrencyOutstanding ?? i.amountOutstanding ?? 0);

const custPayments = [
  { date: "2026-01-18", name: "Stølsvik", amount: 9625.00 },
  { date: "2026-01-21", name: "Brekke",   amount: 7687.50 },
  { date: "2026-01-23", name: "Aasen",    amount: 6500.00 },
  { date: "2026-01-24", name: "Lunde",    amount: 14125.00 },
  { date: "2026-01-25", name: "Vik",      amount: 15000.00 },
];

for (const cp of custPayments) {
  const mn = cp.name.toLowerCase();
  const cands = invoices.filter(i => {
    const cn = (i.customer?.name || "").toLowerCase();
    return cn.includes(mn) && (outstanding.get(i.id) || 0) > 0.001;
  });

  if (!cands.length) { console.error(`No open invoice for ${cp.name}`); continue; }

  // exact outstanding → smallest outstanding >= amount → lowest invoiceNumber
  let chosen = cands.find(i => Math.abs((outstanding.get(i.id)! ) - cp.amount) < 0.01);
  if (!chosen) {
    const fits = cands.filter(i => (outstanding.get(i.id)!) >= cp.amount - 0.01);
    fits.sort((a, b) => outstanding.get(a.id)! - outstanding.get(b.id)!);
    chosen = fits.length ? fits[0] : cands.sort((a, b) => a.invoiceNumber - b.invoiceNumber)[0];
  }

  const paid = Math.min(cp.amount, outstanding.get(chosen.id)!);
  console.log(`→ Pay inv ${chosen.id} (${chosen.customer?.name}) ${paid} on ${cp.date}`);
  await api("PUT", `invoice/${chosen.id}/:payment?paymentDate=${cp.date}&paymentTypeId=${payType.id}&paidAmount=${paid}`);
  outstanding.set(chosen.id, outstanding.get(chosen.id)! - paid);
}

// ── Step 4+5: Supplier payments + non-invoice lines → combined voucher ──
const supplierPays = [
  { date: "2026-01-27", name: "Brekke", amount: 11500.00 },
  { date: "2026-01-30", name: "Aasen",  amount: 6400.00 },
  { date: "2026-02-01", name: "Eide",   amount: 6200.00 },
];

const nonInvLines = [
  { date: "2026-02-02", desc: "Renteinntekter", amount: 1282.21, contra: 8050 },
  { date: "2026-02-03", desc: "Renteinntekter", amount: 1910.48, contra: 8050 },
];

if (supplierInvoices.length === 0) {
  // Common case: combine ALL into ONE voucher
  const postings: any[] = [];
  let row = 1;

  for (const sp of supplierPays) {
    const supplier = suppliers.find(s => (s.name || "").toLowerCase().includes(sp.name.toLowerCase()));
    if (!supplier) { console.error(`Supplier not found: ${sp.name}`); continue; }
    console.log(`→ Supplier: ${supplier.name} (${supplier.id}) ${sp.amount} on ${sp.date}`);
    postings.push({
      row: row++, date: sp.date,
      account: { id: acctId(2400) },
      amountGross: sp.amount, amountGrossCurrency: sp.amount,
      supplier: { id: supplier.id },
    });
    postings.push({
      row: row++, date: sp.date,
      account: { id: acctId(1920) },
      amountGross: -sp.amount, amountGrossCurrency: -sp.amount,
    });
  }

  // Non-invoice lines (Renteinntekter in Ut → contra debit, bank credit)
  for (const ni of nonInvLines) {
    console.log(`→ Non-inv: ${ni.desc} ${ni.amount} on ${ni.date}`);
    postings.push({
      row: row++, date: ni.date, description: ni.desc,
      account: { id: acctId(ni.contra) },
      amount: ni.amount, amountCurrency: ni.amount,
      amountGross: ni.amount, amountGrossCurrency: ni.amount,
    });
    postings.push({
      row: row++, date: ni.date, description: ni.desc,
      account: { id: acctId(1920) },
      amount: -ni.amount, amountCurrency: -ni.amount,
      amountGross: -ni.amount, amountGrossCurrency: -ni.amount,
    });
  }

  const earliestDate = [...supplierPays, ...nonInvLines].map(l => l.date).sort()[0];
  const voucher = { date: earliestDate, description: "Bank reconciliation - supplier payments", postings };

  console.log(`Creating voucher: ${postings.length} postings, date=${earliestDate}`);
  const res = await api("POST", "ledger/voucher", voucher);
  console.log(`Voucher created: id=${res.value?.id}`);
} else {
  // Supplier invoices exist → addPayment path + extra read
  console.log("Supplier invoices found — using addPayment path");
  const ptoR = await api("GET", "ledger/paymentTypeOut?count=1000&fields=*,creditAccount(*)");
  const pto = ptoR.values.find((p: any) => p.creditAccount?.number === 1920);
  if (!pto) throw new Error("No outgoing payment type with creditAccount 1920");

  for (const sp of supplierPays) {
    const mn = sp.name.toLowerCase();
    const si = supplierInvoices.find((s: any) => (s.supplier?.name || "").toLowerCase().includes(mn));
    if (!si) { console.error(`No supplier invoice for ${sp.name}`); continue; }
    console.log(`→ SupplierInv payment: ${si.id} ${sp.amount} on ${sp.date}`);
    await api("POST", `supplierInvoice/${si.id}/:addPayment`, {
      paymentDate: sp.date, paymentType: { id: pto.id }, amount: sp.amount,
    });
  }

  // Non-invoice lines in separate voucher
  if (nonInvLines.length) {
    const postings: any[] = [];
    let row = 1;
    for (const ni of nonInvLines) {
      postings.push({
        row: row++, date: ni.date, description: ni.desc,
        account: { id: acctId(ni.contra) },
        amount: ni.amount, amountCurrency: ni.amount,
        amountGross: ni.amount, amountGrossCurrency: ni.amount,
      });
      postings.push({
        row: row++, date: ni.date, description: ni.desc,
        account: { id: acctId(1920) },
        amount: -ni.amount, amountCurrency: -ni.amount,
        amountGross: -ni.amount, amountGrossCurrency: -ni.amount,
      });
    }
    const vRes = await api("POST", "ledger/voucher", { date: nonInvLines[0].date, description: "Bank reconciliation - non-invoice items", postings });
    console.log(`Non-inv voucher: id=${vRes.value?.id}`);
  }
}

console.log("✓ Reconciliation complete");
