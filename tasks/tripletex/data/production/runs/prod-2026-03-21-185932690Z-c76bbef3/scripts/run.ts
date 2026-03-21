const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "X4gOWCpS90HlGwY_Y945EAtNYLGafZu9RlTfbFWi1h4";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { headers });
  if (!r.ok) {
    const t = await r.text();
    console.error(`GET ${path} → ${r.status}: ${t}`);
    throw new Error(`GET ${path} failed: ${r.status}`);
  }
  return r.json();
}

async function put(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { method: "PUT", headers });
  if (!r.ok) {
    const t = await r.text();
    console.error(`PUT ${path} → ${r.status}: ${t}`);
    throw new Error(`PUT ${path} failed: ${r.status}`);
  }
  return r.json();
}

async function post(path: string, body: any) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text();
    console.error(`POST ${path} → ${r.status}: ${t}`);
    throw new Error(`POST ${path} failed: ${r.status}`);
  }
  return r.json();
}

// Bank statement parsed
const customerPayments = [
  { date: "2026-01-16", name: "Neset AS", amount: 11312.50 },
  { date: "2026-01-18", name: "Eide AS", amount: 13812.50 },
  { date: "2026-01-20", name: "Lunde AS", amount: 11737.50 },
  { date: "2026-01-21", name: "Stølsvik AS", amount: 28312.50 },
  { date: "2026-01-23", name: "Haugen AS", amount: 27125.00 },
];

const supplierPayments = [
  { date: "2026-01-25", name: "Lunde AS", amount: 10950.00 },
  { date: "2026-01-28", name: "Neset AS", amount: 8400.00 },
  { date: "2026-01-30", name: "Stølsvik AS", amount: 5500.00 },
];

async function main() {
  // Step 1: 5 parallel reads
  const [invoicesRes, paymentTypesRes, suppliersRes, supplierInvoicesRes, accountsRes] = await Promise.all([
    get("invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
    get("invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
    get("supplier?count=1000&fields=*"),
    get("supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
    get("ledger/account?number=2400,1920&fields=*"),
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

  // Find accounts
  const account1920 = accounts.find((a: any) => a.number === 1920);
  const account2400 = accounts.find((a: any) => a.number === 2400);
  if (!account1920 || !account2400) throw new Error("Missing accounts 1920 or 2400");
  console.log(`Account 1920 id: ${account1920.id}, Account 2400 id: ${account2400.id}`);

  // Build outstanding tracker for invoices
  const outstandingMap: Record<number, number> = {};
  for (const inv of invoices) {
    outstandingMap[inv.id] = inv.amountOutstanding ?? inv.amount;
  }

  // Step 3: Match and pay customer invoices sequentially
  for (const cp of customerPayments) {
    const nameLower = cp.name.toLowerCase();
    // Find matching invoices for this customer
    const matching = invoices
      .filter((inv: any) => {
        const custName = inv.customer?.name?.toLowerCase() || "";
        return custName.includes(nameLower) || nameLower.includes(custName.toLowerCase());
      })
      .filter((inv: any) => (outstandingMap[inv.id] ?? 0) > 0);

    if (matching.length === 0) {
      console.error(`No matching invoice for ${cp.name}`);
      continue;
    }

    // Priority: exact outstanding match → smallest outstanding >= bankAmount → lowest invoiceNumber
    let best = matching.find((inv: any) => Math.abs(outstandingMap[inv.id] - cp.amount) < 0.01);
    if (!best) {
      const candidates = matching.filter((inv: any) => outstandingMap[inv.id] >= cp.amount);
      if (candidates.length > 0) {
        candidates.sort((a: any, b: any) => outstandingMap[a.id] - outstandingMap[b.id]);
        best = candidates[0];
      } else {
        matching.sort((a: any, b: any) => (a.invoiceNumber || a.id) - (b.invoiceNumber || b.id));
        best = matching[0];
      }
    }

    const paidAmount = Math.min(cp.amount, outstandingMap[best.id]);
    console.log(`Paying invoice ${best.id} (${best.customer?.name}) ${paidAmount} on ${cp.date}`);

    await put(`invoice/${best.id}/:payment?paymentDate=${cp.date}&paymentTypeId=${paymentType.id}&paidAmount=${paidAmount}`);
    outstandingMap[best.id] -= paidAmount;
  }

  // Step 4: Handle supplier payments
  if (supplierInvoices.length > 0) {
    // Use addPayment on supplier invoices
    console.log("Supplier invoices found, using addPayment...");
    const paymentTypeOutRes = await get("ledger/paymentTypeOut?count=1000&fields=*,creditAccount(*)");
    const paymentTypesOut = paymentTypeOutRes.values || [];
    const paymentTypeOut = paymentTypesOut.find((pt: any) => pt.creditAccount?.number === 1920);
    if (!paymentTypeOut) throw new Error("No outgoing payment type with creditAccount 1920");

    for (const sp of supplierPayments) {
      const nameLower = sp.name.toLowerCase();
      const matchingSupInv = supplierInvoices.find((si: any) => {
        const suppName = si.supplier?.name?.toLowerCase() || "";
        return suppName.includes(nameLower) || nameLower.includes(suppName.toLowerCase());
      });
      if (!matchingSupInv) {
        console.error(`No matching supplier invoice for ${sp.name}`);
        continue;
      }
      console.log(`Paying supplier invoice ${matchingSupInv.id} (${sp.name}) ${sp.amount} on ${sp.date}`);
      await post(`supplierInvoice/${matchingSupInv.id}/:addPayment`, {
        paymentDate: sp.date,
        paymentTypeId: paymentTypeOut.id,
        paidAmount: sp.amount,
      });
    }
  } else {
    // No supplier invoices — combine into ONE voucher
    console.log("No supplier invoices, creating combined voucher...");
    const postings: any[] = [];
    let row = 1;
    for (const sp of supplierPayments) {
      const nameLower = sp.name.toLowerCase();
      const supplier = suppliers.find((s: any) => s.name?.toLowerCase().includes(nameLower) || nameLower.includes(s.name?.toLowerCase()));
      if (!supplier) {
        console.error(`No matching supplier for ${sp.name}`);
        continue;
      }
      postings.push({
        row: row++,
        date: sp.date,
        account: { id: account2400.id },
        amountGross: sp.amount,
        amountGrossCurrency: sp.amount,
        supplier: { id: supplier.id },
      });
      postings.push({
        row: row++,
        date: sp.date,
        account: { id: account1920.id },
        amountGross: -sp.amount,
        amountGrossCurrency: -sp.amount,
      });
    }

    const earliestDate = supplierPayments[0].date;
    const voucher = {
      date: earliestDate,
      description: "Bank reconciliation - supplier payments",
      postings,
    };

    console.log("Creating voucher with", postings.length, "postings");
    const result = await post("ledger/voucher", voucher);
    console.log("Voucher created:", result.value?.id);
  }

  console.log("Done!");
}

main().catch(e => { console.error(e); process.exit(1); });
