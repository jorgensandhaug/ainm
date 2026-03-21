const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "hgztmm2EMNRbDvzR3dS-TggNVmt9zpN7HX1u5IJd1Nc";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${path}`);
  const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) { console.error(`ERROR ${r.status}: ${text}`); return null; }
  return JSON.parse(text);
}

// CSV data parsed
const bankLines = [
  { date: "2026-01-17", desc: "Innbetaling fra Weber GmbH / Faktura 1001", inn: 11312.50, ut: 0, type: "customer", name: "Weber" },
  { date: "2026-01-20", desc: "Innbetaling fra Meyer GmbH / Faktura 1002", inn: 20937.50, ut: 0, type: "customer", name: "Meyer" },
  { date: "2026-01-23", desc: "Innbetaling fra Schneider GmbH / Faktura 1003", inn: 15312.50, ut: 0, type: "customer", name: "Schneider" },
  { date: "2026-01-26", desc: "Innbetaling fra Müller GmbH / Faktura 1004", inn: 12593.75, ut: 0, type: "customer", name: "Müller" },
  { date: "2026-01-29", desc: "Innbetaling fra Müller GmbH / Faktura 1005", inn: 6500.00, ut: 0, type: "customer", name: "Müller" },
  { date: "2026-02-01", desc: "Betaling Lieferant Becker GmbH", inn: 0, ut: 17450.00, type: "supplier", name: "Becker" },
  { date: "2026-02-03", desc: "Betaling Lieferant Schneider GmbH", inn: 0, ut: 13500.00, type: "supplier", name: "Schneider" },
  { date: "2026-02-06", desc: "Betaling Lieferant Meyer GmbH", inn: 0, ut: 7450.00, type: "supplier", name: "Meyer" },
  { date: "2026-02-07", desc: "Skattetrekk", inn: 393.31, ut: 0, type: "skattetrekk-inn" },
  { date: "2026-02-08", desc: "Skattetrekk", inn: 0, ut: 301.90, type: "skattetrekk-ut" },
];

async function main() {
  // Step 1: 5 parallel reads
  const [invoicesR, payTypesR, suppliersR, suppInvR, accountsR] = await Promise.all([
    api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
    api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
    api("GET", "/supplier?count=1000&fields=*"),
    api("GET", "/supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
    api("GET", "/ledger/account?number=1920,2400,2600,7770,8050&fields=*"),
  ]);

  const invoices = invoicesR?.values || [];
  const payTypes = payTypesR?.values || [];
  const suppliers = suppliersR?.values || [];
  const suppInvoices = suppInvR?.values || [];
  const accounts = accountsR?.values || [];

  console.log(`Invoices: ${invoices.length}, PayTypes: ${payTypes.length}, Suppliers: ${suppliers.length}, SuppInvoices: ${suppInvoices.length}, Accounts: ${accounts.length}`);

  // Step 2: Find payment type with debitAccount.number === 1920
  const payType = payTypes.find((pt: any) => pt.debitAccount?.number === 1920);
  if (!payType) { console.error("No payment type with debit account 1920"); return; }
  console.log(`Payment type: id=${payType.id} "${payType.description}"`);

  // Account IDs
  const acct = (num: number) => {
    const a = accounts.find((a: any) => a.number === num);
    if (!a) console.error(`Account ${num} not found!`);
    return a;
  };
  const acct1920 = acct(1920);
  const acct2400 = acct(2400);
  const acct2600 = acct(2600);
  const acct8050 = acct(8050);

  // Print invoices for matching
  console.log("\n--- Open customer invoices ---");
  for (const inv of invoices) {
    console.log(`  Invoice #${inv.invoiceNumber} id=${inv.id} customer="${inv.customer?.name}" outstanding=${inv.amountCurrencyOutstanding}`);
  }

  // Track outstanding locally
  const outstanding: Record<number, number> = {};
  for (const inv of invoices) {
    outstanding[inv.id] = inv.amountCurrencyOutstanding;
  }

  // Step 3: Match and pay customer invoices
  const customerLines = bankLines.filter(l => l.type === "customer");
  const paymentPromises: (() => Promise<any>)[] = [];

  for (const line of customerLines) {
    const nameLC = line.name!.toLowerCase();
    // Find matching invoices for this customer
    const candidates = invoices.filter((inv: any) =>
      inv.customer?.name?.toLowerCase().includes(nameLC) && outstanding[inv.id] > 0
    );

    if (candidates.length === 0) {
      console.error(`No matching invoice for customer "${line.name}" amount=${line.inn}`);
      continue;
    }

    // Priority: exact outstanding match → smallest outstanding >= bankAmount → lowest invoiceNumber
    let match = candidates.find((inv: any) => Math.abs(outstanding[inv.id] - line.inn) < 0.01);
    if (!match) {
      const eligible = candidates.filter((inv: any) => outstanding[inv.id] >= line.inn);
      if (eligible.length > 0) {
        eligible.sort((a: any, b: any) => outstanding[a.id] - outstanding[b.id]);
        match = eligible[0];
      } else {
        candidates.sort((a: any, b: any) => a.invoiceNumber - b.invoiceNumber);
        match = candidates[0];
      }
    }

    const paidAmount = Math.min(line.inn, outstanding[match.id]);
    console.log(`Match: "${line.name}" ${line.inn} → Invoice #${match.invoiceNumber} id=${match.id} outstanding=${outstanding[match.id]} paying=${paidAmount}`);
    outstanding[match.id] -= paidAmount;

    const payDate = line.date;
    const invId = match.id;
    paymentPromises.push(() =>
      api("PUT", `/invoice/${invId}/:payment?paymentDate=${payDate}&paymentTypeId=${payType.id}&paidAmount=${paidAmount}`)
    );
  }

  // Execute customer payments sequentially (to avoid race conditions on same invoice)
  for (const pf of paymentPromises) {
    await pf();
  }

  // Step 4 & 5: Supplier payments + non-invoice lines in one voucher
  const supplierLines = bankLines.filter(l => l.type === "supplier");
  const nonInvoiceLines = bankLines.filter(l => l.type?.startsWith("skattetrekk"));

  const hasSupplierInvoices = suppInvoices.length > 0;
  console.log(`\nSupplier invoices in system: ${suppInvoices.length}`);

  // If supplier invoices exist, pay them via addPayment; otherwise combine into voucher
  if (hasSupplierInvoices) {
    // Need paymentTypeOut
    const payTypeOutR = await api("GET", "/ledger/paymentTypeOut?count=1000&fields=*");
    const payTypesOut = payTypeOutR?.values || [];
    // Find payment type with credit account 1920
    const payTypeOut = payTypesOut.find((pt: any) => pt.creditAccount?.number === 1920 || pt.debitAccount?.number === 1920);

    for (const line of supplierLines) {
      const nameLC = line.name!.toLowerCase();
      const match = suppInvoices.find((si: any) =>
        si.supplier?.name?.toLowerCase().includes(nameLC)
      );
      if (match && payTypeOut) {
        await api("POST", `/supplierInvoice/${match.id}/:addPayment`, {
          paymentDate: line.date,
          paymentTypeId: payTypeOut.id,
          paidAmount: line.ut,
        });
      }
    }
  }

  // Build combined voucher for supplier payments (if no supplier invoices) + non-invoice lines
  const postings: any[] = [];
  let row = 1;
  let earliestDate = "2026-12-31";

  if (!hasSupplierInvoices) {
    for (const line of supplierLines) {
      const nameLC = line.name!.toLowerCase();
      const supplier = suppliers.find((s: any) => s.name?.toLowerCase().includes(nameLC));
      if (!supplier) { console.error(`Supplier not found: ${line.name}`); continue; }

      if (line.date < earliestDate) earliestDate = line.date;

      // DR 2400 (supplier account), CR 1920 (bank)
      postings.push({
        row: row++, date: line.date, account: { id: acct2400.id },
        amountGross: line.ut, amountGrossCurrency: line.ut,
        supplier: { id: supplier.id }
      });
      postings.push({
        row: row++, date: line.date, account: { id: acct1920.id },
        amountGross: -line.ut, amountGrossCurrency: -line.ut
      });
    }
  }

  // Non-invoice lines
  for (const line of nonInvoiceLines) {
    if (line.date < earliestDate) earliestDate = line.date;

    if (line.type === "skattetrekk-inn") {
      // Inn: DR 1920, CR 2600
      postings.push({
        row: row++, date: line.date, description: "Skattetrekk",
        account: { id: acct1920.id },
        amount: line.inn, amountCurrency: line.inn, amountGross: line.inn, amountGrossCurrency: line.inn
      });
      postings.push({
        row: row++, date: line.date, description: "Skattetrekk",
        account: { id: acct2600.id },
        amount: -line.inn, amountCurrency: -line.inn, amountGross: -line.inn, amountGrossCurrency: -line.inn
      });
    } else if (line.type === "skattetrekk-ut") {
      // Ut: DR 2600, CR 1920
      postings.push({
        row: row++, date: line.date, description: "Skattetrekk",
        account: { id: acct2600.id },
        amount: line.ut, amountCurrency: line.ut, amountGross: line.ut, amountGrossCurrency: line.ut
      });
      postings.push({
        row: row++, date: line.date, description: "Skattetrekk",
        account: { id: acct1920.id },
        amount: -line.ut, amountCurrency: -line.ut, amountGross: -line.ut, amountGrossCurrency: -line.ut
      });
    }
  }

  if (postings.length > 0) {
    const voucher = {
      date: earliestDate,
      description: "Bank reconciliation - supplier payments",
      postings
    };
    console.log(`\nCreating voucher with ${postings.length} postings, date=${earliestDate}`);
    const vResult = await api("POST", "/ledger/voucher", voucher);
    if (vResult) console.log(`Voucher created: id=${vResult.value?.id}`);
  }

  console.log("\nDone.");
}

main().catch(e => console.error(e));
