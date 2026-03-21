const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "S1zOjMpn-DkG9jS-0ALUb2tir-UMpGCJBVNNXtdI5W8";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) {
    console.error("  ERROR:", JSON.stringify(data).slice(0, 500));
    return null;
  }
  return data;
}

// Parse CSV
interface BankLine {
  date: string;
  description: string;
  inn: number;
  ut: number;
  type: "customer" | "supplier" | "skip";
  customerName?: string;
  supplierName?: string;
}

const csvText = await Bun.file("/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-171936100Z-8bf4760c/attachments/01-bankutskrift_nn_07.csv").text();
const lines = csvText.trim().split("\n").slice(1); // skip header

const bankLines: BankLine[] = lines.filter(l => l.trim()).map(l => {
  const [date, desc, inn, ut] = l.split(";");
  const innVal = inn ? parseFloat(inn) : 0;
  const utVal = ut ? parseFloat(ut) : 0;

  if (desc.startsWith("Innbetaling fra")) {
    const match = desc.match(/Innbetaling fra (.+?) \/ Faktura/);
    return { date, description: desc, inn: innVal, ut: 0, type: "customer" as const, customerName: match?.[1] };
  } else if (desc.startsWith("Betaling Leverandor")) {
    const match = desc.match(/Betaling Leverandor (.+)/);
    return { date, description: desc, inn: 0, ut: Math.abs(utVal), type: "supplier" as const, supplierName: match?.[1] };
  } else {
    return { date, description: desc, inn: innVal, ut: Math.abs(utVal), type: "skip" as const };
  }
});

const customerLines = bankLines.filter(l => l.type === "customer");
const supplierLines = bankLines.filter(l => l.type === "supplier");

console.log(`Parsed ${customerLines.length} customer lines, ${supplierLines.length} supplier lines, ${bankLines.filter(l => l.type === "skip").length} skipped`);

// Step 1-4: Parallel reads
const [invoiceRes, paymentTypeRes, supplierRes, supplierInvoiceRes] = await Promise.all([
  api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
  api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
  api("GET", "/supplier?count=1000&fields=*"),
  api("GET", "/supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
]);

if (!invoiceRes || !paymentTypeRes) {
  console.error("BLOCKED: cannot read invoices or payment types");
  process.exit(1);
}

// Resolve payment type (prefer debitAccount 1920)
const paymentTypes = paymentTypeRes.values || [];
let paymentTypeId: number | null = null;
for (const pt of paymentTypes) {
  if (pt.debitAccount?.number === 1920) {
    paymentTypeId = pt.id;
    break;
  }
}
if (!paymentTypeId && paymentTypes.length > 0) paymentTypeId = paymentTypes[0].id;
console.log(`Payment type id: ${paymentTypeId}`);

// Build invoice list with mutable outstanding tracking
const invoices = (invoiceRes.values || []).map((inv: any) => ({
  id: inv.id,
  invoiceNumber: inv.invoiceNumber,
  customerName: inv.customer?.name || "",
  outstanding: inv.amountOutstanding ?? inv.amountCurrencyOutstanding ?? 0,
  amount: inv.amount,
}));

console.log(`Found ${invoices.length} invoices`);
for (const inv of invoices) {
  console.log(`  Invoice ${inv.invoiceNumber}: ${inv.customerName}, outstanding=${inv.outstanding}`);
}

// Match and register customer payments
for (const cl of customerLines) {
  const name = cl.customerName?.toLowerCase() || "";
  // Find matching invoices by customer name with positive outstanding
  const candidates = invoices.filter((inv: any) =>
    inv.outstanding > 0 && inv.customerName.toLowerCase().includes(name)
  );

  if (candidates.length === 0) {
    console.log(`NO MATCH for customer line: ${cl.description}`);
    continue;
  }

  // Prefer exact outstanding match, then smallest outstanding >= bankAmount, then lowest invoiceNumber
  let match = candidates.find((c: any) => Math.abs(c.outstanding - cl.inn) < 0.01);
  if (!match) {
    const eligible = candidates.filter((c: any) => c.outstanding >= cl.inn).sort((a: any, b: any) => a.outstanding - b.outstanding);
    match = eligible[0] || candidates.sort((a: any, b: any) => a.invoiceNumber - b.invoiceNumber)[0];
  }

  const paidAmount = Math.min(cl.inn, match.outstanding);
  console.log(`Matching "${cl.description}" -> invoice ${match.id} (${match.customerName}, outstanding=${match.outstanding}), paying ${paidAmount}`);

  const payRes = await api("PUT", `/invoice/${match.id}/:payment?paymentDate=${cl.date}&paymentTypeId=${paymentTypeId}&paidAmount=${paidAmount}`);
  if (payRes) {
    match.outstanding -= paidAmount;
    console.log(`  Payment OK, remaining outstanding: ${match.outstanding}`);
  }
}

// Handle supplier payments
const hasSupplierInvoices = supplierInvoiceRes && (supplierInvoiceRes.values || []).length > 0;
const suppliers = supplierRes?.values || [];

console.log(`Found ${suppliers.length} suppliers, ${hasSupplierInvoices ? "has" : "no"} supplier invoices`);

if (hasSupplierInvoices) {
  // Use supplierInvoice/:addPayment path
  const supInvoices = supplierInvoiceRes.values;
  const paymentTypeOutRes = await api("GET", "/ledger/paymentTypeOut?count=1000&fields=*,creditAccount(*)");
  const outTypes = paymentTypeOutRes?.values || [];
  let outPaymentTypeId: number | null = null;
  for (const pt of outTypes) {
    if (pt.creditAccount?.number === 1920) {
      outPaymentTypeId = pt.id;
      break;
    }
  }
  if (!outPaymentTypeId && outTypes.length > 0) outPaymentTypeId = outTypes[0].id;

  for (const sl of supplierLines) {
    const name = sl.supplierName?.toLowerCase() || "";
    const candidates = supInvoices.filter((si: any) =>
      si.supplier?.name?.toLowerCase().includes(name) && (si.amountOutstanding ?? si.amountCurrencyOutstanding ?? 0) > 0
    );

    if (candidates.length === 0) {
      console.log(`NO SUPPLIER INVOICE MATCH for: ${sl.description}`);
      continue;
    }

    let match = candidates.find((c: any) => Math.abs((c.amountOutstanding ?? c.amountCurrencyOutstanding) - sl.ut) < 0.01);
    if (!match) match = candidates[0];

    const payAmount = Math.min(sl.ut, match.amountOutstanding ?? match.amountCurrencyOutstanding);
    console.log(`Matching supplier "${sl.description}" -> supInvoice ${match.id}, paying ${payAmount}`);

    await api("POST", `/supplierInvoice/${match.id}/:addPayment`, {
      paymentDate: sl.date,
      paymentTypeId: outPaymentTypeId,
      paidAmount: payAmount,
    });
  }
} else {
  // Manual voucher path: debit 2400, credit 1920
  const accountRes = await api("GET", "/ledger/account?number=2400,1920&fields=*");
  if (!accountRes) {
    console.error("BLOCKED: cannot resolve accounts 2400/1920");
    process.exit(1);
  }

  const accounts = accountRes.values || [];
  const acc2400 = accounts.find((a: any) => a.number === 2400);
  const acc1920 = accounts.find((a: any) => a.number === 1920);

  if (!acc2400 || !acc1920) {
    console.error("BLOCKED: accounts 2400 or 1920 not found");
    process.exit(1);
  }

  console.log(`Account 2400 id=${acc2400.id}, Account 1920 id=${acc1920.id}`);

  for (const sl of supplierLines) {
    const name = sl.supplierName?.toLowerCase() || "";
    const matchedSupplier = suppliers.find((s: any) => s.name?.toLowerCase().includes(name));

    if (!matchedSupplier) {
      console.log(`NO SUPPLIER MATCH for: ${sl.description}`);
      continue;
    }

    console.log(`Manual voucher for supplier "${sl.description}" -> supplier ${matchedSupplier.id} (${matchedSupplier.name}), amount ${sl.ut}`);

    const voucherRes = await api("POST", "/ledger/voucher", {
      date: sl.date,
      description: `Betaling ${matchedSupplier.name}`,
      postings: [
        {
          row: 1,
          date: sl.date,
          account: { id: acc2400.id },
          amountGross: sl.ut,
          amountGrossCurrency: sl.ut,
          supplier: { id: matchedSupplier.id },
        },
        {
          row: 2,
          date: sl.date,
          account: { id: acc1920.id },
          amountGross: -sl.ut,
          amountGrossCurrency: -sl.ut,
        },
      ],
    });

    if (voucherRes) {
      console.log(`  Voucher created: ${voucherRes.value?.id || JSON.stringify(voucherRes).slice(0, 200)}`);
    }
  }
}

console.log("DONE");
