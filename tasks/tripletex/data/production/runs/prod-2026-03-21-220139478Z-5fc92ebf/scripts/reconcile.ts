const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "QVNtg8TNT1fJSLn7u1uWEMtB2R8MS0WjxxJEVusa7cc";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) { const t = await r.text(); console.error(`GET ${path} → ${r.status}: ${t}`); throw new Error(`GET ${r.status}`); }
  return r.json();
}
async function put(path: string) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: H });
  if (!r.ok) { const t = await r.text(); console.error(`PUT ${path} → ${r.status}: ${t}`); throw new Error(`PUT ${r.status}`); }
  return r.json();
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); console.error(`POST ${path} → ${r.status}: ${t}`); throw new Error(`POST ${r.status}`); }
  return r.json();
}

// Bank statement lines parsed
interface BankLine { date: string; desc: string; inn: number | null; ut: number | null; }
const lines: BankLine[] = [
  { date: "2026-01-16", desc: "Innbetaling fra Wagner GmbH / Faktura 1001", inn: 23625.00, ut: null },
  { date: "2026-01-19", desc: "Innbetaling fra Wagner GmbH / Faktura 1002", inn: 28812.50, ut: null },
  { date: "2026-01-22", desc: "Innbetaling fra Weber GmbH / Faktura 1003", inn: 15250.00, ut: null },
  { date: "2026-01-25", desc: "Innbetaling fra Becker GmbH / Faktura 1004", inn: 17875.00, ut: null },
  { date: "2026-01-28", desc: "Innbetaling fra Meyer GmbH / Faktura 1005", inn: 10750.00, ut: null },
  { date: "2026-01-31", desc: "Betaling Lieferant Hoffmann GmbH", inn: null, ut: -19450.00 },
  { date: "2026-02-02", desc: "Betaling Lieferant Weber GmbH", inn: null, ut: -7500.00 },
  { date: "2026-02-04", desc: "Betaling Lieferant Wagner GmbH", inn: null, ut: -5800.00 },
  { date: "2026-02-05", desc: "Bankgebyr", inn: null, ut: -57.41 },
  { date: "2026-02-06", desc: "Bankgebyr", inn: 315.79, ut: null },
  { date: "2026-02-08", desc: "Bankgebyr", inn: 1704.68, ut: null },
];

const customerLines = lines.filter(l => l.desc.startsWith("Innbetaling fra"));
const supplierLines = lines.filter(l => l.desc.startsWith("Betaling Lieferant"));
const feeLines = lines.filter(l => l.desc === "Bankgebyr");

async function main() {
  // Step 1: 5 parallel reads
  const [invoicesRes, payTypesRes, suppliersRes, suppInvRes, accountsRes] = await Promise.all([
    get("/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
    get("/invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
    get("/supplier?count=1000&fields=*"),
    get("/supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
    get("/ledger/account?number=1920,2400,7770&fields=*"),
  ]);

  const invoices = invoicesRes.values || [];
  const payTypes = payTypesRes.values || [];
  const suppliers = suppliersRes.values || [];
  const suppInvoices = suppInvRes.values || [];
  const accounts = accountsRes.values || [];

  console.log(`Invoices: ${invoices.length}, PayTypes: ${payTypes.length}, Suppliers: ${suppliers.length}, SuppInv: ${suppInvoices.length}, Accounts: ${accounts.length}`);

  // Step 2: payment type with debitAccount.number === 1920
  const payType = payTypes.find((pt: any) => pt.debitAccount?.number === 1920);
  if (!payType) throw new Error("No payment type with debitAccount 1920");
  console.log(`PaymentType: id=${payType.id} desc=${payType.description}`);

  // Account IDs
  const acc1920 = accounts.find((a: any) => a.number === 1920);
  const acc2400 = accounts.find((a: any) => a.number === 2400);
  const acc7770 = accounts.find((a: any) => a.number === 7770);
  if (!acc1920 || !acc2400 || !acc7770) throw new Error(`Missing accounts: 1920=${acc1920?.id} 2400=${acc2400?.id} 7770=${acc7770?.id}`);
  console.log(`Accounts: 1920=${acc1920.id}, 2400=${acc2400.id}, 7770=${acc7770.id}`);

  // Build outstanding tracker
  const outstanding: Record<number, number> = {};
  for (const inv of invoices) {
    outstanding[inv.id] = inv.amountCurrencyOutstanding ?? inv.amountOutstanding ?? 0;
  }

  // Step 3: Match and pay customer invoices
  for (const cl of customerLines) {
    const amt = cl.inn!;
    // Extract customer name
    const nameMatch = cl.desc.match(/Innbetaling fra (.+?) \//);
    const custName = nameMatch ? nameMatch[1].toLowerCase() : "";
    console.log(`\nMatching: ${cl.desc} amt=${amt} custName="${custName}"`);

    // Find matching invoices for this customer
    const custInvoices = invoices
      .filter((inv: any) => {
        const invCustName = (inv.customer?.name || "").toLowerCase();
        return invCustName.includes(custName) || custName.includes(invCustName);
      })
      .filter((inv: any) => outstanding[inv.id] > 0.01)
      .sort((a: any, b: any) => {
        const aOut = outstanding[a.id];
        const bOut = outstanding[b.id];
        // Priority: exact match → smallest >= amt → lowest invoiceNumber
        if (Math.abs(aOut - amt) < 0.01) return -1;
        if (Math.abs(bOut - amt) < 0.01) return 1;
        if (aOut >= amt && bOut >= amt) return aOut - bOut;
        if (aOut >= amt) return -1;
        if (bOut >= amt) return 1;
        return (a.invoiceNumber || 0) - (b.invoiceNumber || 0);
      });

    if (custInvoices.length === 0) {
      console.error(`No matching invoice for ${cl.desc}`);
      continue;
    }

    const inv = custInvoices[0];
    const payAmt = Math.min(amt, outstanding[inv.id]);
    console.log(`  → Invoice id=${inv.id} #${inv.invoiceNumber} outstanding=${outstanding[inv.id]} paying=${payAmt}`);

    await put(`/invoice/${inv.id}/:payment?paymentDate=${cl.date}&paymentTypeId=${payType.id}&paidAmount=${payAmt}`);
    outstanding[inv.id] -= payAmt;
    console.log(`  → Paid. Remaining outstanding=${outstanding[inv.id]}`);
  }

  // Step 4 + 5: Combined voucher for supplier payments + non-invoice lines
  const hasSupplierInvoices = suppInvoices.length > 0;
  console.log(`\nSupplier invoices found: ${suppInvoices.length}`);

  // Build voucher postings
  const postings: any[] = [];
  let row = 1;

  if (!hasSupplierInvoices) {
    // Combine all supplier payments into one voucher
    for (const sl of supplierLines) {
      const supplierNameMatch = sl.desc.match(/Betaling Lieferant (.+)/);
      const supplierName = supplierNameMatch ? supplierNameMatch[1].toLowerCase() : "";
      const amount = Math.abs(sl.ut!);

      const supplier = suppliers.find((s: any) => (s.name || "").toLowerCase().includes(supplierName) || supplierName.includes((s.name || "").toLowerCase()));
      if (!supplier) { console.error(`No supplier match for: ${sl.desc}`); continue; }

      console.log(`Supplier payment: ${sl.desc} amt=${amount} supplierId=${supplier.id}`);
      postings.push(
        { row: row,   date: sl.date, account: { id: acc2400.id }, amountGross: amount,  amountGrossCurrency: amount,  supplier: { id: supplier.id } },
        { row: row+1, date: sl.date, account: { id: acc1920.id }, amountGross: -amount, amountGrossCurrency: -amount },
      );
      row += 2;
    }
  } else {
    // Has supplier invoices — need paymentTypeOut and use addPayment
    const payOutRes = await get("/ledger/paymentTypeOut?count=1000&fields=*");
    const payOutTypes = payOutRes.values || [];
    const payOutType = payOutTypes.find((pt: any) => pt.debitAccount?.number === 1920 || pt.creditAccount?.number === 1920);

    for (const sl of supplierLines) {
      const supplierNameMatch = sl.desc.match(/Betaling Lieferant (.+)/);
      const supplierName = supplierNameMatch ? supplierNameMatch[1].toLowerCase() : "";
      const amount = Math.abs(sl.ut!);

      const matchInv = suppInvoices.find((si: any) => {
        const sn = (si.supplier?.name || "").toLowerCase();
        return sn.includes(supplierName) || supplierName.includes(sn);
      });

      if (matchInv && payOutType) {
        console.log(`Supplier invoice payment: ${sl.desc} invId=${matchInv.id} amt=${amount}`);
        await post(`/supplierInvoice/${matchInv.id}/:addPayment`, {
          paymentDate: sl.date,
          paymentTypeId: payOutType.id,
          paidAmount: amount,
        });
      }
    }
  }

  // Step 5: Non-invoice lines (Bankgebyr) — add to same voucher
  for (const fl of feeLines) {
    const isIncoming = fl.inn !== null;
    const amount = isIncoming ? fl.inn! : Math.abs(fl.ut!);

    if (isIncoming) {
      // Bankgebyr refund: debit 1920, credit 7770
      postings.push(
        { row, date: fl.date, description: "Bankgebyr", account: { id: acc1920.id }, amount: amount, amountCurrency: amount, amountGross: amount, amountGrossCurrency: amount },
        { row: row+1, date: fl.date, description: "Bankgebyr", account: { id: acc7770.id }, amount: -amount, amountCurrency: -amount, amountGross: -amount, amountGrossCurrency: -amount },
      );
    } else {
      // Bankgebyr expense: debit 7770, credit 1920
      postings.push(
        { row, date: fl.date, description: "Bankgebyr", account: { id: acc7770.id }, amount: amount, amountCurrency: amount, amountGross: amount, amountGrossCurrency: amount },
        { row: row+1, date: fl.date, description: "Bankgebyr", account: { id: acc1920.id }, amount: -amount, amountCurrency: -amount, amountGross: -amount, amountGrossCurrency: -amount },
      );
    }
    row += 2;
  }

  if (postings.length > 0) {
    const earliestDate = [...supplierLines, ...feeLines].sort((a, b) => a.date.localeCompare(b.date))[0]?.date || "2026-01-31";
    const voucher = {
      date: earliestDate,
      description: "Bank reconciliation - supplier payments",
      postings,
    };
    console.log(`\nPosting voucher with ${postings.length} postings, date=${earliestDate}`);
    const vRes = await post("/ledger/voucher", voucher);
    console.log(`Voucher created: id=${vRes.value?.id}`);
  }

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
