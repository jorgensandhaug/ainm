const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "AWOUBnPp46g53aKaKWcnfWwccRTLb8wuTQHvHGuQi2I";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  console.log("GET", url);
  const r = await fetch(url, { headers });
  console.log("  ->", r.status);
  const j = await r.json();
  if (!r.ok) { console.error("  ERROR:", JSON.stringify(j)); throw new Error(`GET ${path} failed: ${r.status}`); }
  return j;
}

async function put(path: string) {
  const url = `${BASE}/${path}`;
  console.log("PUT", url);
  const r = await fetch(url, { method: "PUT", headers });
  console.log("  ->", r.status);
  const j = await r.json();
  if (!r.ok) { console.error("  ERROR:", JSON.stringify(j)); throw new Error(`PUT ${path} failed: ${r.status}`); }
  return j;
}

async function post(path: string, body: any) {
  const url = `${BASE}/${path}`;
  console.log("POST", url);
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  console.log("  ->", r.status);
  const j = await r.json();
  if (!r.ok) { console.error("  ERROR:", JSON.stringify(j)); throw new Error(`POST ${path} failed: ${r.status}`); }
  return j;
}

// ─── CSV data (parsed from attachment) ───
const customerLines = [
  { date: "2026-01-18", name: "Costa Lda",     amount: 11300.00 },
  { date: "2026-01-20", name: "Martins Lda",   amount: 18437.50 },
  { date: "2026-01-21", name: "Santos Lda",    amount: 22375.00 },
  { date: "2026-01-23", name: "Santos Lda",    amount: 9187.50  },
  { date: "2026-01-24", name: "Rodrigues Lda", amount: 30437.50 },
];

const supplierLines = [
  { date: "2026-01-25", name: "Pereira Lda",  amount: 13100.00 },
  { date: "2026-01-26", name: "Ferreira Lda", amount: 12150.00 },
  { date: "2026-01-28", name: "Pereira Lda",  amount: 6550.00  },
];

// Non-invoice lines:
// Bankgebyr 1634.39 Inn (+) → fee refund: 1920 debit, 7770 credit
// Skattetrekk 318.44 Ut (-) → tax withholding: 2600 debit, 1920 credit
// Renteinntekter 95.14 Inn (+) → interest income: 1920 debit, 8050 credit
const nonInvoiceLines = [
  { date: "2026-01-30", desc: "Bankgebyr",       amount: 1634.39, direction: "inn",  contraAcct: 7770 },
  { date: "2026-01-31", desc: "Skattetrekk",     amount: 318.44,  direction: "ut",   contraAcct: 2600 },
  { date: "2026-02-01", desc: "Renteinntekter",  amount: 95.14,   direction: "inn",  contraAcct: 8050 },
];

async function main() {
  // Step 1: 5 parallel reads
  const [invoicesRes, paymentTypesRes, suppliersRes, supplierInvoicesRes, accountsRes] = await Promise.all([
    get("invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
    get("invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
    get("supplier?count=1000&fields=*"),
    get("supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
    get("ledger/account?number=1920,2400,2600,7770,8050&fields=*"),
  ]);

  const invoices = invoicesRes.values || [];
  const paymentTypes = paymentTypesRes.values || [];
  const suppliers = suppliersRes.values || [];
  const supplierInvoices = supplierInvoicesRes.values || [];
  const accounts = accountsRes.values || [];

  console.log(`\nLoaded: ${invoices.length} invoices, ${paymentTypes.length} paymentTypes, ${suppliers.length} suppliers, ${supplierInvoices.length} supplierInvoices, ${accounts.length} accounts`);

  // Step 2: Select payment type with debitAccount.number === 1920
  const paymentType = paymentTypes.find((pt: any) => pt.debitAccount?.number === 1920);
  if (!paymentType) throw new Error("No payment type with debitAccount 1920 found");
  console.log(`Payment type: id=${paymentType.id}, description=${paymentType.description}`);

  // Build account ID map
  const acctMap: Record<number, number> = {};
  for (const a of accounts) {
    acctMap[a.number] = a.id;
    console.log(`Account ${a.number} -> id ${a.id}`);
  }

  // Build outstanding tracker from invoices
  const outstandingMap: Record<number, number> = {};
  for (const inv of invoices) {
    outstandingMap[inv.id] = inv.amountCurrencyOutstanding ?? inv.amountOutstanding ?? 0;
  }

  // Step 3: Match and pay customer invoices
  console.log("\n=== Customer invoice payments ===");
  for (const line of customerLines) {
    const nameLower = line.name.toLowerCase();
    // Find matching invoices for this customer
    const matching = invoices.filter((inv: any) => {
      const custName = (inv.customer?.name || "").toLowerCase();
      return custName.includes(nameLower) || nameLower.includes(custName);
    });

    if (matching.length === 0) {
      console.log(`WARNING: No invoices found for customer "${line.name}"`);
      continue;
    }

    // Filter to those with outstanding > 0
    const open = matching.filter((inv: any) => (outstandingMap[inv.id] || 0) > 0.01);
    if (open.length === 0) {
      console.log(`WARNING: No open invoices for "${line.name}"`);
      continue;
    }

    // Priority: exact outstanding match → smallest outstanding >= bankAmount → lowest invoiceNumber
    let chosen: any = null;
    const exactMatch = open.find((inv: any) => Math.abs((outstandingMap[inv.id] || 0) - line.amount) < 0.01);
    if (exactMatch) {
      chosen = exactMatch;
    } else {
      const largeEnough = open.filter((inv: any) => (outstandingMap[inv.id] || 0) >= line.amount - 0.01);
      if (largeEnough.length > 0) {
        largeEnough.sort((a: any, b: any) => (outstandingMap[a.id] || 0) - (outstandingMap[b.id] || 0));
        chosen = largeEnough[0];
      } else {
        // Partial: pick lowest invoice number
        open.sort((a: any, b: any) => (a.invoiceNumber || 0) - (b.invoiceNumber || 0));
        chosen = open[0];
      }
    }

    const outstanding = outstandingMap[chosen.id] || 0;
    const payAmount = Math.min(line.amount, outstanding);
    console.log(`Paying invoice id=${chosen.id} (inv#${chosen.invoiceNumber}) for "${line.name}": ${payAmount} (outstanding was ${outstanding})`);

    await put(`invoice/${chosen.id}/:payment?paymentDate=${line.date}&paymentTypeId=${paymentType.id}&paidAmount=${payAmount}`);
    outstandingMap[chosen.id] = outstanding - payAmount;
  }

  // Step 4+5: Combined voucher for supplier payments + non-invoice lines
  console.log("\n=== Building combined voucher ===");

  const postings: any[] = [];
  let rowNum = 1;
  const earliestDate = supplierLines[0]?.date || nonInvoiceLines[0]?.date;

  // Supplier payments (no supplier invoices case - use manual voucher)
  if (supplierInvoices.length === 0) {
    console.log("No supplier invoices found — using manual voucher for supplier payments");
    for (const line of supplierLines) {
      const nameLower = line.name.toLowerCase();
      const supplier = suppliers.find((s: any) => (s.name || "").toLowerCase().includes(nameLower) || nameLower.includes((s.name || "").toLowerCase()));
      if (!supplier) {
        console.log(`WARNING: No supplier found for "${line.name}"`);
        continue;
      }
      console.log(`Supplier "${line.name}" -> id=${supplier.id}`);

      // Debit 2400 (supplier account), Credit 1920 (bank)
      postings.push({
        row: rowNum++,
        date: line.date,
        description: `Betaling ${supplier.name}`,
        account: { id: acctMap[2400] },
        amountGross: line.amount,
        amountGrossCurrency: line.amount,
        supplier: { id: supplier.id },
      });
      postings.push({
        row: rowNum++,
        date: line.date,
        description: `Betaling ${supplier.name}`,
        account: { id: acctMap[1920] },
        amountGross: -line.amount,
        amountGrossCurrency: -line.amount,
      });
    }
  } else {
    // Has supplier invoices - use :addPayment
    console.log(`Found ${supplierInvoices.length} supplier invoices — using :addPayment`);
    // Need payment type out
    const paymentTypesOutRes = await get("ledger/paymentTypeOut?count=1000&fields=*,creditAccount(*)");
    const paymentTypesOut = paymentTypesOutRes.values || [];
    const paymentTypeOut = paymentTypesOut.find((pt: any) => pt.creditAccount?.number === 1920);
    if (!paymentTypeOut) throw new Error("No outgoing payment type with creditAccount 1920 found");

    for (const line of supplierLines) {
      const nameLower = line.name.toLowerCase();
      // Find supplier invoices for this supplier
      const matching = supplierInvoices.filter((si: any) => {
        const suppName = (si.supplier?.name || "").toLowerCase();
        return suppName.includes(nameLower) || nameLower.includes(suppName);
      });
      const open = matching.filter((si: any) => (si.amountOutstanding ?? 0) > 0.01);
      if (open.length === 0) {
        console.log(`WARNING: No open supplier invoices for "${line.name}"`);
        continue;
      }
      // Pick best match (exact → smallest >= amount → lowest id)
      let chosen: any = null;
      const exact = open.find((si: any) => Math.abs((si.amountOutstanding ?? 0) - line.amount) < 0.01);
      if (exact) chosen = exact;
      else {
        const large = open.filter((si: any) => (si.amountOutstanding ?? 0) >= line.amount - 0.01);
        if (large.length > 0) { large.sort((a: any, b: any) => (a.amountOutstanding ?? 0) - (b.amountOutstanding ?? 0)); chosen = large[0]; }
        else { open.sort((a: any, b: any) => a.id - b.id); chosen = open[0]; }
      }
      const payAmt = Math.min(line.amount, chosen.amountOutstanding ?? line.amount);
      console.log(`Paying supplier invoice id=${chosen.id} for "${line.name}": ${payAmt}`);
      await post(`supplierInvoice/${chosen.id}/:addPayment`, {
        paymentDate: line.date,
        paymentTypeId: paymentTypeOut.id,
        paidAmount: payAmt,
      });
    }
  }

  // Non-invoice lines
  for (const line of nonInvoiceLines) {
    if (line.direction === "inn") {
      // Bank 1920 debit (positive), contra credit (negative)
      postings.push({
        row: rowNum++,
        date: line.date,
        description: line.desc,
        account: { id: acctMap[1920] },
        amount: line.amount, amountCurrency: line.amount,
        amountGross: line.amount, amountGrossCurrency: line.amount,
      });
      postings.push({
        row: rowNum++,
        date: line.date,
        description: line.desc,
        account: { id: acctMap[line.contraAcct] },
        amount: -line.amount, amountCurrency: -line.amount,
        amountGross: -line.amount, amountGrossCurrency: -line.amount,
      });
    } else {
      // Ut: contra debit (positive), bank 1920 credit (negative)
      postings.push({
        row: rowNum++,
        date: line.date,
        description: line.desc,
        account: { id: acctMap[line.contraAcct] },
        amount: line.amount, amountCurrency: line.amount,
        amountGross: line.amount, amountGrossCurrency: line.amount,
      });
      postings.push({
        row: rowNum++,
        date: line.date,
        description: line.desc,
        account: { id: acctMap[1920] },
        amount: -line.amount, amountCurrency: -line.amount,
        amountGross: -line.amount, amountGrossCurrency: -line.amount,
      });
    }
  }

  // Post combined voucher if there are postings
  if (postings.length > 0) {
    console.log(`\nPosting combined voucher with ${postings.length} postings`);
    const voucher = {
      date: earliestDate,
      description: "Bank reconciliation - supplier payments",
      postings,
    };
    const result = await post("ledger/voucher", voucher);
    console.log("Voucher created:", JSON.stringify(result.value?.id || result));
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
