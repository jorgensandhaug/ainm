/**
 * Pre-built bank reconciliation script for Task 23.
 * v2: Optimized with batch matching (L→P calls) + combined OB+supplier voucher (2→1 call).
 * Sandbox-verified: batch match 5-in-1 → 201, combined voucher → 201 (2026-03-22).
 * Production v1 (a986e65f): 20 mutating, 0 errors, 10/10 matches. v2 target: ~10 mutating.
 *
 * Usage: bun reconcile-bank-statement.ts <BASE_URL> <TOKEN> <CSV_FILE_PATH>
 */

const BASE = process.argv[2]?.replace(/\/+$/, "");
const TOKEN = process.argv[3];
const CSV_PATH = process.argv[4];

if (!BASE || !TOKEN || !CSV_PATH) {
  console.error("Usage: bun reconcile-bank-statement.ts <BASE_URL> <TOKEN> <CSV_FILE_PATH>");
  process.exit(1);
}

const AUTH = "Basic " + btoa("0:" + TOKEN);
let getCount = 0;
let mutateCount = 0;
let errorCount = 0;

async function api(method: string, path: string, body?: any, isForm = false): Promise<any> {
  if (method === "GET") getCount++; else mutateCount++;
  const url = `${BASE}/${path}`;
  const headers: any = { Authorization: AUTH };
  if (body && !isForm) headers["Content-Type"] = "application/json";
  const opts: any = { method, headers };
  if (body) opts.body = isForm ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    errorCount++;
    console.error(`ERR ${res.status} ${method} /${path.split("?")[0]}: ${typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

const get = (p: string) => api("GET", p);
const post = (p: string, b?: any, isForm = false) => api("POST", p, b, isForm);
const put = (p: string, b: any) => api("PUT", p, b);

// ── CSV parsing ──

interface CsvLine {
  date: string; desc: string; inn: number; ut: number; saldo: number;
}

const fs = await import("fs");
const csvRaw = fs.readFileSync(CSV_PATH, "utf-8");
const csvLines: CsvLine[] = csvRaw.trim().split("\n").slice(1).filter(l => l.trim()).map(line => {
  const [date, desc, inn, ut, saldo] = line.split(";");
  return {
    date: date.trim(), desc: desc.trim(),
    inn: inn?.trim() ? parseFloat(inn) : 0,
    ut: ut?.trim() ? parseFloat(ut) : 0,
    saldo: parseFloat(saldo),
  };
});

const openingBalance = csvLines[0].saldo - csvLines[0].inn + Math.abs(csvLines[0].ut || 0);
const closingBalance = Math.round(csvLines[csvLines.length - 1].saldo * 100) / 100;
const firstCsvDate = csvLines[0].date;
const lastCsvDate = csvLines[csvLines.length - 1].date;
const dayAfterLast = (() => { const d = new Date(lastCsvDate); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; })();

// Classify lines
const customerLines = csvLines.filter(l => /Innbetaling fra/i.test(l.desc));
const supplierLines = csvLines.filter(l => /Betaling\s+(Proveedor|Supplier|Leverandor|Lieferant|Fournisseur|Fornecedor)\s/i.test(l.desc));
const nonInvoiceLines = csvLines.filter(l =>
  !customerLines.includes(l) && !supplierLines.includes(l)
);

// Determine unique months for cross-month reconciliation
const months = [...new Set(csvLines.map(l => l.date.substring(0, 7)))].sort();

console.log(`\n=== CSV PARSED ===`);
console.log(`Lines: ${csvLines.length} | Range: ${firstCsvDate} → ${lastCsvDate}`);
console.log(`Opening balance: ${openingBalance} | Closing balance: ${closingBalance}`);
console.log(`Customer payments: ${customerLines.length} | Supplier payments: ${supplierLines.length} | Non-invoice: ${nonInvoiceLines.length}`);
console.log(`Months: ${months.join(", ")}`);
for (const line of csvLines) {
  const amt = line.inn > 0 ? `+${line.inn}` : `${line.ut}`;
  console.log(`  ${line.date} | ${amt.padStart(12)} | ${line.saldo.toString().padStart(12)} | ${line.desc}`);
}

// ── STEP 1: Parallel reads (single wide period query covers all months) ──

console.log(`\n=== STEP 1: Initial reads ===`);

const [invoicesRes, payTypesRes, suppliersRes, suppInvRes, accountsRes, periodsRes] = await Promise.all([
  get("invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
  get("invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
  get("supplier?count=1000&fields=*"),
  get("supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
  get("ledger/account?number=1920,2050,2400,2600,7770,8050&fields=*"),
  get(`ledger/accountingPeriod?startFrom=${months[0]}-01&startTo=${months[months.length - 1]}-02&count=12&fields=*`),
]);

const invoices = invoicesRes.values || [];
const payTypes = payTypesRes.values || [];
const suppliers = suppliersRes.values || [];
const suppInvoices = suppInvRes.values || [];
const accounts = accountsRes.values || [];

const acctMap: Record<number, number> = {};
for (const a of accounts) acctMap[a.number] = a.id;

// Period map: "YYYY-MM" → period object (from single wide query)
const periodMap: Record<string, any> = {};
for (const p of (periodsRes.values || [])) {
  const m = (p.start || "").substring(0, 7);
  if (months.includes(m)) periodMap[m] = p;
}

console.log(`Accounts: ${Object.entries(acctMap).map(([n,id]) => `${n}=${id}`).join(", ")}`);
console.log(`Periods: ${Object.entries(periodMap).map(([m,p]) => `${m} → id=${p.id} (${p.start} to ${p.end})`).join(", ")}`);
console.log(`Invoices found: ${invoices.length} | Supplier invoices: ${suppInvoices.length} | Suppliers: ${suppliers.length}`);
console.log(`Payment types: ${payTypes.map((pt: any) => `${pt.description}(debit=${pt.debitAccount?.number})`).join(", ")}`);

// Log invoices with outstanding amounts (these are candidates for matching)
const outstandingInvs = invoices.filter((inv: any) => (inv.amountCurrencyOutstanding ?? inv.amountOutstanding ?? 0) > 0.01);
console.log(`Outstanding invoices: ${outstandingInvs.length}`);
for (const inv of outstandingInvs) {
  console.log(`  Inv #${inv.invoiceNumber} | ${inv.customer?.name} | outstanding=${inv.amountCurrencyOutstanding ?? inv.amountOutstanding} | total=${inv.amount}`);
}

// ── STEP 2: Payment type ──

const payType = payTypes.find((pt: any) => pt.debitAccount?.number === 1920);
if (!payType) { console.error("No payment type with debitAccount 1920"); process.exit(1); }
console.log(`\nPayment type: id=${payType.id} "${payType.description}" debit=${payType.debitAccount?.number}`);

// ── STEPS 0+4+5: COMBINED VOUCHER (OB + suppliers + non-invoice) — ONE POST ──

console.log(`\n=== STEPS 0+4+5: Combined voucher (OB + suppliers + non-invoice) ===`);

const supplierMap: Record<string, number> = {};
for (const s of suppliers) supplierMap[s.name.toLowerCase()] = s.id;

const voucherPostings: any[] = [];
let row = 1;

// OB postings (DR 1920 / CR 2050)
if (openingBalance !== 0) {
  voucherPostings.push({
    row: row++, date: firstCsvDate, description: "Inngående balanse", account: { id: acctMap[1920] },
    amount: openingBalance, amountCurrency: openingBalance, amountGross: openingBalance, amountGrossCurrency: openingBalance, currency: { id: 1 },
  });
  voucherPostings.push({
    row: row++, date: firstCsvDate, description: "Inngående balanse", account: { id: acctMap[2050] },
    amount: -openingBalance, amountCurrency: -openingBalance, amountGross: -openingBalance, amountGrossCurrency: -openingBalance, currency: { id: 1 },
  });
  console.log(`  OB: ${openingBalance} (DR 1920 / CR 2050) on ${firstCsvDate}`);
}

// Supplier payment postings (DR 2400 / CR 1920)
for (const line of supplierLines) {
  const supplierName = line.desc.replace(/Betaling\s+(Proveedor|Supplier|Leverandor|Lieferant|Fournisseur|Fornecedor)\s+/i, "").trim();
  const amount = Math.abs(line.ut);
  const suppId = Object.entries(supplierMap).find(([name]) => name.includes(supplierName.toLowerCase()))?.[1];

  console.log(`  Supplier: "${supplierName}" amount=${amount} supplierId=${suppId || "NOT FOUND"}`);

  voucherPostings.push({
    row: row++, date: line.date, description: `Betaling ${supplierName}`, account: { id: acctMap[2400] },
    amount, amountCurrency: amount, amountGross: amount, amountGrossCurrency: amount,
    ...(suppId ? { supplier: { id: suppId } } : {}), currency: { id: 1 },
  });
  voucherPostings.push({
    row: row++, date: line.date, description: `Betaling ${supplierName}`, account: { id: acctMap[1920] },
    amount: -amount, amountCurrency: -amount, amountGross: -amount, amountGrossCurrency: -amount, currency: { id: 1 },
  });
}

// Non-invoice postings
const contraAcctMap: Record<string, number> = {
  Bankgebyr: acctMap[7770], Renteinntekter: acctMap[8050], Skattetrekk: acctMap[2600],
};

for (const line of nonInvoiceLines) {
  const isIncoming = line.inn > 0;
  const absAmount = isIncoming ? line.inn : Math.abs(line.ut);
  const keyword = Object.keys(contraAcctMap).find(k => line.desc.includes(k)) || "Bankgebyr";
  const contraId = contraAcctMap[keyword] || acctMap[7770];

  console.log(`  Non-invoice: "${line.desc}" amount=${isIncoming ? "+" : "-"}${absAmount} contra=${keyword}`);

  if (isIncoming) {
    voucherPostings.push({ row: row++, date: line.date, description: line.desc, account: { id: acctMap[1920] },
      amount: absAmount, amountCurrency: absAmount, amountGross: absAmount, amountGrossCurrency: absAmount, currency: { id: 1 } });
    voucherPostings.push({ row: row++, date: line.date, description: line.desc, account: { id: contraId },
      amount: -absAmount, amountCurrency: -absAmount, amountGross: -absAmount, amountGrossCurrency: -absAmount, currency: { id: 1 } });
  } else {
    voucherPostings.push({ row: row++, date: line.date, description: line.desc, account: { id: contraId },
      amount: absAmount, amountCurrency: absAmount, amountGross: absAmount, amountGrossCurrency: absAmount, currency: { id: 1 } });
    voucherPostings.push({ row: row++, date: line.date, description: line.desc, account: { id: acctMap[1920] },
      amount: -absAmount, amountCurrency: -absAmount, amountGross: -absAmount, amountGrossCurrency: -absAmount, currency: { id: 1 } });
  }
}

let combinedVoucherId: number | null = null;
if (voucherPostings.length > 0) {
  const vRes = await post("ledger/voucher", { date: firstCsvDate, description: "Bank reconciliation", postings: voucherPostings });
  combinedVoucherId = vRes?.value?.id;
  console.log(`Combined voucher: id=${combinedVoucherId || "ERROR"} (${voucherPostings.length} postings)`);

  // Verify combined voucher
  if (combinedVoucherId) {
    const cvVerify = await get(`ledger/voucher/${combinedVoucherId}?fields=*,postings(*)`);
    const cvPostings = cvVerify?.value?.postings || [];
    console.log(`  Verified: ${cvPostings.length} postings on voucher ${combinedVoucherId}`);
    for (const p of cvPostings) {
      console.log(`    row=${p.row} acct=${p.account?.number || p.account?.id} amount=${p.amount} desc="${p.description}"`);
    }
  }
}

// ── STEP 3: Customer payments (parallel) ──

console.log(`\n=== STEP 3: Customer payments ===`);

const outstandingTracker: Record<number, number> = {};
for (const inv of invoices) outstandingTracker[inv.id] = inv.amountCurrencyOutstanding ?? inv.amountOutstanding ?? 0;

// Build payment plan first (sequential matching to avoid double-booking), then fire all at once
const paymentPlan: { invId: number; invNum: number; amount: number; date: string; custName: string }[] = [];
for (const line of customerLines) {
  const match = line.desc.match(/Innbetaling fra (.+?) \/ Faktura/);
  const custName = match ? match[1].trim() : "";
  const amount = line.inn;

  const candidates = invoices.filter((inv: any) =>
    (inv.customer?.name || "").toLowerCase().includes(custName.toLowerCase()) && outstandingTracker[inv.id] > 0.01
  );

  let best = candidates.find((inv: any) => Math.abs(outstandingTracker[inv.id] - amount) < 0.01);
  if (!best) {
    const larger = candidates.filter((inv: any) => outstandingTracker[inv.id] >= amount - 0.01);
    larger.sort((a: any, b: any) => outstandingTracker[a.id] - outstandingTracker[b.id]);
    best = larger[0] || candidates.sort((a: any, b: any) => a.invoiceNumber - b.invoiceNumber)[0];
  }

  if (best) {
    const paidAmount = Math.min(amount, outstandingTracker[best.id]);
    outstandingTracker[best.id] -= paidAmount;
    paymentPlan.push({ invId: best.id, invNum: best.invoiceNumber, amount: paidAmount, date: line.date, custName });
    console.log(`  Plan: inv #${best.invoiceNumber} ← ${paidAmount} from "${custName}" on ${line.date}`);
  } else {
    console.log(`  WARNING: No invoice match for "${custName}" amount=${amount}`);
  }
}

const payResults = await Promise.all(
  paymentPlan.map(p => put(`invoice/${p.invId}/:payment?paymentDate=${p.date}&paymentTypeId=${payType.id}&paidAmount=${p.amount}`, {}))
);
payResults.forEach((pr, i) => {
  const p = paymentPlan[i];
  console.log(`  Pay inv #${p.invNum}: ${p.amount} for "${p.custName}" → ${pr?.value ? "OK" : "FAIL"}`);
});

// Verify: GET each paid invoice to confirm outstanding went to 0
console.log(`\n  --- Verifying invoice payments ---`);
const payVerifyResults = await Promise.all(
  paymentPlan.map(p => get(`invoice/${p.invId}?fields=id,invoiceNumber,amount,amountOutstanding,amountCurrencyOutstanding`))
);
for (let i = 0; i < paymentPlan.length; i++) {
  const p = paymentPlan[i];
  const inv = payVerifyResults[i]?.value;
  if (inv) {
    const outstanding = inv.amountCurrencyOutstanding ?? inv.amountOutstanding ?? "?";
    console.log(`  Inv #${inv.invoiceNumber}: total=${inv.amount} outstanding=${outstanding} ${outstanding === 0 || outstanding === 0.0 ? "✓ PAID" : "⚠ STILL OUTSTANDING"}`);
  }
}

// ── STEP 6: Bank statement import ──

console.log(`\n=== STEP 6: Bank statement import ===`);

function toSbankenCsv(lines: CsvLine[]): string {
  const fmt = (n: number) => n.toFixed(2).replace(".", ",");
  const fmtDate = (d: string) => d.split("-").reverse().join(".");
  const openSaldo = lines[0].saldo - lines[0].inn + Math.abs(lines[0].ut || 0);
  const closeSaldo = lines[lines.length - 1].saldo;
  let out = `"Inngående saldo ${fmtDate(lines[0].date)}";"${fmt(openSaldo)}"\n`;
  out += `"Utgående saldo ${fmtDate(lines[lines.length - 1].date)}";"${fmt(closeSaldo)}"\n`;
  out += `"Bokført";"Rentedato";"Beskrivelse";"Beløp"\n`;
  for (const l of lines) {
    const d = fmtDate(l.date);
    const amount = l.inn > 0 ? l.inn : l.ut; // Ut already negative
    out += `"${d}";"${d}";"${l.desc}";"${fmt(amount)}"\n`;
  }
  return out;
}

const sbankenCsv = toSbankenCsv(csvLines);
console.log(`Sbanken CSV (${sbankenCsv.split("\n").length - 1} lines):`);
for (const line of sbankenCsv.split("\n").filter(l => l.trim())) {
  console.log(`  ${line}`);
}

const formData = new FormData();
formData.append("file", new Blob([sbankenCsv], { type: "text/csv" }), "bankstatement.csv");
const importRes = await post(
  `bank/statement/import?bankId=112&accountId=${acctMap[1920]}&fromDate=${firstCsvDate}&toDate=${dayAfterLast}&fileFormat=SBANKEN_BEDRIFT_CSV`,
  formData, true
);
const bankStatementId = importRes?.value?.id;
console.log(`Bank import: id=${bankStatementId}`);

if (!bankStatementId) {
  console.error("Bank import failed — skipping Steps 7-8");
  console.log(`\nDONE: ${mutateCount} mutating calls + ${getCount} GETs = ${mutateCount + getCount} total, ${errorCount} errors`);
  process.exit(0);
}

// Verify: GET imported bank statement and its transactions
const bsVerify = await get(`bank/statement/${bankStatementId}?fields=*`);
console.log(`  Verified bank statement: id=${bsVerify?.value?.id} fromDate=${bsVerify?.value?.fromDate} toDate=${bsVerify?.value?.toDate}`);

// Use import response txn IDs positionally (matches CSV order)
const importTxnIds: number[] = (importRes?.value?.transactions || []).map((t: any) => t.id);
console.log(`  Import returned ${importTxnIds.length} transaction IDs: [${importTxnIds.join(", ")}]`);

// GET each transaction to verify amounts match CSV
const txnVerifyResults = await Promise.all(
  importTxnIds.map(id => get(`bank/statement/transaction/${id}?fields=*`))
);
console.log(`\n  --- Verifying imported transactions ---`);
for (let i = 0; i < txnVerifyResults.length; i++) {
  const txn = txnVerifyResults[i]?.value;
  const csv = csvLines[i];
  if (txn && csv) {
    const csvAmt = csv.inn > 0 ? csv.inn : csv.ut;
    const match = Math.abs((txn.amountCurrency || txn.amount || 0) - csvAmt) < 0.01;
    console.log(`  Txn ${txn.id}: amount=${txn.amountCurrency || txn.amount} desc="${txn.description || ""}" | CSV: ${csvAmt} "${csv.desc}" ${match ? "MATCH" : "MISMATCH"}`);
  }
}

// ── STEP 7: Create recons + BATCH match ──

console.log(`\n=== STEP 7: Create recons + batch match ===`);

const postingsRes = await get(`ledger/posting?accountId=${acctMap[1920]}&dateFrom=${firstCsvDate}&dateTo=${dayAfterLast}&count=1000&fields=id,date,amount,description`);
const allPostings1920 = postingsRes.values || [];
console.log(`Ledger postings on 1920 (${firstCsvDate} to ${dayAfterLast}): ${allPostings1920.length}`);
for (const p of allPostings1920) {
  console.log(`  posting id=${p.id} date=${p.date} amount=${p.amount} desc="${p.description}"`);
}

// Create reconciliations per month in parallel (cross-month CSVs need separate recons)
const reconEntries = await Promise.all(
  months.filter(m => periodMap[m]).map(async m => {
    const res = await post("bank/reconciliation", {
      account: { id: acctMap[1920] },
      accountingPeriod: { id: periodMap[m].id },
      type: "MANUAL",
      bankAccountClosingBalanceCurrency: 0,
      isClosed: false,
    });
    return [m, res.value] as const;
  })
);
const reconByMonth: Record<string, any> = Object.fromEntries(reconEntries);
console.log(`Recons created: ${Object.entries(reconByMonth).map(([m,r]) => `${m} → id=${r?.id} v=${r?.version}`).join(", ")}`);

// Build match pairs grouped by month for BATCH matching
const usedPostingIds = new Set<number>();
const matchesByMonth: Record<string, { txnIds: number[], postingIds: number[] }> = {};

for (let i = 0; i < csvLines.length; i++) {
  const txnId = importTxnIds[i];
  if (!txnId) { console.log(`  No txn ID for CSV line ${i} — skipping`); continue; }

  const csvAmount = csvLines[i].inn > 0 ? csvLines[i].inn : csvLines[i].ut;
  const matchPosting = allPostings1920.find((p: any) =>
    Math.abs(p.amount - csvAmount) < 0.01 && !usedPostingIds.has(p.id)
  );
  if (!matchPosting) { console.log(`  No posting match for line ${i}: amount=${csvAmount} "${csvLines[i].desc}"`); continue; }
  usedPostingIds.add(matchPosting.id);

  const lineMonth = csvLines[i].date.substring(0, 7);
  const recon = reconByMonth[lineMonth];
  if (!recon) { console.log(`  No recon for month ${lineMonth}`); continue; }

  if (!matchesByMonth[lineMonth]) matchesByMonth[lineMonth] = { txnIds: [], postingIds: [] };
  matchesByMonth[lineMonth].txnIds.push(txnId);
  matchesByMonth[lineMonth].postingIds.push(matchPosting.id);
  console.log(`  Plan match: CSV[${i}] txn=${txnId} ↔ posting=${matchPosting.id} (amount=${csvAmount}) → recon ${lineMonth}`);
}

// Fire ONE batch match per month (saves L-P calls vs individual matching)
const batchMonths = Object.keys(matchesByMonth);
console.log(`\nFiring ${batchMonths.length} batch match(es) for ${Object.values(matchesByMonth).reduce((s, m) => s + m.txnIds.length, 0)} total pairs...`);
const batchResults = await Promise.all(
  batchMonths.map(m => post("bank/reconciliation/match", {
    bankReconciliation: { id: reconByMonth[m].id },
    transactions: matchesByMonth[m].txnIds.map(id => ({ id })),
    postings: matchesByMonth[m].postingIds.map(id => ({ id })),
  }))
);
const batchOk = batchResults.filter(r => r?.value).length;
const batchFail = batchResults.length - batchOk;
console.log(`Batch matched: ${batchOk}/${batchMonths.length} batches OK, ${batchFail} failed`);

// If any batch failed, fall back to individual matches for that month
for (let i = 0; i < batchMonths.length; i++) {
  if (!batchResults[i]?.value) {
    const m = batchMonths[i];
    console.log(`  Batch for ${m} failed — falling back to individual matches`);
    const { txnIds, postingIds } = matchesByMonth[m];
    for (let j = 0; j < txnIds.length; j++) {
      const r = await post("bank/reconciliation/match", {
        bankReconciliation: { id: reconByMonth[m].id },
        transactions: [{ id: txnIds[j] }],
        postings: [{ id: postingIds[j] }],
      });
      console.log(`    Individual match txn=${txnIds[j]} ↔ posting=${postingIds[j]}: ${r?.value ? "OK" : "FAIL"}`);
    }
  }
}

// Verify: GET each recon to see match count
console.log(`\n  --- Verifying recon match counts ---`);
for (const m of months) {
  const recon = reconByMonth[m];
  if (!recon) continue;
  const rv = await get(`bank/reconciliation/${recon.id}?fields=*`);
  const r = rv?.value;
  if (r) {
    console.log(`  Recon ${m} (id=${r.id}): isClosed=${r.isClosed} closingBal=${r.bankAccountClosingBalanceCurrency} v=${r.version}`);
  }
}

// ── STEP 8: Close each reconciliation ──

console.log(`\n=== STEP 8: Close reconciliations ===`);

// Compute per-month closing balance from CSV saldo
const monthClosingBalance: Record<string, number> = {};
for (const line of csvLines) {
  const m = line.date.substring(0, 7);
  monthClosingBalance[m] = Math.round(line.saldo * 100) / 100;
}
for (const m of months) {
  console.log(`  ${m} closing balance from CSV: ${monthClosingBalance[m]}`);
}

// Close recons in chronological order
const closeResults: { m: string; bal: number; ok: boolean; recon: any }[] = [];
for (const m of months.sort()) {
  const recon = reconByMonth[m];
  if (!recon) continue;
  const bal = monthClosingBalance[m];
  const cr = await put(`bank/reconciliation/${recon.id}`, {
    id: recon.id, version: recon.version,
    account: { id: acctMap[1920] }, accountingPeriod: { id: periodMap[m].id },
    type: "MANUAL", bankAccountClosingBalanceCurrency: bal, isClosed: true,
  });
  closeResults.push({ m, bal, ok: !!cr?.value, recon });
}

// Sequential fallback for any that failed (balance sheet read needed)
for (const r of closeResults) {
  if (r.ok) {
    console.log(`Close recon ${r.m}: OK (bal=${r.bal})`);
  } else {
    console.log(`Close recon ${r.m}: FAILED with CSV bal=${r.bal}, trying balance sheet fallback...`);
    const periodEnd = periodMap[r.m]?.end || `${r.m}-28`;
    const endDate = (() => { const d = new Date(periodEnd); d.setDate(d.getDate() - 1); return d.toISOString().split("T")[0]; })();
    const bsRes = await get(`balanceSheet?dateFrom=${r.m}-01&dateTo=${endDate}&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*`);
    const actualBal = bsRes?.values?.[0]?.balanceOut;
    console.log(`  Balance sheet 1920 for ${r.m}: ${actualBal}`);
    if (actualBal !== undefined) {
      const fresh2 = await get(`bank/reconciliation/${r.recon.id}?fields=*`);
      const cr2 = await put(`bank/reconciliation/${r.recon.id}`, {
        id: r.recon.id, version: fresh2.value.version,
        account: { id: acctMap[1920] }, accountingPeriod: { id: periodMap[r.m].id },
        type: "MANUAL", bankAccountClosingBalanceCurrency: Math.round(actualBal * 100) / 100, isClosed: true,
      });
      console.log(`  Fallback close ${r.m}: ${cr2?.value ? "OK" : "FAIL"} (bal=${actualBal})`);
    }
  }
}

// Final verification: GET all recons to confirm closed state
console.log(`\n=== FINAL VERIFICATION ===`);
for (const m of months) {
  const recon = reconByMonth[m];
  if (!recon) continue;
  const rv = await get(`bank/reconciliation/${recon.id}?fields=*`);
  const r = rv?.value;
  if (r) {
    console.log(`Recon ${m} (id=${r.id}): isClosed=${r.isClosed} closingBal=${r.bankAccountClosingBalanceCurrency} v=${r.version}`);
  }
}

// Also verify the bank statement is still intact
const finalBs = await get(`bank/statement/${bankStatementId}?fields=*`);
console.log(`Bank statement ${bankStatementId}: exists=${!!finalBs?.value}`);

console.log(`\n=== DONE ===`);
console.log(`Mutating calls: ${mutateCount} (scored) | GET calls: ${getCount} (free) | Total: ${mutateCount + getCount} | Errors: ${errorCount}`);
