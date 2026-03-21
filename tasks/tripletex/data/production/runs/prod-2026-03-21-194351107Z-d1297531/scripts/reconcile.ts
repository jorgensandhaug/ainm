const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "jMpTYJ-B0r_fa_tvxCq9_5yTdtpAag3filWZYZguVgQ";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) { console.log(text); throw new Error(`${r.status} ${path}`); }
  return JSON.parse(text);
}

// Bank statement lines
const customerLines = [
  { date: "2026-01-16", name: "Oliveira Lda", amount: 28375.00 },
  { date: "2026-01-17", name: "Silva Lda", amount: 8062.50 },
  { date: "2026-01-20", name: "Ferreira Lda", amount: 19875.00 },
  { date: "2026-01-21", name: "Sousa Lda", amount: 5675.00 },
  { date: "2026-01-23", name: "Oliveira Lda", amount: 5125.00 },
];

const supplierLines = [
  { date: "2026-01-24", name: "Martins Lda", amount: 6500.00 },
  { date: "2026-01-27", name: "Pereira Lda", amount: 13050.00 },
  { date: "2026-01-29", name: "Costa Lda", amount: 18900.00 },
];

// Step 1: 5 parallel reads
const [invoicesRes, paymentTypesRes, suppliersRes, supplierInvoicesRes, accountsRes] = await Promise.all([
  api("GET", "invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
  api("GET", "invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
  api("GET", "supplier?count=1000&fields=*"),
  api("GET", "supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
  api("GET", "ledger/account?number=2400,1920&fields=*"),
]);

const invoices = invoicesRes.values || [];
const paymentTypes = paymentTypesRes.values || [];
const suppliers = suppliersRes.values || [];
const supplierInvoices = supplierInvoicesRes.values || [];
const accounts = accountsRes.values || [];

console.log(`Invoices: ${invoices.length}, PaymentTypes: ${paymentTypes.length}, Suppliers: ${suppliers.length}, SupplierInvoices: ${supplierInvoices.length}, Accounts: ${accounts.length}`);

// Step 2: Find payment type with debitAccount.number === 1920
const paymentType = paymentTypes.find((pt: any) => pt.debitAccount?.number === 1920);
if (!paymentType) throw new Error("No payment type with debitAccount 1920");
console.log(`Payment type: ${paymentType.id} (${paymentType.description})`);

// Account IDs
const acc1920 = accounts.find((a: any) => a.number === 1920);
const acc2400 = accounts.find((a: any) => a.number === 2400);
if (!acc1920 || !acc2400) throw new Error(`Missing accounts: 1920=${acc1920?.id}, 2400=${acc2400?.id}`);
console.log(`Account 1920 id=${acc1920.id}, Account 2400 id=${acc2400.id}`);

// Step 3: Pay customer invoices
// Build outstanding tracker
const outstanding: Record<number, number> = {};
for (const inv of invoices) {
  outstanding[inv.id] = inv.amountOutstanding ?? inv.amount;
}

// Print invoices for debugging
for (const inv of invoices) {
  console.log(`Invoice ${inv.id}: customer=${inv.customer?.name}, amount=${inv.amount}, outstanding=${outstanding[inv.id]}`);
}

for (const line of customerLines) {
  // Find matching invoices by customer name (case-insensitive)
  const matching = invoices.filter((inv: any) => {
    const custName = (inv.customer?.name || "").toLowerCase();
    return custName.includes(line.name.toLowerCase()) && outstanding[inv.id] > 0;
  });

  if (matching.length === 0) {
    console.log(`WARNING: No matching invoice for ${line.name} ${line.amount}`);
    continue;
  }

  // Priority: exact outstanding match → smallest outstanding >= bankAmount → lowest invoiceNumber
  let best = matching.find((inv: any) => Math.abs(outstanding[inv.id] - line.amount) < 0.01);
  if (!best) {
    const candidates = matching.filter((inv: any) => outstanding[inv.id] >= line.amount);
    if (candidates.length > 0) {
      candidates.sort((a: any, b: any) => outstanding[a.id] - outstanding[b.id]);
      best = candidates[0];
    } else {
      // Fallback: lowest invoice number
      matching.sort((a: any, b: any) => (a.invoiceNumber || 0) - (b.invoiceNumber || 0));
      best = matching[0];
    }
  }

  const paidAmount = Math.min(line.amount, outstanding[best.id]);
  console.log(`Paying invoice ${best.id} (customer=${best.customer?.name}, outstanding=${outstanding[best.id]}) with ${paidAmount} on ${line.date}`);

  await api("PUT", `invoice/${best.id}/:payment?paymentDate=${line.date}&paymentTypeId=${paymentType.id}&paidAmount=${paidAmount}`);
  outstanding[best.id] -= paidAmount;
}

// Step 4: Handle supplier payments
if (supplierInvoices.length > 0) {
  // Need payment type for outgoing
  const paymentTypeOutRes = await api("GET", "ledger/paymentTypeOut?count=1000&fields=*");
  const paymentTypesOut = paymentTypeOutRes.values || [];

  for (const line of supplierLines) {
    const matchingSI = supplierInvoices.filter((si: any) => {
      const suppName = (si.supplier?.name || "").toLowerCase();
      return suppName.includes(line.name.toLowerCase());
    });

    if (matchingSI.length === 0) {
      console.log(`WARNING: No matching supplier invoice for ${line.name}`);
      continue;
    }

    // Find best match by amount
    const best = matchingSI[0]; // simplify - take first
    console.log(`Paying supplier invoice ${best.id} for ${line.name} with ${line.amount}`);
    // Use addPayment
    const ptOut = paymentTypesOut.find((pt: any) => pt.creditAccount?.number === 1920) || paymentTypesOut[0];
    await api("POST", `supplierInvoice/${best.id}/:addPayment`, {
      paymentDate: line.date,
      paymentTypeId: ptOut.id,
      paidAmount: line.amount,
    });
  }
} else {
  // No supplier invoices — combine all into ONE voucher
  console.log("No supplier invoices found — creating combined voucher");

  const postings: any[] = [];
  let row = 1;
  for (const line of supplierLines) {
    // Find supplier by name
    const supplier = suppliers.find((s: any) => {
      const sName = (s.name || "").toLowerCase();
      return sName.includes(line.name.toLowerCase());
    });

    if (!supplier) {
      console.log(`WARNING: No supplier found for ${line.name}`);
      continue;
    }

    postings.push({
      row: row,
      date: line.date,
      account: { id: acc2400.id },
      amountGross: line.amount,
      amountGrossCurrency: line.amount,
      supplier: { id: supplier.id },
    });
    postings.push({
      row: row + 1,
      date: line.date,
      account: { id: acc1920.id },
      amountGross: -line.amount,
      amountGrossCurrency: -line.amount,
    });
    row += 2;
  }

  const earliestDate = supplierLines[0].date;
  const voucher = {
    date: earliestDate,
    description: "Bank reconciliation - supplier payments",
    postings,
  };

  console.log("Creating voucher:", JSON.stringify(voucher, null, 2));
  await api("POST", "ledger/voucher", voucher);
}

console.log("DONE");
