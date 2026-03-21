const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "gZTdoijpeHzGYD41vVLFS3WHaPJf8zhercueEY5TNRg";
const AUTH = "Basic " + Buffer.from(`0:${TOKEN}`).toString("base64");

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} => ${res.status}`);
  if (!res.ok) {
    console.error(text);
    throw new Error(`${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function main() {
  // Step 1: Fire 5 reads in parallel
  const [invoicesRes, paymentTypesRes, suppliersRes, supplierInvoicesRes, accountsRes] =
    await Promise.all([
      api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
      api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
      api("GET", "/supplier?count=1000&fields=*"),
      api("GET", "/supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
      api("GET", "/ledger/account?number=1920,2400,2600,7770,8050&fields=*"),
    ]);

  const invoices = invoicesRes.values || [];
  const paymentTypes = paymentTypesRes.values || [];
  const suppliers = suppliersRes.values || [];
  const supplierInvoices = supplierInvoicesRes.values || [];
  const accounts = accountsRes.values || [];

  console.log(
    `Invoices: ${invoices.length}, PaymentTypes: ${paymentTypes.length}, Suppliers: ${suppliers.length}, SupplierInvoices: ${supplierInvoices.length}, Accounts: ${accounts.length}`
  );

  // Step 2: Select payment type where debitAccount.number === 1920
  const paymentType = paymentTypes.find((pt: any) => pt.debitAccount?.number === 1920);
  if (!paymentType) throw new Error("No payment type with debitAccount 1920");
  console.log(`Payment type: ${paymentType.id} (${paymentType.description})`);

  // Account lookup
  const acctMap: Record<number, any> = {};
  for (const a of accounts) acctMap[a.number] = a;
  const acct1920 = acctMap[1920]; if (!acct1920) throw new Error("Account 1920 not found");
  const acct2400 = acctMap[2400]; if (!acct2400) throw new Error("Account 2400 not found");
  const acct2600 = acctMap[2600]; if (!acct2600) throw new Error("Account 2600 not found");
  const acct7770 = acctMap[7770]; if (!acct7770) throw new Error("Account 7770 not found");

  // Print invoices
  for (const inv of invoices) {
    console.log(`  Invoice #${inv.invoiceNumber}: customer="${inv.customer?.name}", outstanding=${inv.amountCurrencyOutstanding}`);
  }
  // Print suppliers
  for (const s of suppliers) {
    console.log(`  Supplier: "${s.name}" (id: ${s.id})`);
  }

  // Build outstanding tracker
  const outstanding: Record<number, number> = {};
  for (const inv of invoices) {
    outstanding[inv.id] = inv.amountCurrencyOutstanding ?? inv.amountOutstanding ?? 0;
  }

  // === CSV Parsed Data ===
  // Customer payments (incoming)
  const customerPayments = [
    { date: "2026-01-18", customer: "Sánchez SL", amount: 8500.0 },
    { date: "2026-01-19", customer: "Sánchez SL", amount: 7375.0 },
    { date: "2026-01-22", customer: "Pérez SL", amount: 7875.0 },
    { date: "2026-01-25", customer: "Romero SL", amount: 22937.5 },
    { date: "2026-01-26", customer: "Romero SL", amount: 14250.0 },
  ];

  // Supplier payments (outgoing)
  const supplierPaymentsData = [
    { date: "2026-01-29", supplier: "González SL", amount: 10150.0 },
    { date: "2026-01-30", supplier: "Rodríguez SL", amount: 5800.0 },
    { date: "2026-02-02", supplier: "Rodríguez SL", amount: 18400.0 },
  ];

  // Step 3: Match and pay customer invoices (sequential — update outstanding tracker after each)
  for (const cp of customerPayments) {
    const normCP = normalize(cp.customer);
    const custInvoices = invoices
      .filter((inv: any) => {
        if (!inv.customer?.name) return false;
        const normName = normalize(inv.customer.name);
        return normName.includes(normCP) || normCP.includes(normName);
      })
      .filter((inv: any) => outstanding[inv.id] > 0.01);

    if (custInvoices.length === 0) {
      console.error(`No open invoice found for ${cp.customer}`);
      continue;
    }

    // Priority: exact outstanding match → smallest outstanding >= bankAmount → lowest invoiceNumber
    let matched = custInvoices.find(
      (inv: any) => Math.abs(outstanding[inv.id] - cp.amount) < 0.01
    );
    if (!matched) {
      const candidates = custInvoices
        .filter((inv: any) => outstanding[inv.id] >= cp.amount - 0.01)
        .sort((a: any, b: any) => outstanding[a.id] - outstanding[b.id]);
      matched = candidates.length > 0
        ? candidates[0]
        : custInvoices.sort((a: any, b: any) => a.invoiceNumber - b.invoiceNumber)[0];
    }

    const payAmount = Math.min(cp.amount, outstanding[matched.id]);
    console.log(
      `  Pay ${cp.customer} ${payAmount} → invoice #${matched.invoiceNumber} (outstanding was: ${outstanding[matched.id]})`
    );

    await api(
      "PUT",
      `/invoice/${matched.id}/:payment?paymentDate=${cp.date}&paymentTypeId=${paymentType.id}&paidAmount=${payAmount}`
    );
    outstanding[matched.id] -= payAmount;
  }

  // Step 4 + 5: Build combined voucher (supplier payments + non-invoice lines)
  const postings: any[] = [];
  let row = 1;

  if (supplierInvoices.length > 0) {
    // Has supplier invoices — use addPayment endpoint per match
    const paymentTypeOutRes = await api("GET", "/ledger/paymentTypeOut?count=1000&fields=*,creditAccount(*)");
    const paymentTypesOut = paymentTypeOutRes.values || [];
    const ptOut =
      paymentTypesOut.find((pt: any) => pt.creditAccount?.number === 1920) || paymentTypesOut[0];

    for (const sp of supplierPaymentsData) {
      const normSP = normalize(sp.supplier);
      const matched = supplierInvoices.find((si: any) => {
        if (!si.supplier?.name) return false;
        const normName = normalize(si.supplier.name);
        return normName.includes(normSP) || normSP.includes(normName);
      });
      if (matched) {
        console.log(`  Supplier invoice payment: ${sp.supplier} ${sp.amount} → SI #${matched.id}`);
        await api("POST", `/supplierInvoice/${matched.id}/:addPayment`, {
          paymentDate: sp.date,
          paymentType: { id: ptOut.id },
          paidAmount: sp.amount,
        });
      } else {
        console.error(`No supplier invoice for ${sp.supplier}`);
      }
    }
  } else {
    // No supplier invoices — combine supplier payments into voucher postings
    for (const sp of supplierPaymentsData) {
      const normSP = normalize(sp.supplier);
      const supplier = suppliers.find((s: any) => {
        if (!s.name) return false;
        const normName = normalize(s.name);
        return normName.includes(normSP) || normSP.includes(normName);
      });
      if (supplier) {
        console.log(`  Supplier match: ${sp.supplier} → ${supplier.name} (id: ${supplier.id})`);
        postings.push(
          { row: row++, date: sp.date, account: { id: acct2400.id }, amountGross: sp.amount, amountGrossCurrency: sp.amount, supplier: { id: supplier.id } },
          { row: row++, date: sp.date, account: { id: acct1920.id }, amountGross: -sp.amount, amountGrossCurrency: -sp.amount }
        );
      } else {
        console.error(`Supplier not found: ${sp.supplier} — booking without supplier ref`);
        postings.push(
          { row: row++, date: sp.date, account: { id: acct2400.id }, amountGross: sp.amount, amountGrossCurrency: sp.amount },
          { row: row++, date: sp.date, account: { id: acct1920.id }, amountGross: -sp.amount, amountGrossCurrency: -sp.amount }
        );
      }
    }
  }

  // Non-invoice lines — merge into same voucher
  // Bankgebyr: Ut -1083.95 → 7770 debit, 1920 credit
  postings.push(
    { row: row++, date: "2026-02-03", description: "Bankgebyr", account: { id: acct7770.id }, amount: 1083.95, amountCurrency: 1083.95, amountGross: 1083.95, amountGrossCurrency: 1083.95 },
    { row: row++, date: "2026-02-03", description: "Bankgebyr", account: { id: acct1920.id }, amount: -1083.95, amountCurrency: -1083.95, amountGross: -1083.95, amountGrossCurrency: -1083.95 }
  );

  // Skattetrekk incoming +1269.93 → 1920 debit, 2600 credit
  postings.push(
    { row: row++, date: "2026-02-05", description: "Skattetrekk", account: { id: acct1920.id }, amount: 1269.93, amountCurrency: 1269.93, amountGross: 1269.93, amountGrossCurrency: 1269.93 },
    { row: row++, date: "2026-02-05", description: "Skattetrekk", account: { id: acct2600.id }, amount: -1269.93, amountCurrency: -1269.93, amountGross: -1269.93, amountGrossCurrency: -1269.93 }
  );

  // Skattetrekk outgoing -600.07 → 2600 debit, 1920 credit
  postings.push(
    { row: row++, date: "2026-02-07", description: "Skattetrekk", account: { id: acct2600.id }, amount: 600.07, amountCurrency: 600.07, amountGross: 600.07, amountGrossCurrency: 600.07 },
    { row: row++, date: "2026-02-07", description: "Skattetrekk", account: { id: acct1920.id }, amount: -600.07, amountCurrency: -600.07, amountGross: -600.07, amountGrossCurrency: -600.07 }
  );

  // Create combined voucher
  if (postings.length > 0) {
    const voucherDate = supplierPaymentsData.length > 0 ? supplierPaymentsData[0].date : "2026-02-03";
    const voucher = {
      date: voucherDate,
      description: "Bank reconciliation - supplier payments",
      postings,
    };
    console.log(`Creating combined voucher: ${postings.length} postings, date=${voucherDate}`);
    const voucherRes = await api("POST", "/ledger/voucher", voucher);
    console.log("Voucher created:", voucherRes.value?.id ?? JSON.stringify(voucherRes));
  }

  console.log("DONE — reconciliation complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
