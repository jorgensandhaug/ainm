const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "OMbcxyWPqsYV1WDCwfFTSNImF60oBNhsvDr91fL0pNA";
const AUTH = "Basic " + btoa("0:" + TOKEN);

let callCount = 0;
let errorCount = 0;

async function api(method: string, path: string, body?: any, isFormData = false): Promise<any> {
  callCount++;
  const url = `${BASE}/${path}`;
  const headers: any = { Authorization: AUTH };
  if (body && !isFormData) headers["Content-Type"] = "application/json";
  const opts: any = { method, headers };
  if (body) opts.body = isFormData ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    errorCount++;
    console.error(`ERROR ${res.status} ${method} ${path}:`, typeof data === "string" ? data.substring(0, 300) : JSON.stringify(data).substring(0, 300));
  }
  return data;
}

const get = (p: string) => api("GET", p);
const post = (p: string, b?: any, isForm = false) => api("POST", p, b, isForm);
const put = (p: string, b: any) => api("PUT", p, b);

// Parse CSV
interface CsvLine {
  date: string; desc: string; inn: number; ut: number; saldo: number;
}

const csvText = `Dato;Forklaring;Inn;Ut;Saldo
2026-01-16;Innbetaling fra Pérez SL / Faktura 1001;30750.00;;130750.00
2026-01-17;Innbetaling fra López SL / Faktura 1002;4750.00;;135500.00
2026-01-19;Innbetaling fra García SL / Faktura 1003;2225.00;;137725.00
2026-01-22;Innbetaling fra Romero SL / Faktura 1004;12750.00;;150475.00
2026-01-23;Innbetaling fra Torres SL / Faktura 1005;6500.00;;156975.00
2026-01-25;Betaling Proveedor González SL;;-19550.00;137425.00
2026-01-27;Betaling Proveedor Torres SL;;-19700.00;117725.00
2026-01-30;Betaling Proveedor Martínez SL;;-13200.00;104525.00
2026-02-01;Bankgebyr;1558.00;;106083.00
2026-02-02;Renteinntekter;1313.23;;107396.23
2026-02-04;Skattetrekk;389.79;;107786.02`;

const csvLines: CsvLine[] = csvText.trim().split("\n").slice(1).map(line => {
  const [date, desc, inn, ut, saldo] = line.split(";");
  return {
    date, desc,
    inn: inn ? parseFloat(inn) : 0,
    ut: ut ? parseFloat(ut) : 0,
    saldo: parseFloat(saldo),
  };
});

const openingBalance = csvLines[0].saldo - csvLines[0].inn + Math.abs(csvLines[0].ut || 0);
const closingBalance = Math.round(csvLines[csvLines.length - 1].saldo * 100) / 100;
const firstCsvDate = csvLines[0].date;
const lastCsvDate = csvLines[csvLines.length - 1].date;

// Day after last CSV date for toDate
const lastD = new Date(lastCsvDate);
lastD.setDate(lastD.getDate() + 1);
const dayAfterLast = lastD.toISOString().split("T")[0];

// Next month first day for posting query
const nextMonthFirst = "2026-03-01";

// Accounting period: first-of-month of last CSV entry
const lastMonth = lastCsvDate.substring(0, 7); // "2026-02"
const periodStart = lastMonth + "-01";
const periodStartNext = lastMonth + "-02";

console.log(`Opening balance: ${openingBalance}, Closing balance: ${closingBalance}`);
console.log(`CSV lines: ${csvLines.length}, Date range: ${firstCsvDate} to ${lastCsvDate}`);

// Classify lines
const customerLines = csvLines.filter(l => l.desc.startsWith("Innbetaling fra"));
const supplierLines = csvLines.filter(l => l.desc.startsWith("Betaling Proveedor"));
const nonInvoiceLines = csvLines.filter(l =>
  !l.desc.startsWith("Innbetaling fra") && !l.desc.startsWith("Betaling Proveedor")
);

console.log(`Customer: ${customerLines.length}, Supplier: ${supplierLines.length}, Non-invoice: ${nonInvoiceLines.length}`);

// ==================== STEP 1: 6 parallel reads ====================
const [invoicesRes, payTypesRes, suppliersRes, suppInvRes, accountsRes, periodRes] = await Promise.all([
  get("invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
  get("invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
  get("supplier?count=1000&fields=*"),
  get("supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
  get("ledger/account?number=1920,2050,2400,2600,7770,8050&fields=*"),
  get(`ledger/accountingPeriod?startFrom=${periodStart}&startTo=${periodStartNext}&count=1&fields=*`),
]);

const invoices = invoicesRes.values || [];
const payTypes = payTypesRes.values || [];
const suppliers = suppliersRes.values || [];
const suppInvoices = suppInvRes.values || [];
const accounts = accountsRes.values || [];
const periods = periodRes.values || [];

console.log(`Invoices: ${invoices.length}, PayTypes: ${payTypes.length}, Suppliers: ${suppliers.length}, SuppInv: ${suppInvoices.length}`);
console.log(`Accounts: ${accounts.map((a: any) => `${a.number}=${a.id}`).join(", ")}`);
console.log(`Period: ${periods.length > 0 ? `id=${periods[0].id}` : "NONE"}`);

const acctMap: Record<number, number> = {};
for (const a of accounts) acctMap[a.number] = a.id;
const acct1920Id = acctMap[1920];
const acct2050Id = acctMap[2050];
const acct2400Id = acctMap[2400];
const acct2600Id = acctMap[2600];
const acct7770Id = acctMap[7770];
const acct8050Id = acctMap[8050];
const period = periods[0];

// ==================== STEP 0: Opening balance voucher ====================
if (openingBalance !== 0) {
  console.log(`\nSTEP 0: Posting opening balance: ${openingBalance}`);
  const obRes = await post("ledger/voucher", {
    date: firstCsvDate,
    description: "Inngående balanse",
    postings: [
      {
        row: 1, date: firstCsvDate, description: "Inngående balanse",
        account: { id: acct1920Id },
        amount: openingBalance, amountCurrency: openingBalance,
        amountGross: openingBalance, amountGrossCurrency: openingBalance,
        currency: { id: 1 },
      },
      {
        row: 2, date: firstCsvDate, description: "Inngående balanse",
        account: { id: acct2050Id },
        amount: -openingBalance, amountCurrency: -openingBalance,
        amountGross: -openingBalance, amountGrossCurrency: -openingBalance,
        currency: { id: 1 },
      },
    ],
  });
  console.log(`Opening balance voucher: ${obRes?.value?.id || "ERROR"}`);
}

// ==================== STEP 2: Select payment type ====================
const payType = payTypes.find((pt: any) => pt.debitAccount?.number === 1920);
console.log(`\nSTEP 2: Payment type: ${payType?.id} (${payType?.description})`);

// ==================== STEP 3: Match and pay customer invoices ====================
console.log(`\nSTEP 3: Paying customer invoices`);
// Track outstanding amounts locally
const outstandingTracker: Record<number, number> = {};
for (const inv of invoices) {
  outstandingTracker[inv.id] = inv.amountCurrencyOutstanding || inv.amountOutstanding || 0;
}

for (const line of customerLines) {
  // Extract customer name: "Innbetaling fra Pérez SL / Faktura 1001" -> "Pérez SL"
  const match = line.desc.match(/Innbetaling fra (.+?) \/ Faktura/);
  const custName = match ? match[1].trim() : "";
  const amount = line.inn;

  // Find matching invoice by customer name
  const candidates = invoices.filter((inv: any) => {
    const invCustName = inv.customer?.name || "";
    return invCustName.toLowerCase().includes(custName.toLowerCase()) && outstandingTracker[inv.id] > 0.01;
  });

  // Priority: exact outstanding match → smallest outstanding >= amount → lowest invoiceNumber
  let bestInv = candidates.find((inv: any) => Math.abs(outstandingTracker[inv.id] - amount) < 0.01);
  if (!bestInv) {
    const larger = candidates.filter((inv: any) => outstandingTracker[inv.id] >= amount - 0.01);
    larger.sort((a: any, b: any) => outstandingTracker[a.id] - outstandingTracker[b.id]);
    bestInv = larger[0] || candidates.sort((a: any, b: any) => a.invoiceNumber - b.invoiceNumber)[0];
  }

  if (bestInv) {
    const paidAmount = Math.min(amount, outstandingTracker[bestInv.id]);
    console.log(`  Paying invoice ${bestInv.invoiceNumber} (id=${bestInv.id}) for ${custName}: ${paidAmount} (outstanding: ${outstandingTracker[bestInv.id]})`);
    const payRes = await put(
      `invoice/${bestInv.id}/:payment?paymentDate=${line.date}&paymentTypeId=${payType.id}&paidAmount=${paidAmount}`,
      {}
    );
    if (payRes?.value) {
      outstandingTracker[bestInv.id] -= paidAmount;
      console.log(`    OK`);
    } else {
      console.log(`    FAILED`);
    }
  } else {
    console.log(`  NO MATCH for ${custName} / ${amount}`);
  }
}

// ==================== STEPS 4+5: Combined voucher for supplier + non-invoice ====================
console.log(`\nSTEPS 4+5: Combined voucher for suppliers + non-invoice lines`);

// Build supplier name -> supplier id map
const supplierMap: Record<string, number> = {};
for (const s of suppliers) {
  supplierMap[s.name.toLowerCase()] = s.id;
}

const postings: any[] = [];
let row = 1;

// Supplier payments (no supplier invoices expected in common case)
for (const line of supplierLines) {
  // Extract supplier name: "Betaling Proveedor González SL" -> "González SL"
  const supplierName = line.desc.replace("Betaling Proveedor ", "").trim();
  const amount = Math.abs(line.ut); // ut is negative

  // Find supplier by name
  const suppId = Object.entries(supplierMap).find(([name]) =>
    name.includes(supplierName.toLowerCase())
  )?.[1];

  console.log(`  Supplier: ${supplierName} -> id=${suppId}, amount=${amount}`);

  postings.push({
    row: row++, date: line.date, description: line.desc,
    account: { id: acct2400Id },
    amount: amount, amountCurrency: amount,
    amountGross: amount, amountGrossCurrency: amount,
    ...(suppId ? { supplier: { id: suppId } } : {}),
    currency: { id: 1 },
  });
  postings.push({
    row: row++, date: line.date, description: line.desc,
    account: { id: acct1920Id },
    amount: -amount, amountCurrency: -amount,
    amountGross: -amount, amountGrossCurrency: -amount,
    currency: { id: 1 },
  });
}

// Non-invoice lines
for (const line of nonInvoiceLines) {
  const isIncoming = line.inn > 0;
  const absAmount = isIncoming ? line.inn : Math.abs(line.ut);
  let contraAcctId: number;

  if (line.desc.includes("Bankgebyr")) {
    contraAcctId = acct7770Id;
  } else if (line.desc.includes("Renteinntekter")) {
    contraAcctId = acct8050Id;
  } else if (line.desc.includes("Skattetrekk")) {
    contraAcctId = acct2600Id;
  } else {
    console.log(`  Unknown non-invoice line: ${line.desc}`);
    contraAcctId = acct7770Id;
  }

  if (isIncoming) {
    // Inn: bank 1920 debit (positive), contra credit (negative)
    postings.push({
      row: row++, date: line.date, description: line.desc,
      account: { id: acct1920Id },
      amount: absAmount, amountCurrency: absAmount,
      amountGross: absAmount, amountGrossCurrency: absAmount,
      currency: { id: 1 },
    });
    postings.push({
      row: row++, date: line.date, description: line.desc,
      account: { id: contraAcctId },
      amount: -absAmount, amountCurrency: -absAmount,
      amountGross: -absAmount, amountGrossCurrency: -absAmount,
      currency: { id: 1 },
    });
  } else {
    // Ut: contra debit (positive), bank 1920 credit (negative)
    postings.push({
      row: row++, date: line.date, description: line.desc,
      account: { id: contraAcctId },
      amount: absAmount, amountCurrency: absAmount,
      amountGross: absAmount, amountGrossCurrency: absAmount,
      currency: { id: 1 },
    });
    postings.push({
      row: row++, date: line.date, description: line.desc,
      account: { id: acct1920Id },
      amount: -absAmount, amountCurrency: -absAmount,
      amountGross: -absAmount, amountGrossCurrency: -absAmount,
      currency: { id: 1 },
    });
  }
}

if (postings.length > 0) {
  const earliestDate = supplierLines.length > 0 ? supplierLines[0].date : nonInvoiceLines[0].date;
  const voucherRes = await post("ledger/voucher", {
    date: earliestDate,
    description: "Bank reconciliation - supplier payments",
    postings,
  });
  console.log(`Combined voucher: ${voucherRes?.value?.id || "ERROR"}`);
  if (!voucherRes?.value) console.error("Voucher error:", JSON.stringify(voucherRes).substring(0, 500));
}

// ==================== STEP 6: Import bank statement ====================
console.log(`\nSTEP 6: Importing bank statement`);

function toSbankenBedriftCsv(lines: CsvLine[]): string {
  const firstDate = lines[0].date.split("-").reverse().join(".");
  const lastDate2 = lines[lines.length - 1].date.split("-").reverse().join(".");
  const openSaldo = lines[0].saldo - lines[0].inn + Math.abs(lines[0].ut || 0);
  const closeSaldo = lines[lines.length - 1].saldo;

  const fmt = (n: number) => n.toFixed(2).replace(".", ",");
  let out = `"Inngående saldo ${firstDate}";"${fmt(openSaldo)}"\n`;
  out += `"Utgående saldo ${lastDate2}";"${fmt(closeSaldo)}"\n`;
  out += `"Bokført";"Rentedato";"Beskrivelse";"Beløp"\n`;
  for (const l of lines) {
    const d = l.date.split("-").reverse().join(".");
    const amount = l.inn > 0 ? l.inn : l.ut; // Ut is already negative
    out += `"${d}";"${d}";"${l.desc}";"${fmt(amount)}"\n`;
  }
  return out;
}

const sbankenCsv = toSbankenBedriftCsv(csvLines);
console.log("Sbanken CSV preview:\n" + sbankenCsv.substring(0, 500));

const formData = new FormData();
formData.append("file", new Blob([sbankenCsv], { type: "text/csv" }), "bankstatement.csv");
const importUrl = `bank/statement/import?bankId=112&accountId=${acct1920Id}&fromDate=${firstCsvDate}&toDate=${dayAfterLast}&fileFormat=SBANKEN_BEDRIFT_CSV`;
const importRes = await post(importUrl, formData, true);
const bankStatementId = importRes?.value?.id;
console.log(`Bank statement imported: id=${bankStatementId}`);

if (!bankStatementId) {
  console.error("Import failed:", JSON.stringify(importRes).substring(0, 500));
}

// ==================== STEP 7: Match bank transactions to ledger postings ====================
console.log(`\nSTEP 7: Matching bank transactions to ledger postings`);

// Get all postings on 1920 and bank transactions in parallel
const [postingsRes, bankTxnRes] = await Promise.all([
  get(`ledger/posting?accountId=${acct1920Id}&dateFrom=${firstCsvDate}&dateTo=${nextMonthFirst}&count=1000&fields=id,date,amount,description`),
  get(`bank/statement/transaction?bankStatementId=${bankStatementId}&count=1000&fields=id,postedDate,amountCurrency,description`),
]);

const allPostings1920 = postingsRes.values || [];
const bankTxns = bankTxnRes.values || [];
console.log(`Postings on 1920: ${allPostings1920.length}, Bank transactions: ${bankTxns.length}`);

// Create OPEN reconciliation
const createReconRes = await post("bank/reconciliation", {
  account: { id: acct1920Id },
  accountingPeriod: { id: period.id },
  type: "MANUAL",
  bankAccountClosingBalanceCurrency: 0,
  isClosed: false,
});
const recon = createReconRes.value;
console.log(`Reconciliation created: id=${recon?.id}`);

// Match each bank txn to posting with SAME amount on 1920
const usedPostingIds = new Set<number>();
let matchCount = 0;

for (const txn of bankTxns) {
  const matchPosting = allPostings1920.find((p: any) =>
    Math.abs(p.amount - txn.amountCurrency) < 0.01 && !usedPostingIds.has(p.id)
  );
  if (matchPosting) {
    usedPostingIds.add(matchPosting.id);
    const matchRes = await post("bank/reconciliation/match", {
      bankReconciliation: { id: recon.id },
      transactions: [{ id: txn.id }],
      postings: [{ id: matchPosting.id }],
    });
    matchCount++;
    if (matchRes?.value) {
      // OK
    } else {
      console.error(`Match failed for txn ${txn.id} (${txn.amountCurrency}):`, JSON.stringify(matchRes).substring(0, 200));
    }
  } else {
    console.log(`  No posting match for bank txn ${txn.id}: amount=${txn.amountCurrency}, desc=${txn.description}`);
  }
}
console.log(`Matched: ${matchCount}/${bankTxns.length}`);

// ==================== STEP 8: Close bank reconciliation ====================
console.log(`\nSTEP 8: Closing bank reconciliation`);

// GET fresh version
const freshRecon = await get(`bank/reconciliation/${recon.id}?fields=*`);
console.log(`Fresh recon version: ${freshRecon?.value?.version}`);

const closeRes = await put(`bank/reconciliation/${recon.id}`, {
  id: recon.id,
  version: freshRecon.value.version,
  account: { id: acct1920Id },
  accountingPeriod: { id: period.id },
  type: "MANUAL",
  bankAccountClosingBalanceCurrency: closingBalance,
  isClosed: true,
});

if (closeRes?.value) {
  console.log(`Reconciliation CLOSED successfully. id=${closeRes.value.id}`);
} else {
  console.error(`Close failed:`, JSON.stringify(closeRes).substring(0, 500));

  // Fallback: read balance sheet
  console.log("Fallback: reading balance sheet...");
  const bsRes = await get(`balanceSheet?dateFrom=${periodStart}&dateTo=${lastCsvDate}&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*`);
  const actualBalance = bsRes?.values?.[0]?.balanceOut;
  console.log(`Balance sheet balance: ${actualBalance}`);
  if (actualBalance !== undefined) {
    const freshRecon2 = await get(`bank/reconciliation/${recon.id}?fields=*`);
    const closeRes2 = await put(`bank/reconciliation/${recon.id}`, {
      id: recon.id,
      version: freshRecon2.value.version,
      account: { id: acct1920Id },
      accountingPeriod: { id: period.id },
      type: "MANUAL",
      bankAccountClosingBalanceCurrency: Math.round(actualBalance * 100) / 100,
      isClosed: true,
    });
    console.log(`Fallback close: ${closeRes2?.value ? "SUCCESS" : "FAILED"}`);
  }
}

console.log(`\n=== DONE: ${callCount} API calls, ${errorCount} errors ===`);
