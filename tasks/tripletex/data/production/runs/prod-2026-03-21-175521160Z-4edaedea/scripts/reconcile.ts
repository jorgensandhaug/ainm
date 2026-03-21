const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "lqQEk3RqxkNLPwJSbfN2eWanAjffzDblX17qXH3y874";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) {
    console.log("  ERROR:", JSON.stringify(json).slice(0, 300));
    return null;
  }
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

// Parse bank CSV
const csv = await Bun.file("/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-175521160Z-4edaedea/attachments/01-bankutskrift_en_04.csv").text();
const lines = csv.trim().split("\n").slice(1); // skip header

interface BankLine {
  date: string;
  desc: string;
  inn: number | null;
  ut: number | null;
}

const bankLines: BankLine[] = lines.map(l => {
  const [date, desc, inn, ut] = l.split(";");
  return {
    date: date.trim(),
    desc: desc.trim(),
    inn: inn?.trim() ? parseFloat(inn.trim()) : null,
    ut: ut?.trim() ? parseFloat(ut.trim()) : null,
  };
});

// Classify lines
const customerLines = bankLines.filter(l => l.inn !== null && l.desc.toLowerCase().includes("innbetaling fra"));
const supplierLines = bankLines.filter(l => l.ut !== null && l.desc.toLowerCase().includes("betaling supplier"));
// Non-invoice lines (Bankgebyr, Skattetrekk) are skipped

console.log(`Customer lines: ${customerLines.length}, Supplier lines: ${supplierLines.length}`);

// Fire all 5 reads in parallel
const [invoices, paymentTypes, suppliers, supplierInvoices, accounts] = await Promise.all([
  api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
  api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
  api("GET", "/supplier?count=1000&fields=*"),
  api("GET", "/supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
  api("GET", "/ledger/account?number=2400,1920&fields=*"),
]);

if (!invoices || !paymentTypes) {
  console.log("BLOCKED: could not fetch invoices or payment types");
  process.exit(1);
}

// Find payment type with debit account 1920
const payType = paymentTypes.find((pt: any) => pt.debitAccount?.number === 1920);
if (!payType) {
  console.log("No payment type with debit account 1920, trying any");
  console.log("Available:", JSON.stringify(paymentTypes.map((pt: any) => ({ id: pt.id, desc: pt.description, debit: pt.debitAccount?.number }))));
}
const paymentTypeId = payType?.id || paymentTypes[0]?.id;
console.log(`Payment type: ${paymentTypeId} (debit ${payType?.debitAccount?.number})`);

// Build working copy of invoices with mutable outstanding
const openInvoices = invoices
  .filter((inv: any) => inv.amountOutstanding > 0 || inv.amountCurrencyOutstanding > 0)
  .map((inv: any) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    customerName: inv.customer?.name || "",
    outstanding: inv.amountCurrencyOutstanding ?? inv.amountOutstanding,
    amount: inv.amount,
  }));

console.log(`Open invoices: ${openInvoices.length}`);
openInvoices.forEach((inv: any) => console.log(`  #${inv.invoiceNumber} ${inv.customerName} outstanding=${inv.outstanding}`));

// Match and pay customer invoices
for (const cl of customerLines) {
  // Extract customer name from desc: "Innbetaling fra <Name> / Faktura XXXX"
  const nameMatch = cl.desc.match(/innbetaling fra (.+?)\s*\/\s*faktura/i);
  const custName = nameMatch ? nameMatch[1].trim().toLowerCase() : "";
  const bankAmount = cl.inn!;

  // Find matching invoices by customer name
  const candidates = openInvoices.filter((inv: any) =>
    inv.customerName.toLowerCase().includes(custName) || custName.includes(inv.customerName.toLowerCase())
  );

  if (candidates.length === 0) {
    console.log(`  NO MATCH for "${cl.desc}" amount=${bankAmount}`);
    continue;
  }

  // Try exact outstanding match first
  let match = candidates.find((inv: any) => Math.abs(inv.outstanding - bankAmount) < 0.01);
  if (!match) {
    // Smallest outstanding >= bankAmount
    const eligible = candidates.filter((inv: any) => inv.outstanding >= bankAmount - 0.01);
    eligible.sort((a: any, b: any) => a.outstanding - b.outstanding);
    match = eligible[0] || candidates.sort((a: any, b: any) => a.invoiceNumber - b.invoiceNumber)[0];
  }

  if (!match) {
    console.log(`  NO MATCH for "${cl.desc}" amount=${bankAmount}`);
    continue;
  }

  const payAmount = Math.min(bankAmount, match.outstanding);
  console.log(`  Paying invoice #${match.invoiceNumber} (${match.customerName}): ${payAmount} of ${match.outstanding}`);

  const result = await api("PUT", `/invoice/${match.id}/:payment?paymentDate=${cl.date}&paymentTypeId=${paymentTypeId}&paidAmount=${payAmount}`, undefined);
  if (result) {
    match.outstanding -= payAmount;
    console.log(`  OK, remaining outstanding: ${match.outstanding}`);
  }
}

// Supplier side
const hasSupplierInvoices = supplierInvoices && supplierInvoices.length > 0;
console.log(`\nSupplier invoices found: ${hasSupplierInvoices ? supplierInvoices.length : 0}`);

if (supplierLines.length > 0) {
  if (hasSupplierInvoices) {
    // Use :addPayment on supplier invoices
    // First get outgoing payment types
    const payTypesOut = await api("GET", "/ledger/paymentTypeOut?count=1000&fields=*,creditAccount(*)");
    const outPayType = payTypesOut?.find((pt: any) => pt.creditAccount?.number === 1920) || payTypesOut?.[0];

    for (const sl of supplierLines) {
      const nameMatch = sl.desc.match(/betaling supplier (.+)/i);
      const suppName = nameMatch ? nameMatch[1].trim().toLowerCase() : "";
      const payAmount = Math.abs(sl.ut!);

      const matchedSI = supplierInvoices.find((si: any) =>
        si.supplier?.name?.toLowerCase().includes(suppName) &&
        Math.abs((si.amountCurrencyOutstanding ?? si.amountOutstanding) - payAmount) < 0.01
      );

      if (matchedSI) {
        await api("POST", `/supplierInvoice/${matchedSI.id}/:addPayment`, {
          paymentDate: sl.date,
          paymentTypeId: outPayType?.id,
          paidAmount: payAmount,
        });
      }
    }
  } else {
    // Manual voucher path - combine all supplier payments into one voucher
    if (!accounts || accounts.length === 0) {
      console.log("BLOCKED: could not fetch accounts");
      process.exit(1);
    }

    const acc2400 = accounts.find((a: any) => a.number === 2400);
    const acc1920 = accounts.find((a: any) => a.number === 1920);

    if (!acc2400 || !acc1920) {
      console.log("BLOCKED: missing account 2400 or 1920");
      console.log("Accounts:", JSON.stringify(accounts.map((a: any) => ({ id: a.id, number: a.number }))));
      process.exit(1);
    }

    // Resolve supplier IDs
    const supplierList = suppliers || [];
    const postings: any[] = [];
    let row = 1;
    let earliestDate = "9999-12-31";

    for (const sl of supplierLines) {
      const nameMatch = sl.desc.match(/betaling supplier (.+)/i);
      const suppName = nameMatch ? nameMatch[1].trim().toLowerCase() : "";
      const payAmount = Math.abs(sl.ut!);

      const matchedSupplier = supplierList.find((s: any) =>
        s.name?.toLowerCase().includes(suppName) || suppName.includes(s.name?.toLowerCase())
      );

      if (!matchedSupplier) {
        console.log(`  NO SUPPLIER MATCH for "${sl.desc}"`);
        continue;
      }

      if (sl.date < earliestDate) earliestDate = sl.date;

      console.log(`  Supplier payment: ${matchedSupplier.name} ${payAmount} on ${sl.date}`);

      // Debit 2400 (reduce liability)
      postings.push({
        row: row++,
        date: sl.date,
        account: { id: acc2400.id },
        amountGross: payAmount,
        amountGrossCurrency: payAmount,
        supplier: { id: matchedSupplier.id },
      });
      // Credit 1920 (bank)
      postings.push({
        row: row++,
        date: sl.date,
        account: { id: acc1920.id },
        amountGross: -payAmount,
        amountGrossCurrency: -payAmount,
      });
    }

    if (postings.length > 0) {
      const voucherBody = {
        date: earliestDate,
        description: "Bank reconciliation - supplier payments",
        postings,
      };
      console.log(`\nCreating combined supplier voucher with ${postings.length} postings...`);
      const result = await api("POST", "/ledger/voucher", voucherBody);
      if (result) {
        console.log(`  Voucher created: id=${Array.isArray(result) ? result[0]?.id : result?.id}`);
      }
    }
  }
}

console.log("\nDone.");
