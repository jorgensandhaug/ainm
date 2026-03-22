/**
 * 112-task23-production-shaped-e2e.ts
 *
 * Tests the full 9-step bank reconciliation flow using the EXACT CSV shape
 * from production run 4edaedea (English names, 10 lines, negative Ut values).
 *
 * Creates matching customers/invoices/suppliers, then runs the full flow,
 * then verifies ALL fields on the resulting reconciliation, transactions,
 * and matches.
 *
 * Usage: npx tsx sandbox-investigation/112-task23-production-shaped-e2e.ts [YYYY-MM]
 */

const TEST_MONTH = process.argv[2] || "2027-08";
const [TEST_YEAR, TEST_MON] = TEST_MONTH.split("-").map(Number);
const FIRST_DAY = `${TEST_MONTH}-01`;
const nextMon = TEST_MON === 12 ? 1 : TEST_MON + 1;
const nextYear = TEST_MON === 12 ? TEST_YEAR + 1 : TEST_YEAR;
const NEXT_MONTH_FIRST = `${nextYear}-${String(nextMon).padStart(2, "0")}-01`;

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");

let callCount = 0;
let errorCount = 0;

async function api(
  method: string,
  path: string,
  body?: any,
): Promise<{ status: number; data: any }> {
  const url = `${BASE}/${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (body && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const opts: RequestInit = { method, headers };
  if (body)
    opts.body = body instanceof FormData ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  callCount++;
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (res.status >= 400) {
    errorCount++;
    console.log(
      `  ✗ ${method} ${path}: ${res.status} ${JSON.stringify(json).slice(0, 400)}`,
    );
  }
  return { status: res.status, data: json };
}

// ================================================================
// PRODUCTION CSV (from run 4edaedea, exact format)
// Note: Ut values are NEGATIVE in production CSVs
// ================================================================

const PRODUCTION_CSV = `Dato;Forklaring;Inn;Ut;Saldo
2026-01-17;Innbetaling fra Lewis Ltd / Faktura 1001;2312.50;;102312.50
2026-01-19;Innbetaling fra Johnson Ltd / Faktura 1002;6312.50;;108625.00
2026-01-22;Innbetaling fra Brown Ltd / Faktura 1003;8250.00;;116875.00
2026-01-24;Innbetaling fra Wilson Ltd / Faktura 1004;5062.50;;121937.50
2026-01-26;Innbetaling fra Lewis Ltd / Faktura 1005;23562.50;;145500.00
2026-01-27;Betaling Supplier Smith Ltd;;-11600.00;133900.00
2026-01-30;Betaling Supplier Lewis Ltd;;-7050.00;126850.00
2026-02-01;Betaling Supplier Lewis Ltd;;-8100.00;118750.00
2026-02-02;Bankgebyr;1762.74;;120512.74
2026-02-04;Skattetrekk;982.45;;121495.19`;

// ================================================================
// PARSE CSV (exactly as the agent would)
// ================================================================

interface CsvLine {
  date: string;
  desc: string;
  inn: number;
  ut: number; // NEGATIVE for outgoing (raw from CSV)
  saldo: number;
}

function parseCsv(csv: string): CsvLine[] {
  const rows = csv.trim().split("\n").slice(1); // skip header
  return rows.map((row) => {
    const parts = row.split(";");
    return {
      date: parts[0],
      desc: parts[1],
      inn: parseFloat(parts[2]) || 0,
      ut: parseFloat(parts[3]) || 0, // NEGATIVE values preserved
      saldo: parseFloat(parts[4]),
    };
  });
}

// ================================================================
// SETUP: Create matching customers, invoices, suppliers
// ================================================================

async function setup(csvLines: CsvLine[]) {
  const TAG = Date.now().toString(36);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`SETUP: Create test data matching production CSV (tag=${TAG})`);
  console.log(`${"=".repeat(60)}\n`);

  // Remap dates to our test month
  // Production dates: 2026-01-17 to 2026-02-04
  // Map to: TEST_MONTH-05 to TEST_MONTH+1-04
  const dateMap: Record<string, string> = {};
  const origDates = csvLines.map((l) => l.date);
  const uniqueDates = [...new Set(origDates)].sort();
  let day = 5;
  for (const d of uniqueDates) {
    if (day > 28) day = 5; // wrap around if needed
    dateMap[d] = `${TEST_MONTH}-${String(day).padStart(2, "0")}`;
    day += 2;
  }

  // Remap CSV lines
  const remappedLines = csvLines.map((l) => ({
    ...l,
    date: dateMap[l.date],
  }));

  console.log("Date mapping:");
  for (const [orig, mapped] of Object.entries(dateMap)) {
    console.log(`  ${orig} → ${mapped}`);
  }

  // Identify unique customers and their invoices
  // From the CSV: Lewis (2 invoices: 4625 outstanding with partial 2312.50, and 23562.50)
  // Johnson: 6312.50, Brown: 8250, Wilson: 5062.50
  const customerInvoices = [
    { name: `Lewis ${TAG} Ltd`, outstanding: 4625, payment: 2312.5 }, // partial
    { name: `Johnson ${TAG} Ltd`, outstanding: 6312.5, payment: 6312.5 },
    { name: `Brown ${TAG} Ltd`, outstanding: 8250, payment: 8250 },
    { name: `Wilson ${TAG} Ltd`, outstanding: 5062.5, payment: 5062.5 },
    { name: `Lewis ${TAG} Ltd`, outstanding: 23562.5, payment: 23562.5 }, // same Lewis, 2nd invoice
  ];

  // Create customers (Lewis only once)
  const customerIds: Record<string, number> = {};
  for (const ci of customerInvoices) {
    if (customerIds[ci.name]) continue;
    const res = await api("POST", "customer", {
      name: ci.name,
      isCustomer: true,
      email: `${TAG}@example.com`,
    });
    if (res.status >= 400) return null;
    customerIds[ci.name] = res.data.value.id;
    console.log(`  Customer: ${ci.name} → id=${res.data.value.id}`);
  }

  // Create invoices (order → invoice, with amounts matching outstanding)
  const invoices: Array<{
    id: number;
    invoiceNumber: number;
    outstanding: number;
    customerName: string;
  }> = [];

  for (const ci of customerInvoices) {
    const orderRes = await api("POST", "order", {
      customer: { id: customerIds[ci.name] },
      deliveryDate: FIRST_DAY,
      orderDate: FIRST_DAY,
      orderLines: [
        {
          description: "Service",
          count: 1,
          unitPriceExcludingVatCurrency: ci.outstanding,
        },
      ],
    });
    if (orderRes.status >= 400) return null;

    const invRes = await api(
      "PUT",
      `order/${orderRes.data.value.id}/:invoice?invoiceDate=${TEST_MONTH}-02&sendToCustomer=false`,
    );
    if (invRes.status >= 400) return null;

    const det = (
      await api(
        "GET",
        `invoice/${invRes.data.value.id}?fields=id,invoiceNumber,amountCurrency,amountCurrencyOutstanding,customer(name)`,
      )
    ).data.value;
    invoices.push({
      id: det.id,
      invoiceNumber: det.invoiceNumber,
      outstanding: det.amountCurrencyOutstanding,
      customerName: det.customer.name,
    });
    console.log(
      `  Invoice #${det.invoiceNumber}: outstanding=${det.amountCurrencyOutstanding} for ${det.customer.name}`,
    );
  }

  // Create suppliers
  // Smith Ltd: 1 payment (11600)
  // Lewis Ltd: 2 payments (7050 + 8100) — SAME name as customer!
  const supplierNames = [
    `Smith ${TAG} Ltd`,
    `Lewis ${TAG} Ltd`, // deliberately same as customer
  ];
  const supplierIds: Record<string, number> = {};
  for (const name of supplierNames) {
    const res = await api("POST", "supplier", {
      name,
      isSupplier: true,
      email: `sup-${TAG}@example.com`,
    });
    if (res.status >= 400) return null;
    supplierIds[name] = res.data.value.id;
    console.log(`  Supplier: ${name} → id=${res.data.value.id}`);
  }

  // Remap CSV descriptions to use our tagged names
  const finalLines = remappedLines.map((l) => {
    let desc = l.desc;
    desc = desc.replace("Lewis Ltd", `Lewis ${TAG} Ltd`);
    desc = desc.replace("Johnson Ltd", `Johnson ${TAG} Ltd`);
    desc = desc.replace("Brown Ltd", `Brown ${TAG} Ltd`);
    desc = desc.replace("Wilson Ltd", `Wilson ${TAG} Ltd`);
    desc = desc.replace("Smith Ltd", `Smith ${TAG} Ltd`);
    return { ...l, desc };
  });

  // Recompute saldo with new amounts (amounts are the same, just names changed)
  // Actually amounts are the same, so saldo doesn't change

  return {
    csvLines: finalLines,
    customerIds,
    supplierIds,
    invoices,
    tag: TAG,
  };
}

// ================================================================
// FULL 9-STEP FLOW
// ================================================================

async function runFlow(
  setupData: NonNullable<Awaited<ReturnType<typeof setup>>>,
) {
  const { csvLines, customerIds, supplierIds, invoices, tag } = setupData;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`FULL 9-STEP FLOW`);
  console.log(`${"=".repeat(60)}\n`);

  const flowStart = callCount;

  // ---- Compute opening/closing balance ----
  const openingBalance =
    csvLines[0].saldo - csvLines[0].inn + Math.abs(csvLines[0].ut);
  const closingBalance = Math.round(csvLines[csvLines.length - 1].saldo * 100) / 100;
  console.log(`Opening balance: ${openingBalance}`);
  console.log(`Closing balance (CSV): ${closingBalance}`);

  // ---- STEP 1: 6 parallel reads ----
  console.log("\n── Step 1: 6 parallel reads ──");
  const [invRes, ptRes, supRes, sinvRes, acctRes, periodRes] =
    await Promise.all([
      api("GET", "invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
      api("GET", "invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
      api("GET", "supplier?count=1000&fields=*"),
      api("GET", "supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
      api("GET", "ledger/account?number=1920,2050,2400,2600,7770,8050&fields=*"),
      api("GET", `ledger/accountingPeriod?startFrom=${FIRST_DAY}&startTo=${TEST_MONTH}-02&count=1&fields=*`),
    ]);

  const allInvoices = (invRes.data.values || []).filter(
    (i: any) => (i.amountCurrencyOutstanding || 0) > 0,
  );
  const paymentType = (ptRes.data.values || []).find(
    (pt: any) => pt.debitAccount?.number === 1920,
  );
  const allSuppliers = supRes.data.values || [];
  const accounts: Record<number, number> = {};
  for (const a of acctRes.data.values || []) accounts[a.number] = a.id;
  const period = (periodRes.data.values || [])[0];

  console.log(`  Open invoices: ${allInvoices.length}, payment type: ${paymentType?.id}`);
  console.log(`  Accounts: ${Object.entries(accounts).map(([n, id]) => `${n}=${id}`).join(", ")}`);
  console.log(`  Period: ${period?.id} (${period?.start} to ${period?.end})`);

  // ---- STEP 0: Opening balance ----
  console.log("\n── Step 0: Opening balance voucher ──");
  const obRes = await api("POST", "ledger/voucher", {
    date: csvLines[0].date,
    description: "Inngående balanse",
    postings: [
      {
        row: 1, date: csvLines[0].date, description: "Inngående balanse",
        account: { id: accounts[1920] },
        amount: openingBalance, amountCurrency: openingBalance,
        amountGross: openingBalance, amountGrossCurrency: openingBalance,
        currency: { id: 1 },
      },
      {
        row: 2, date: csvLines[0].date, description: "Inngående balanse",
        account: { id: accounts[2050] },
        amount: -openingBalance, amountCurrency: -openingBalance,
        amountGross: -openingBalance, amountGrossCurrency: -openingBalance,
        currency: { id: 1 },
      },
    ],
  });
  console.log(`  ${obRes.status} (voucher id=${obRes.data?.value?.id})`);
  if (obRes.status >= 400) return null;

  // ---- STEP 3: Customer payments ----
  console.log("\n── Step 3: Customer payments ──");
  const outstandingTracker = new Map<number, number>();
  for (const inv of allInvoices) {
    outstandingTracker.set(inv.id, inv.amountCurrencyOutstanding);
  }

  // Only process Inn lines (customer incoming payments)
  const custLines = csvLines.filter((l) => l.inn > 0 && l.desc.includes("Innbetaling"));

  for (const cl of custLines) {
    // Extract customer name from desc
    const nameMatch = cl.desc.match(/fra\s+(.+?)\s*\/\s*Faktura/i);
    const searchName = nameMatch ? nameMatch[1].toLowerCase() : cl.desc.toLowerCase();

    const candidates = allInvoices.filter((inv: any) => {
      const custName = (inv.customer?.name || "").toLowerCase();
      return custName.includes(searchName) || searchName.includes(custName);
    });

    let bestMatch: any = null;
    let bestDiff = Infinity;
    for (const inv of candidates) {
      const outstanding = outstandingTracker.get(inv.id) || 0;
      if (outstanding <= 0) continue;
      const diff = Math.abs(outstanding - cl.inn);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestMatch = inv;
      }
    }

    if (!bestMatch) {
      console.error(`  NO MATCH: "${searchName}" amount=${cl.inn}`);
      continue;
    }

    const outstanding = outstandingTracker.get(bestMatch.id) || 0;
    const payAmount = Math.min(cl.inn, outstanding);
    const isPartial = payAmount < outstanding;

    const payRes = await api(
      "PUT",
      `invoice/${bestMatch.id}/:payment?paymentDate=${cl.date}&paymentTypeId=${paymentType.id}&paidAmount=${payAmount}`,
    );
    console.log(
      `  Pay #${bestMatch.invoiceNumber}: ${payAmount}/${outstanding}${isPartial ? " PARTIAL" : " FULL"} → ${payRes.status}`,
    );
    outstandingTracker.set(bestMatch.id, outstanding - payAmount);
  }

  // ---- STEPS 4+5: Combined voucher ----
  console.log("\n── Steps 4+5: Combined voucher ──");
  const voucherPostings: any[] = [];
  let row = 1;

  // Supplier outgoing lines (Ut < 0)
  const supLines = csvLines.filter((l) => l.ut < 0 && l.desc.includes("Betaling"));
  for (const sl of supLines) {
    const absAmount = Math.abs(sl.ut);
    // Extract supplier name
    const nameMatch = sl.desc.match(/(?:Supplier|Leverandor|Leverandør|Fornecedor|Proveedor)\s+(.+)/i);
    const searchName = nameMatch ? nameMatch[1].toLowerCase() : "";

    const supplier = allSuppliers.find((s: any) => {
      return s.name.toLowerCase().includes(searchName) || searchName.includes(s.name.toLowerCase());
    });

    if (!supplier) {
      console.error(`  No supplier match: "${searchName}" from "${sl.desc}"`);
      continue;
    }

    voucherPostings.push(
      {
        row: row++, date: sl.date, description: `Betaling ${supplier.name}`,
        account: { id: accounts[2400] }, supplier: { id: supplier.id },
        amount: absAmount, amountCurrency: absAmount,
        amountGross: absAmount, amountGrossCurrency: absAmount,
      },
      {
        row: row++, date: sl.date, description: `Betaling ${supplier.name}`,
        account: { id: accounts[1920] },
        amount: -absAmount, amountCurrency: -absAmount,
        amountGross: -absAmount, amountGrossCurrency: -absAmount,
      },
    );
    console.log(`  Supplier: ${supplier.name} → -${absAmount}`);
  }

  // Non-invoice lines
  const nonInvLines = csvLines.filter(
    (l) =>
      !l.desc.includes("Innbetaling") && !l.desc.includes("Betaling"),
  );

  for (const nl of nonInvLines) {
    const isIncoming = nl.inn > 0;
    const absAmount = isIncoming ? nl.inn : Math.abs(nl.ut);
    const desc = nl.desc.trim();

    // Determine contra account
    let contraAcct: number;
    if (desc.toLowerCase().includes("bankgebyr")) contraAcct = accounts[7770];
    else if (desc.toLowerCase().includes("renteinntekter")) contraAcct = accounts[8050];
    else if (desc.toLowerCase().includes("skattetrekk")) contraAcct = accounts[2600];
    else {
      console.error(`  Unknown non-invoice: "${desc}"`);
      contraAcct = accounts[8050]; // fallback
    }

    if (isIncoming) {
      // Inn: debit 1920, credit contra
      voucherPostings.push(
        {
          row: row++, date: nl.date, description: desc,
          account: { id: accounts[1920] },
          amount: absAmount, amountCurrency: absAmount,
          amountGross: absAmount, amountGrossCurrency: absAmount,
        },
        {
          row: row++, date: nl.date, description: desc,
          account: { id: contraAcct },
          amount: -absAmount, amountCurrency: -absAmount,
          amountGross: -absAmount, amountGrossCurrency: -absAmount,
        },
      );
    } else {
      // Ut: debit contra, credit 1920
      voucherPostings.push(
        {
          row: row++, date: nl.date, description: desc,
          account: { id: contraAcct },
          amount: absAmount, amountCurrency: absAmount,
          amountGross: absAmount, amountGrossCurrency: absAmount,
        },
        {
          row: row++, date: nl.date, description: desc,
          account: { id: accounts[1920] },
          amount: -absAmount, amountCurrency: -absAmount,
          amountGross: -absAmount, amountGrossCurrency: -absAmount,
        },
      );
    }
    console.log(`  Non-invoice: ${desc} ${isIncoming ? "+" : "-"}${absAmount} (${isIncoming ? "Inn" : "Ut"})`);
  }

  const vRes = await api("POST", "ledger/voucher", {
    date: csvLines[5].date, // first supplier date
    description: "Bank reconciliation - supplier payments and non-invoice",
    postings: voucherPostings,
  });
  console.log(`  Voucher: ${vRes.status} (id=${vRes.data?.value?.id}, ${voucherPostings.length} postings)`);
  if (vRes.status >= 400) return null;

  // ---- STEP 6: Bank statement import ----
  console.log("\n── Step 6: Bank statement import ──");

  // Build SBANKEN_BEDRIFT_CSV
  const firstDate = csvLines[0].date.split("-").reverse().join(".");
  const lastDate = csvLines[csvLines.length - 1].date.split("-").reverse().join(".");
  const fmt = (n: number) => n.toFixed(2).replace(".", ",");

  let sbankenCsv = `"Inngående saldo ${firstDate}";"${fmt(openingBalance)}"\n`;
  sbankenCsv += `"Utgående saldo ${lastDate}";"${fmt(closingBalance)}"\n`;
  sbankenCsv += `"Bokført";"Rentedato";"Beskrivelse";"Beløp"\n`;
  for (const l of csvLines) {
    const d = l.date.split("-").reverse().join(".");
    // CRITICAL: correct sign handling
    // Inn > 0 → positive amount; Ut < 0 → use ut directly (already negative)
    const amount = l.inn > 0 ? l.inn : l.ut;
    sbankenCsv += `"${d}";"${d}";"${l.desc}";"${fmt(amount)}"\n`;
  }

  console.log("  Sbanken CSV:");
  for (const line of sbankenCsv.split("\n")) {
    console.log(`    ${line}`);
  }

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([sbankenCsv], { type: "text/csv" }),
    "bankstatement.csv",
  );

  const dayAfter = new Date(csvLines[csvLines.length - 1].date);
  dayAfter.setDate(dayAfter.getDate() + 1);
  const dayAfterStr = dayAfter.toISOString().split("T")[0];

  const importRes = await api(
    "POST",
    `bank/statement/import?bankId=112&accountId=${accounts[1920]}&fromDate=${csvLines[0].date}&toDate=${dayAfterStr}&fileFormat=SBANKEN_BEDRIFT_CSV`,
    formData,
  );

  if (importRes.status >= 400) {
    console.error("IMPORT FAILED — this is the critical step");
    // Try with the OLD formula to compare
    console.log("\n  Retrying with OLD formula (negate ut)...");
    let sbankenCsv2 = `"Inngående saldo ${firstDate}";"${fmt(openingBalance)}"\n`;
    sbankenCsv2 += `"Utgående saldo ${lastDate}";"${fmt(closingBalance)}"\n`;
    sbankenCsv2 += `"Bokført";"Rentedato";"Beskrivelse";"Beløp"\n`;
    for (const l of csvLines) {
      const d = l.date.split("-").reverse().join(".");
      const amount = l.inn > 0 ? l.inn : -l.ut; // OLD: negate ut
      sbankenCsv2 += `"${d}";"${d}";"${l.desc}";"${fmt(amount)}"\n`;
    }
    console.log("  OLD Sbanken CSV:");
    for (const line of sbankenCsv2.split("\n")) {
      console.log(`    ${line}`);
    }
    const formData2 = new FormData();
    formData2.append("file", new Blob([sbankenCsv2], { type: "text/csv" }), "bankstatement.csv");
    const importRes2 = await api(
      "POST",
      `bank/statement/import?bankId=112&accountId=${accounts[1920]}&fromDate=${csvLines[0].date}&toDate=${dayAfterStr}&fileFormat=SBANKEN_BEDRIFT_CSV`,
      formData2,
    );
    if (importRes2.status >= 400) {
      console.error("BOTH FORMULAS FAILED");
      return null;
    }
    // Use the old formula result
    console.log("  OLD FORMULA SUCCEEDED — the old formula was correct!");
    return await continueFlow(importRes2, csvLines, accounts, period, closingBalance);
  }

  return await continueFlow(importRes, csvLines, accounts, period, closingBalance);
}

async function continueFlow(
  importRes: { status: number; data: any },
  csvLines: CsvLine[],
  accounts: Record<number, number>,
  period: any,
  closingBalance: number,
) {
  const bankStatement = importRes.data.value;
  console.log(`  Import OK: statement id=${bankStatement.id}`);

  // ---- Fetch bank txn details ----
  const txnRes = await api(
    "GET",
    `bank/statement/transaction?bankStatementId=${bankStatement.id}&count=1000&fields=id,postedDate,amountCurrency,description`,
  );
  const bankTxns = txnRes.data.values || [];
  console.log(`  ${bankTxns.length} transactions:`);
  for (const t of bankTxns) {
    console.log(
      `    txn ${t.id}: amount=${t.amountCurrency} "${(t.description || "").slice(0, 50)}"`,
    );
  }

  // ---- STEP 7: Matching ----
  console.log("\n── Step 7: Match bank txns to postings ──");

  const postingsRes = await api(
    "GET",
    `ledger/posting?accountId=${accounts[1920]}&dateFrom=${csvLines[0].date}&dateTo=${NEXT_MONTH_FIRST}&count=1000&fields=id,date,amount,description`,
  );
  const allPostings1920 = postingsRes.data.values || [];
  console.log(`  1920 postings: ${allPostings1920.length}`);
  for (const p of allPostings1920) {
    console.log(`    posting ${p.id}: amount=${p.amount} "${(p.description || "").slice(0, 50)}"`);
  }

  // Create OPEN recon
  const createReconRes = await api("POST", "bank/reconciliation", {
    account: { id: accounts[1920] },
    accountingPeriod: { id: period.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: 0,
    isClosed: false,
  });
  const recon = createReconRes.data?.value;
  if (!recon?.id) { console.error("Failed to create recon"); return null; }
  console.log(`  Created recon: id=${recon.id}`);

  // Match
  const usedPostingIds = new Set<number>();
  let matchCount = 0;
  for (const txn of bankTxns) {
    const matchPosting = allPostings1920.find(
      (p: any) =>
        Math.abs(p.amount - txn.amountCurrency) < 0.01 &&
        !usedPostingIds.has(p.id),
    );

    if (matchPosting) {
      usedPostingIds.add(matchPosting.id);
      const mr = await api("POST", "bank/reconciliation/match", {
        bankReconciliation: { id: recon.id },
        transactions: [{ id: txn.id }],
        postings: [{ id: matchPosting.id }],
      });
      if (mr.status < 400) {
        matchCount++;
        console.log(`  ✓ txn ${txn.id} (${txn.amountCurrency}) ↔ posting ${matchPosting.id} (${matchPosting.amount})`);
      }
    } else {
      console.error(`  ✗ NO POSTING for txn ${txn.id} (amount=${txn.amountCurrency})`);
      const available = allPostings1920.filter((p: any) => !usedPostingIds.has(p.id));
      console.error(`    Available: ${available.map((p: any) => `${p.amount}`).join(", ")}`);
    }
  }
  console.log(`\n  Matched: ${matchCount}/${bankTxns.length}`);

  // ---- STEP 8: Close ----
  console.log("\n── Step 8: Close reconciliation ──");
  const freshRecon = await api("GET", `bank/reconciliation/${recon.id}?fields=*`);
  const version = freshRecon.data?.value?.version;

  // Check actual balance
  const bsRes = await api(
    "GET",
    `balanceSheet?dateFrom=${FIRST_DAY}&dateTo=${NEXT_MONTH_FIRST}&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*`,
  );
  const actualBalance = bsRes.data?.values?.[0]?.balanceOut;
  console.log(`  Actual 1920 balance: ${actualBalance}`);
  console.log(`  CSV closing: ${closingBalance}`);

  const closeBalance = Math.round((actualBalance || closingBalance) * 100) / 100;

  const closeRes = await api("PUT", `bank/reconciliation/${recon.id}`, {
    id: recon.id,
    version,
    account: { id: accounts[1920] },
    accountingPeriod: { id: period.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: closeBalance,
    isClosed: true,
  });
  console.log(`  Close: ${closeRes.status}`);

  const flowCalls = callCount - 0; // approximate
  console.log(`\n  Flow errors: ${errorCount}`);

  return { recon, bankStatement, matchCount, totalTxns: bankTxns.length, accounts, period, closeBalance };
}

// ================================================================
// DEEP VERIFICATION
// ================================================================

async function deepVerify(result: any) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`DEEP VERIFICATION — Check all fields`);
  console.log(`${"=".repeat(60)}\n`);

  if (!result) {
    console.log("SKIP: flow failed");
    return;
  }

  // 1. Full reconciliation object
  console.log("── Reconciliation object ──");
  const reconRes = await api("GET", `bank/reconciliation/${result.recon.id}?fields=*`);
  const recon = reconRes.data?.value;
  console.log(JSON.stringify(recon, null, 2));

  // 2. All bank statement transactions with ALL fields
  console.log("\n── Bank statement transactions ──");
  const txnRes = await api(
    "GET",
    `bank/statement/transaction?bankStatementId=${result.bankStatement.id}&count=100&fields=*`,
  );
  for (const t of txnRes.data.values || []) {
    console.log(JSON.stringify(t, null, 2));
  }

  // 3. All matches
  console.log("\n── Reconciliation matches ──");
  const matchRes = await api(
    "GET",
    `bank/reconciliation/match?bankReconciliationId=${result.recon.id}&count=100&fields=*`,
  );
  for (const m of matchRes.data.values || []) {
    console.log(JSON.stringify(m, null, 2));
  }

  // 4. Bank statement object itself
  console.log("\n── Bank statement object ──");
  const stmtRes = await api("GET", `bank/statement/${result.bankStatement.id}?fields=*`);
  console.log(JSON.stringify(stmtRes.data?.value, null, 2));

  // Summary
  const txns = txnRes.data.values || [];
  const matches = matchRes.data.values || [];
  const allMatched = txns.length > 0 && txns.every((t: any) => t.matched);

  console.log(`\n${"=".repeat(60)}`);
  console.log("SUMMARY:");
  console.log(`  Recon closed: ${recon?.isClosed}`);
  console.log(`  Recon balance: ${recon?.bankAccountClosingBalanceCurrency}`);
  console.log(`  Txns: ${txns.length}, all matched: ${allMatched}`);
  console.log(`  Matches: ${matches.length}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Total API calls: ${callCount}`);
  console.log(`${"=".repeat(60)}`);
}

// ================================================================
// MAIN
// ================================================================

async function main() {
  const csvLines = parseCsv(PRODUCTION_CSV);
  console.log(`Parsed ${csvLines.length} CSV lines`);
  console.log(`  Ut values: ${csvLines.filter(l => l.ut !== 0).map(l => l.ut).join(", ")}`);
  console.log(`  (Note: Ut values are NEGATIVE in production CSVs)`);

  const setupData = await setup(csvLines);
  if (!setupData) { console.error("SETUP FAILED"); process.exit(1); }

  const result = await runFlow(setupData);
  await deepVerify(result);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
