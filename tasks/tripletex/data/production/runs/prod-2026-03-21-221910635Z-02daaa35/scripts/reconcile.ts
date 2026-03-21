const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "fhjC7MAzMYN4-QrtMOwuPO-JrGukixVu1yerOx6YvFQ";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { headers: h });
  const j = await r.json();
  if (!r.ok) { console.error("GET FAIL", r.status, url, JSON.stringify(j)); throw new Error(`GET ${r.status}`); }
  return j;
}

async function put(path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { method: "PUT", headers: h, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) { console.error("PUT FAIL", r.status, url, JSON.stringify(j)); throw new Error(`PUT ${r.status}`); }
  return j;
}

async function post(path: string, body: any) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { method: "POST", headers: h, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { console.error("POST FAIL", r.status, url, JSON.stringify(j)); throw new Error(`POST ${r.status}`); }
  return j;
}

// === CSV Data (parsed inline) ===
interface CsvLine {
  date: string;
  description: string;
  inn: number;
  ut: number;
  saldo: number;
  type: "customer" | "supplier" | "non-invoice";
}

const csvLines: CsvLine[] = [
  { date: "2026-01-16", description: "Innbetaling fra Taylor Ltd / Faktura 1001", inn: 5156.25, ut: 0, saldo: 105156.25, type: "customer" },
  { date: "2026-01-18", description: "Innbetaling fra Wilson Ltd / Faktura 1002", inn: 21875.00, ut: 0, saldo: 127031.25, type: "customer" },
  { date: "2026-01-20", description: "Innbetaling fra Taylor Ltd / Faktura 1003", inn: 18625.00, ut: 0, saldo: 145656.25, type: "customer" },
  { date: "2026-01-22", description: "Innbetaling fra Lewis Ltd / Faktura 1004", inn: 27812.50, ut: 0, saldo: 173468.75, type: "customer" },
  { date: "2026-01-23", description: "Innbetaling fra Brown Ltd / Faktura 1005", inn: 12250.00, ut: 0, saldo: 185718.75, type: "customer" },
  { date: "2026-01-24", description: "Betaling Supplier Taylor Ltd", inn: 0, ut: 10850.00, saldo: 174868.75, type: "supplier" },
  { date: "2026-01-27", description: "Betaling Supplier Taylor Ltd", inn: 0, ut: 10350.00, saldo: 164518.75, type: "supplier" },
  { date: "2026-01-29", description: "Betaling Supplier Smith Ltd", inn: 0, ut: 6200.00, saldo: 158318.75, type: "supplier" },
  { date: "2026-01-30", description: "Renteinntekter", inn: 0, ut: 1495.08, saldo: 156823.67, type: "non-invoice" },
  { date: "2026-01-31", description: "Skattetrekk", inn: 0, ut: 1819.20, saldo: 155004.47, type: "non-invoice" },
  { date: "2026-02-02", description: "Skattetrekk", inn: 1947.28, ut: 0, saldo: 156951.75, type: "non-invoice" },
];

// Computed closing balance = sum(Inn) - sum(|Ut|) (fresh account starts at 0)
const computedBalance = csvLines.reduce((s, l) => s + l.inn - l.ut, 0);
console.log("Computed closing balance:", computedBalance);

// Last CSV date month => Feb 2026
// Step 1: 6 parallel reads
const [invoicesR, payTypesR, suppliersR, suppInvR, accountsR, periodsR] = await Promise.all([
  get("invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
  get("invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
  get("supplier?count=1000&fields=*"),
  get("supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
  get("ledger/account?number=1920,2400,2600,7770,8050&fields=*"),
  get("ledger/accountingPeriod?startFrom=2026-02-01&startTo=2026-02-02&count=1&fields=*"),
]);

const invoices = invoicesR.values || [];
const payTypes = payTypesR.values || [];
const suppliers = suppliersR.values || [];
const suppInvoices = suppInvR.values || [];
const accounts = accountsR.values || [];
const periods = periodsR.values || [];

console.log(`Invoices: ${invoices.length}, PayTypes: ${payTypes.length}, Suppliers: ${suppliers.length}, SupplierInvoices: ${suppInvoices.length}, Accounts: ${accounts.length}, Periods: ${periods.length}`);

// Step 2: Find payment type with debitAccount 1920
const payType = payTypes.find((pt: any) => pt.debitAccount?.number === 1920);
if (!payType) throw new Error("No payment type with debitAccount 1920");
console.log("Payment type:", payType.id, payType.description);

// Account IDs
const acct = (num: number) => {
  const a = accounts.find((a: any) => a.number === num);
  if (!a) throw new Error(`Account ${num} not found`);
  return a.id;
};
const acct1920 = acct(1920);
const acct2400 = acct(2400);
const acct2600 = acct(2600);
const acct7770 = acct(7770);
const acct8050 = acct(8050);
console.log("Accounts:", { acct1920, acct2400, acct2600, acct7770, acct8050 });

// Period
if (periods.length === 0) throw new Error("No accounting period found");
const period = periods[0];
console.log("Period:", period.id, period.start, period.end);

// Step 3: Match and pay customer invoices
// Build outstanding tracker from invoices
const outstanding: Record<number, number> = {};
for (const inv of invoices) {
  outstanding[inv.id] = inv.amountCurrencyOutstanding ?? inv.amountOutstanding ?? 0;
}

const customerLines = csvLines.filter(l => l.type === "customer");

for (const line of customerLines) {
  // Extract customer name from description
  const nameMatch = line.description.match(/fra\s+(.+?)\s*\/\s*Faktura/i);
  const custName = nameMatch ? nameMatch[1].trim().toLowerCase() : "";
  console.log(`\nMatching: ${line.description} amount=${line.inn} custName="${custName}"`);

  // Find matching invoices for this customer
  const matchingInvoices = invoices
    .filter((inv: any) => {
      const invCustName = inv.customer?.name?.toLowerCase() || "";
      return invCustName.includes(custName) || custName.includes(invCustName);
    })
    .filter((inv: any) => (outstanding[inv.id] || 0) > 0.005)
    .sort((a: any, b: any) => {
      // Priority: exact match → smallest outstanding >= amount → lowest invoice number
      const aOut = outstanding[a.id] || 0;
      const bOut = outstanding[b.id] || 0;
      const exactA = Math.abs(aOut - line.inn) < 0.01 ? 0 : 1;
      const exactB = Math.abs(bOut - line.inn) < 0.01 ? 0 : 1;
      if (exactA !== exactB) return exactA - exactB;
      // Smallest outstanding >= amount
      const aFits = aOut >= line.inn - 0.01 ? 0 : 1;
      const bFits = bOut >= line.inn - 0.01 ? 0 : 1;
      if (aFits !== bFits) return aFits - bFits;
      if (aFits === 0 && bFits === 0) return aOut - bOut;
      return a.invoiceNumber - b.invoiceNumber;
    });

  if (matchingInvoices.length === 0) {
    console.error("NO MATCHING INVOICE for", line.description);
    continue;
  }

  const inv = matchingInvoices[0];
  const paidAmount = Math.min(line.inn, outstanding[inv.id] || 0);
  console.log(`  -> Invoice ${inv.id} (#${inv.invoiceNumber}), outstanding=${outstanding[inv.id]}, paying=${paidAmount}`);

  const payResult = await put(`invoice/${inv.id}/:payment?paymentDate=${line.date}&paymentTypeId=${payType.id}&paidAmount=${paidAmount}`);
  console.log("  Payment OK, new outstanding:", payResult.value?.amountCurrencyOutstanding);
  outstanding[inv.id] = payResult.value?.amountCurrencyOutstanding ?? (outstanding[inv.id] - paidAmount);
}

// Step 4 & 5: Combined voucher for supplier payments + non-invoice lines
const supplierLines = csvLines.filter(l => l.type === "supplier");
const nonInvoiceLines = csvLines.filter(l => l.type === "non-invoice");

// Build supplier lookup
const supplierMap: Record<string, any> = {};
for (const s of suppliers) {
  supplierMap[s.name?.toLowerCase() || ""] = s;
}

const postings: any[] = [];
let row = 1;

// Check if we have supplier invoices
if (suppInvoices.length > 0) {
  // TODO: handle supplier invoice payments via addPayment
  console.log("WARNING: supplier invoices found, should use addPayment path");
} else {
  // Supplier payments as voucher postings
  for (const line of supplierLines) {
    // Extract supplier name
    const nameMatch = line.description.match(/Supplier\s+(.+)/i);
    const suppName = nameMatch ? nameMatch[1].trim().toLowerCase() : "";

    // Find supplier
    const supplier = Object.entries(supplierMap).find(([k]) => k.includes(suppName) || suppName.includes(k));
    const suppId = supplier ? supplier[1].id : null;

    console.log(`\nSupplier payment: ${line.description} amount=${line.ut} supplier=${suppName} id=${suppId}`);

    if (!suppId) {
      console.error("NO MATCHING SUPPLIER for", line.description);
      continue;
    }

    // Debit 2400 (accounts payable), Credit 1920 (bank)
    postings.push({
      row: row++,
      date: line.date,
      description: line.description,
      account: { id: acct2400 },
      amountGross: line.ut,
      amountGrossCurrency: line.ut,
      supplier: { id: suppId },
    });
    postings.push({
      row: row++,
      date: line.date,
      description: line.description,
      account: { id: acct1920 },
      amountGross: -line.ut,
      amountGrossCurrency: -line.ut,
    });
  }
}

// Non-invoice postings
for (const line of nonInvoiceLines) {
  const desc = line.description;
  let contraAcctId: number;

  if (desc.match(/Renteinntekter/i)) {
    contraAcctId = acct8050;
  } else if (desc.match(/Bankgebyr/i)) {
    contraAcctId = acct7770;
  } else if (desc.match(/Skattetrekk/i)) {
    contraAcctId = acct2600;
  } else {
    console.error("Unknown non-invoice type:", desc);
    continue;
  }

  if (line.inn > 0) {
    // Inn (positive/incoming): bank 1920 debit (positive), contra credit (negative)
    postings.push({
      row: row++, date: line.date, description: desc,
      account: { id: acct1920 },
      amount: line.inn, amountCurrency: line.inn, amountGross: line.inn, amountGrossCurrency: line.inn,
    });
    postings.push({
      row: row++, date: line.date, description: desc,
      account: { id: contraAcctId },
      amount: -line.inn, amountCurrency: -line.inn, amountGross: -line.inn, amountGrossCurrency: -line.inn,
    });
  } else if (line.ut > 0) {
    // Ut (negative/outgoing): contra debit (positive), bank 1920 credit (negative)
    postings.push({
      row: row++, date: line.date, description: desc,
      account: { id: contraAcctId },
      amount: line.ut, amountCurrency: line.ut, amountGross: line.ut, amountGrossCurrency: line.ut,
    });
    postings.push({
      row: row++, date: line.date, description: desc,
      account: { id: acct1920 },
      amount: -line.ut, amountCurrency: -line.ut, amountGross: -line.ut, amountGrossCurrency: -line.ut,
    });
  }
}

// Find earliest supplier/non-invoice payment date for voucher date
const voucherLines = [...supplierLines, ...nonInvoiceLines];
const earliestDate = voucherLines.map(l => l.date).sort()[0];

if (postings.length > 0) {
  console.log(`\nCreating voucher with ${postings.length} postings, date=${earliestDate}`);
  const voucherResult = await post("ledger/voucher", {
    date: earliestDate,
    description: "Bank reconciliation - supplier payments",
    postings,
  });
  console.log("Voucher created:", voucherResult.value?.id);
}

// Step 6: Bank reconciliation
console.log(`\nCreating bank reconciliation, balance=${computedBalance}, period=${period.id}`);
try {
  const reconResult = await post("bank/reconciliation", {
    account: { id: acct1920 },
    accountingPeriod: { id: period.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: computedBalance,
    isClosed: true,
  });
  console.log("Bank reconciliation created:", reconResult.value?.id, "closed:", reconResult.value?.isClosed);
} catch (e: any) {
  console.error("Bank reconciliation failed, trying balance sheet fallback...");
  try {
    const bsResult = await get(`balanceSheet?dateFrom=${period.start}&dateTo=${period.end}&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*`);
    const actualBalance = bsResult.values?.[0]?.balanceOut ?? bsResult.values?.[0]?.closingBalance;
    console.log("Balance sheet 1920 balance:", actualBalance);
    if (actualBalance !== undefined) {
      const reconResult2 = await post("bank/reconciliation", {
        account: { id: acct1920 },
        accountingPeriod: { id: period.id },
        type: "MANUAL",
        bankAccountClosingBalanceCurrency: actualBalance,
        isClosed: true,
      });
      console.log("Bank reconciliation (fallback) created:", reconResult2.value?.id, "closed:", reconResult2.value?.isClosed);
    }
  } catch (e2: any) {
    console.error("Bank reconciliation fallback also failed:", e2.message);
  }
}

console.log("\n=== DONE ===");
